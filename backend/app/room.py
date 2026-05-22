import asyncio
import json
import uuid
from dataclasses import dataclass, field
from enum import Enum
from fastapi import WebSocket
from typing import TYPE_CHECKING, Optional
from app import sheets
if TYPE_CHECKING:
    from app.game import Game


# Maximum allowed amount for any money field (buy-in, offer price, …).
MAX_MONEY = 1000.0


class Phase(str, Enum):
    IDLE        = "idle"
    IN_GAME     = "in_game"
    INTER_ROUND = "inter_round"


class Role(str, Enum):
    WAITING   = "waiting"
    PLAYING   = "playing"
    SPECTATOR = "spectator"


@dataclass
class Connection:
    websocket: WebSocket
    nickname:  str
    role:      Role
    ready:     bool = False   # lobby ready OR inter-round ready


@dataclass
class LifeOffer:
    id:          str
    from_nick:   str
    offer_type:  str           # public_sell | public_buy | direct_sell | direct_buy
    amount:      int           # number of lives
    price:       float         # total price in S/.
    target_nick: Optional[str] # only for private offers
    # Unix timestamp (seconds) when the offer auto-expires.
    expires_at:  float = 0.0
    # emoji -> set of nicknames that reacted with it
    reactions:   dict[str, set[str]] = field(default_factory=dict)

    def toggle_reaction(self, emoji: str, nickname: str) -> None:
        """Add the reaction if absent, remove it if already present."""
        users = self.reactions.setdefault(emoji, set())
        if nickname in users:
            users.discard(nickname)
            if not users:
                del self.reactions[emoji]
        else:
            users.add(nickname)


@dataclass
class FinalDeal:
    proposer:    str
    my_share:    float
    pot:         float


class GameReport:
    def __init__(self, round_count: int, players: list[str],
                 final_balances: dict[str, float], winner: Optional[str]):
        self.id            = str(uuid.uuid4())[:8]
        self.round_count   = round_count
        self.players       = players
        self.final_balances = final_balances
        self.winner        = winner

    def to_dict(self) -> dict:
        return {
            "id":              self.id,
            "round_count":     self.round_count,
            "players":         self.players,
            "final_balances":  self.final_balances,
            "winner":          self.winner,
        }


class GameSession:
    """Tracks lives, balances and pot across rounds."""

    def __init__(self, players: list[str], buy_in: float, max_lives: int):
        self.buy_in      = buy_in
        self.max_lives   = max_lives
        self.pot: float  = round(buy_in * len(players), 2)
        self.lives:    dict[str, int]   = {p: max_lives for p in players}
        self.balances: dict[str, float] = {p: round(-buy_in, 2) for p in players}
        self.round_number: int = 1
        self.last_round_winner: Optional[str] = None
        # Fixed clockwise seating, set once in round 1 (by high card) and
        # kept for the whole session. Includes every player — eliminated
        # ones keep their seat in case they buy a life back. Only "who
        # starts" changes round to round, never the relative order.
        self.seat_order: list[str] = list(players)
        # inter-round state
        self.life_offers:   dict[str, LifeOffer] = {}
        self.final_deal:    Optional[FinalDeal]  = None
        self.inter_ready:   set[str]             = set()
        # showdown phase
        self.revealed_hands: dict[str, list[dict]] = {}  # nick → cards revealed voluntarily
        self.losers:         list[str] = []

    @property
    def alive_players(self) -> list[str]:
        return [p for p, v in self.lives.items() if v > 0]

    def apply_life_loss(self, losers: list[str]) -> None:
        self.losers = losers
        for nick in losers:
            if nick in self.lives:
                self.lives[nick] = max(0, self.lives[nick] - 1)

    def apply_life_trade(self, seller: str, buyer: str,
                         amount: int, price: float) -> tuple[bool, str]:
        seller_lives = self.lives.get(seller, 0)
        buyer_lives  = self.lives.get(buyer, 0)
        if seller_lives < amount:
            return False, f"{seller} no tiene suficientes vidas para vender."
        if buyer_lives + amount > self.max_lives:
            return False, f"{buyer} superaría el máximo de vidas ({self.max_lives})."
        self.lives[seller]    -= amount
        self.lives[buyer]     += amount
        self.balances[seller]  = round(self.balances[seller] + price, 2)
        self.balances[buyer]   = round(self.balances[buyer]  - price, 2)
        return True, ""

    def apply_final_deal(self, proposer: str, other: str,
                         proposer_share: float) -> None:
        other_share = round(self.pot - proposer_share, 2)
        self.balances[proposer] = round(self.balances[proposer] + proposer_share, 2)
        self.balances[other]    = round(self.balances[other]    + other_share,    2)
        self.pot = 0.0

    def record_round_winner(self, winner: str) -> None:
        """Remember who won a round (decides who starts the next one).
        Does NOT touch the pot — that is only paid out at game end."""
        self.last_round_winner = winner

    def award_winner(self, winner: str) -> None:
        """Pay the whole pot to the game's final winner."""
        self.balances[winner] = round(self.balances[winner] + self.pot, 2)
        self.last_round_winner = winner
        self.pot = 0.0

    def add_offer(self, offer: LifeOffer) -> None:
        self.life_offers[offer.id] = offer

    def remove_offer(self, offer_id: str) -> Optional[LifeOffer]:
        return self.life_offers.pop(offer_id, None)

    def begin_inter_round(self) -> None:
        self.life_offers.clear()
        self.final_deal    = None
        self.inter_ready   = set()
        self.revealed_hands = {}

    def to_dict(self) -> dict:
        return {
            "buy_in":       self.buy_in,
            "max_lives":    self.max_lives,
            "pot":          self.pot,
            "round_number": self.round_number,
            "lives":        self.lives,
            "balances":     self.balances,
            "seat_order":   self.seat_order,
            "losers":       self.losers,
            "inter_ready":  list(self.inter_ready),
            "revealed_hands": self.revealed_hands,
            "life_offers": [
                {
                    "id":          o.id,
                    "from_nick":   o.from_nick,
                    "offer_type":  o.offer_type,
                    "amount":      o.amount,
                    "price":       o.price,
                    "target_nick": o.target_nick,
                    "expires_at":  o.expires_at,
                    "reactions":   {e: sorted(u) for e, u in o.reactions.items()},
                }
                for o in self.life_offers.values()
            ],
            "final_deal": {
                "proposer":  self.final_deal.proposer,
                "my_share":  self.final_deal.my_share,
                "pot":       self.final_deal.pot,
            } if self.final_deal else None,
        }


class LobbyConfig:
    DEFAULT_BUY_IN    = 10.0
    DEFAULT_MAX_LIVES = 3

    def __init__(self):
        self.buy_in:    float = self.DEFAULT_BUY_IN
        self.max_lives: int   = self.DEFAULT_MAX_LIVES

    def update(self, buy_in: Optional[float], max_lives: Optional[int]) -> str:
        if buy_in is not None:
            if buy_in <= 0:
                return "El buy-in debe ser mayor que 0."
            if buy_in > MAX_MONEY:
                return f"El buy-in no puede superar S/. {MAX_MONEY:.2f}."
            self.buy_in = round(buy_in, 2)
        if max_lives is not None:
            if max_lives not in (1, 2, 3, 4):
                return "Las vidas deben ser 1, 2, 3 o 4."
            self.max_lives = max_lives
        return ""

    def to_dict(self) -> dict:
        return {"buy_in": self.buy_in, "max_lives": self.max_lives}


class GameRoom:
    MAX_PLAYERS = 9

    def __init__(self):
        self._connections:  dict[str, Connection] = {}
        self._disconnected: set[str]              = set()
        self.phase:   Phase            = Phase.IDLE
        self.config:  LobbyConfig      = LobbyConfig()
        self.session: Optional[GameSession] = None
        self.game:    Optional["Game"]      = None
        self.reports: list[GameReport]      = []

    # ------------------------------------------------------------------
    # Properties
    # ------------------------------------------------------------------

    @property
    def waiting(self) -> list[str]:
        return [n for n, c in self._connections.items() if c.role == Role.WAITING]

    @property
    def playing(self) -> list[str]:
        return [n for n, c in self._connections.items() if c.role == Role.PLAYING]

    @property
    def spectators(self) -> list[str]:
        return [n for n, c in self._connections.items() if c.role == Role.SPECTATOR]

    @property
    def disconnected(self) -> list[str]:
        return list(self._disconnected)

    @property
    def ready_players(self) -> list[str]:
        return [n for n, c in self._connections.items() if c.role == Role.WAITING and c.ready]

    @property
    def all_ready(self) -> bool:
        w = self.waiting
        return len(w) >= 2 and all(self._connections[n].ready for n in w)

    # ------------------------------------------------------------------
    # Connection lifecycle
    # ------------------------------------------------------------------

    def connect(self, websocket: WebSocket, nickname: str) -> tuple[bool, str]:
        if nickname in self._connections:
            return False, "El nickname ya está en uso."
        if nickname in self._disconnected:
            self._disconnected.discard(nickname)
            self._connections[nickname] = Connection(websocket, nickname, Role.PLAYING)
            return True, ""
        self._connections[nickname] = Connection(websocket, nickname, Role.SPECTATOR)
        return True, ""

    def disconnect(self, nickname: str) -> None:
        conn = self._connections.pop(nickname, None)
        if conn and conn.role == Role.PLAYING and self.phase in (Phase.IN_GAME, Phase.INTER_ROUND):
            self._disconnected.add(nickname)

    def is_reconnect(self, nickname: str) -> bool:
        conn = self._connections.get(nickname)
        return (
            conn is not None
            and conn.role == Role.PLAYING
            and self.phase in (Phase.IN_GAME, Phase.INTER_ROUND)
        )

    # ------------------------------------------------------------------
    # Lobby actions
    # ------------------------------------------------------------------

    def join(self, nickname: str) -> tuple[bool, str]:
        conn = self._connections.get(nickname)
        if conn is None:
            return False, "Conexión no encontrada."
        if self.phase != Phase.IDLE:
            return False, "La partida ya está en curso."
        if len(self.waiting) >= self.MAX_PLAYERS:
            return False, "La sala de espera está llena (máx 9 jugadores)."
        if conn.role == Role.WAITING:
            return False, "Ya estás en la lista de espera."
        conn.role  = Role.WAITING
        conn.ready = False
        return True, ""

    def leave_waiting(self, nickname: str) -> tuple[bool, str]:
        conn = self._connections.get(nickname)
        if conn is None or conn.role != Role.WAITING:
            return False, "No estás en la lista de espera."
        conn.role  = Role.SPECTATOR
        conn.ready = False
        return True, ""

    def set_config(self, buy_in: Optional[float], max_lives: Optional[int]) -> str:
        error = self.config.update(buy_in, max_lives)
        if error:
            return error
        for nick in self.waiting:
            self._connections[nick].ready = False
        return ""

    def set_ready(self, nickname: str, ready: bool) -> tuple[bool, str]:
        conn = self._connections.get(nickname)
        if conn is None or conn.role != Role.WAITING:
            return False, "Solo los jugadores en espera pueden confirmar."
        conn.ready = ready
        return True, ""

    def set_inter_ready(self, nickname: str) -> tuple[bool, str]:
        session = self.session
        if session is None or self.phase != Phase.INTER_ROUND:
            return False, "No hay fase inter-ronda activa."
        # anyone in the session (alive or eliminated) can mark ready
        if nickname not in session.lives:
            return False, "No eres parte de esta sesión."
        session.inter_ready.add(nickname)
        return True, ""

    def unset_inter_ready(self, nickname: str) -> None:
        if self.session:
            self.session.inter_ready.discard(nickname)

    def all_inter_ready(self) -> bool:
        """True once every alive, connected participant has clicked ready.

        Uses session.lives (not roles) as the source of truth: during the
        inter-round a player revived by buying a life is still flagged as a
        spectator (roles only refresh in begin_next_round), but they DO play
        the next round and so must be counted here.
        """
        if self.session is None:
            return False
        alive = set(self.session.alive_players)
        connected_alive = alive & set(self._connections.keys())
        if not connected_alive:
            return False
        return connected_alive.issubset(self.session.inter_ready)

    # ------------------------------------------------------------------
    # Game control
    # ------------------------------------------------------------------

    def start_game(self, initiator: str) -> tuple[bool, str]:
        conn = self._connections.get(initiator)
        if conn is None or conn.role != Role.WAITING:
            return False, "Solo un jugador en espera puede iniciar la partida."
        if not self.all_ready:
            return False, "Todos los jugadores deben estar listos."
        if self.phase != Phase.IDLE:
            return False, "La partida ya está en curso."
        for nickname in self.waiting:
            self._connections[nickname].role  = Role.PLAYING
            self._connections[nickname].ready = False
        self.phase = Phase.IN_GAME
        return True, ""

    def begin_session(self) -> None:
        players = self.playing
        self.session = GameSession(players, self.config.buy_in, self.config.max_lives)

    def begin_inter_round(self, losers: list[str]) -> None:
        self.phase = Phase.INTER_ROUND
        if self.session:
            self.session.apply_life_loss(losers)
            self.session.begin_inter_round()

    def begin_next_round(self, first_player_hint: Optional[str] = None) -> None:
        if self.session:
            self.session.round_number += 1
            # Recompute roles from current lives, so trades during the
            # inter-round take effect: a player who sold their last life
            # becomes a spectator, and an eliminated player who bought a
            # life back returns to playing.
            for nick, lives in self.session.lives.items():
                conn = self._connections.get(nick)
                if conn is None:
                    continue
                conn.role = Role.PLAYING if lives > 0 else Role.SPECTATOR
                if lives <= 0:
                    self._disconnected.discard(nick)
        self.phase = Phase.IN_GAME
        self.game  = None

    def end_session(self, winner: Optional[str] = None) -> Optional[GameReport]:
        """End the session and return the GameReport that was created (or None).

        Callers can take the returned report and upload it to Google Sheets
        asynchronously, keeping this method free of network/I/O concerns.
        """
        session = self.session
        report: Optional[GameReport] = None
        if session:
            report = GameReport(
                round_count     = session.round_number,
                players         = list(session.lives.keys()),
                final_balances  = dict(session.balances),
                winner          = winner,
            )
            self.reports.append(report)

        for nickname in list(self.playing):
            conn = self._connections.get(nickname)
            if conn:
                conn.role  = Role.SPECTATOR
                conn.ready = False
        # also reset eliminated players who are spectators but were in session
        if session:
            for nick in session.lives:
                conn = self._connections.get(nick)
                if conn:
                    conn.role  = Role.SPECTATOR
                    conn.ready = False
        self._disconnected.clear()
        self.phase   = Phase.IDLE
        self.session = None
        self.game    = None
        return report

    # ------------------------------------------------------------------
    # Messaging
    # ------------------------------------------------------------------

    def room_state_payload(self) -> str:
        return json.dumps({
            "type":         "room_state",
            "waiting":      self.waiting,
            "playing":      self.playing,
            "spectators":   self.spectators,
            "disconnected": self.disconnected,
            "phase":        self.phase.value,
            "ready":        self.ready_players,
            "config":       self.config.to_dict(),
            "session":      self.session.to_dict() if self.session else None,
            "sheets_url":   sheets.sheets_url(),
        })

    async def broadcast_room_state(self) -> None:
        payload = self.room_state_payload()
        await asyncio.gather(
            *(c.websocket.send_text(payload) for c in self._connections.values()),
            return_exceptions=True,
        )

    async def send_to(self, nickname: str, payload: dict) -> None:
        conn = self._connections.get(nickname)
        if conn:
            await conn.websocket.send_text(json.dumps(payload))

    async def broadcast_all(self, payload: dict) -> None:
        text = json.dumps(payload)
        await asyncio.gather(
            *(c.websocket.send_text(text) for c in self._connections.values()),
            return_exceptions=True,
        )

    async def send_error(self, websocket: WebSocket, message: str) -> None:
        await websocket.send_text(json.dumps({"type": "error", "message": message}))


room = GameRoom()
