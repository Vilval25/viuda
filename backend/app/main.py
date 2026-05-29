import asyncio
import json
import os
import time
import uuid
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.room import room, Role, Phase, LifeOffer, FinalDeal, MAX_MONEY
from app.game import Game, GamePhase
from app import sheets
from app.protocol import (
    parse_incoming,
    JoinGameMsg, LeaveGameMsg, SetConfigMsg, ReadyMsg, UnreadyMsg,
    StartGameMsg, PingMsg,
    SwapAllMsg, SwapOneMsg, PassTurnMsg, StandMsg, NewGameMsg,
    RevealHandMsg,
    InterReadyMsg, InterUnreadyMsg,
    LifeOfferMsg, AcceptOfferMsg, CancelOfferMsg, ReactOfferMsg,
    PlaceBidMsg, GameReactionMsg,
    ProposeFinalDealMsg, AcceptFinalDealMsg, RejectFinalDealMsg,
    PongMsg, ErrorMsg, ChangeApodoMsg,
)

app = FastAPI()

# Allowed CORS origins. In production set CORS_ORIGINS to a comma-separated
# list of frontend URLs (e.g. "https://viuda.vercel.app"). Defaults to the
# local Vite dev server.
_default_origins = "http://localhost:5173,http://127.0.0.1:5173,https://viuda.vercel.app"
_cors_origins = [
    o.strip()
    for o in os.environ.get("CORS_ORIGINS", _default_origins).split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.api_route("/", methods=["GET", "HEAD"])
def health_check() -> dict:
    """Plain HTTP endpoint for health checks / keep-alive pings.

    Accepts HEAD as well as GET so uptime monitors (UptimeRobot sends HEAD
    by default) don't get a 405.
    """
    return {"status": "ok", "service": "viuda-backend"}

# Turn timer task: keyed by game id so we can cancel it when the turn changes
_turn_timer_task: asyncio.Task | None = None
_turn_timer_game_id: int | None = None   # id() of the current Game object

# Turn timer. The bar UI shows VISIBLE seconds, but the real timeout is
# slightly longer to give players a small grace window — anyone acting in
# the last visible second doesn't lose their turn to a race.
TURN_TIMER_VISIBLE_SECONDS = 25
TURN_TIMER_GRACE_SECONDS   = 3
TURN_TIMER_SECONDS = TURN_TIMER_VISIBLE_SECONDS + TURN_TIMER_GRACE_SECONDS


def _showdown_seconds(player_count: int) -> int:
    """Length of the showdown reveal window, by players in the round.

      2–3 players -> 6 s
      4–5 players -> 10 s
      6–7 players -> 13 s
      8–9 players -> 15 s
    """
    if player_count <= 3:
        return 6
    if player_count <= 5:
        return 10
    if player_count <= 7:
        return 13
    return 15


# ── Turn timer ─────────────────────────────────────────────────────────

def _cancel_active_timer() -> None:
    """Cancel the running turn-timer task, unless it's the task calling us.

    Helpers like _trigger_showdown / _restart_turn_timer may run *inside*
    _run_turn_timer (the auto-pass path). Cancelling the current task would
    raise CancelledError at the next await and abort the rest of the work,
    so we never cancel ourselves.
    """
    global _turn_timer_task
    if _turn_timer_task is None:
        return
    try:
        current = asyncio.current_task()
    except RuntimeError:
        current = None
    if _turn_timer_task is not current and not _turn_timer_task.done():
        _turn_timer_task.cancel()
    _turn_timer_task = None


async def _run_turn_timer(game_id: int, player: str) -> None:
    """Wait the turn time then auto-pass for `player` if it's still their turn."""
    try:
        await asyncio.sleep(TURN_TIMER_SECONDS)
    except asyncio.CancelledError:
        return
    g = room.game
    if g is None or id(g) != game_id:
        return
    if g.current_player != player or g.phase != GamePhase.PLAYING:
        return
    ok, _ = g.apply_pass(player)
    if ok:
        # A 2nd consecutive pass auto-stands the player — play that sound.
        await _broadcast_sound('stand' if g.last_pass_auto_stood else 'pass')
        await _broadcast_game()
        if g.phase == GamePhase.SHOWDOWN:
            await _trigger_showdown(g)
        else:
            await _broadcast_turn_timer()
            _restart_turn_timer()


def _restart_turn_timer() -> None:
    global _turn_timer_task, _turn_timer_game_id
    _cancel_active_timer()
    g = room.game
    if g is None or g.phase != GamePhase.PLAYING:
        return
    cp = g.current_player
    if cp is None:
        return
    _turn_timer_game_id = id(g)
    _turn_timer_task = asyncio.create_task(_run_turn_timer(id(g), cp))


async def _broadcast_turn_timer() -> None:
    """Broadcast the turn countdown start to all clients.

    The countdown the client shows is `seconds` — the visible bar length.
    The server still auto-passes after the longer real timeout (+ grace),
    so a player acting in the last visible second doesn't lose their turn.
    """
    g = room.game
    if g is None or g.phase != GamePhase.PLAYING or g.current_player is None:
        return
    await room.broadcast_all({
        "type": "turn_timer",
        "seconds": TURN_TIMER_VISIBLE_SECONDS,
        "player": g.current_player,
    })


def _cancel_turn_timer() -> None:
    _cancel_active_timer()


# ── Broadcast helpers ──────────────────────────────────────────────────

async def _broadcast_game() -> None:
    g = room.game
    if g is None:
        return

    public = g.public_state()
    sends = []
    for conn in room._connections.values():
        personal = {**public, "valid_actions": g.valid_actions(conn.nickname)}
        sends.append(conn.websocket.send_text(json.dumps(personal)))
    await asyncio.gather(*sends, return_exceptions=True)

    hand_sends = []
    for nick in room.playing:
        conn = room._connections.get(nick)
        if conn:
            hand = g.get_hand(nick)
            hand_sends.append(conn.websocket.send_text(
                json.dumps({
                    "type":  "hand",
                    "cards": [c.to_dict() for c in hand],
                    "rank":  g.hand_rank(nick),
                })
            ))
    await asyncio.gather(*hand_sends, return_exceptions=True)


def _finish_session(winner: str | None = None) -> None:
    """End the session and upload the report to Google Sheets in the background.

    The Sheets upload runs in a worker thread so its network I/O never blocks
    the event loop, and any failure is swallowed inside sheets.append_report.
    """
    _cancel_all_offer_expiry()
    report = room.end_session(winner=winner)
    if report is not None and sheets.is_enabled():
        asyncio.create_task(asyncio.to_thread(sheets.append_report, report))


async def _trigger_showdown(g: Game) -> None:
    """Start the reveal window then transition to inter_round.

    The window length scales with the number of players in the round
    (see _showdown_seconds).
    """
    _cancel_turn_timer()
    session = room.session
    if session is None:
        return

    alive_count = len(session.alive_players)
    losers = g.evaluate_losers(alive_count)
    # Record losers now so handle_reveal_hand can authorize voluntary
    # reveals during the window (before life loss is applied).
    session.losers = losers

    showdown_secs = _showdown_seconds(len(g._order))

    # Showdown sound for the whole room.
    await _broadcast_sound('showdown')

    # Broadcast showdown_timer message with the countdown
    await room.broadcast_all({"type": "showdown_timer", "seconds": showdown_secs})

    # Reveal safe players' hands immediately
    safe = [p for p in g._order if p not in losers]
    revealed: dict[str, list[dict]] = {}
    for nick in safe:
        hand = g.get_hand(nick)
        revealed[nick] = [c.to_dict() for c in hand]

    showdown_base = g.showdown_result()   # has evaluations, winners, table

    # Record this round's winner — decides who starts the next round.
    round_winners = showdown_base["winners"]
    if round_winners:
        session.record_round_winner(round_winners[0])

    await room.broadcast_all({
        "type":        "showdown_reveal",
        "evaluations": showdown_base["evaluations"],
        "winners":     showdown_base["winners"],
        "table":       showdown_base["table"],
        "revealed":    revealed,
        "losers":      losers,
    })

    # Wait out the window; loser reveals arrive via handle_reveal_hand meanwhile
    await asyncio.sleep(showdown_secs)

    # Apply life losses
    room.begin_inter_round(losers)

    # If only one player survives, the game is over — award the pot and
    # end the session instead of going to the inter-round screen.
    alive = session.alive_players
    if len(alive) <= 1:
        winner = alive[0] if alive else None
        if winner:
            session.award_winner(winner)
        _finish_session(winner=winner)

    await room.broadcast_room_state()


# ── Lobby handlers ─────────────────────────────────────────────────────

async def handle_join_game(nickname: str, _msg: JoinGameMsg, ws: WebSocket) -> None:
    ok, error = room.join(nickname)
    if not ok:
        await ws.send_text(ErrorMsg(message=error).model_dump_json())
    else:
        await room.broadcast_room_state()


async def handle_leave_game(nickname: str, _msg: LeaveGameMsg, ws: WebSocket) -> None:
    ok, error = room.leave_waiting(nickname)
    if not ok:
        await ws.send_text(ErrorMsg(message=error).model_dump_json())
    else:
        await room.broadcast_room_state()


async def handle_set_config(nickname: str, msg: SetConfigMsg, ws: WebSocket) -> None:
    conn = room._connections.get(nickname)
    if conn is None or conn.role != Role.WAITING:
        await ws.send_text(ErrorMsg(message="Solo los jugadores en espera pueden cambiar la configuración.").model_dump_json())
        return
    error = room.set_config(msg.buy_in, msg.max_lives)
    if error:
        await ws.send_text(ErrorMsg(message=error).model_dump_json())
    else:
        await room.broadcast_room_state()


async def handle_ready(nickname: str, _msg: ReadyMsg, ws: WebSocket) -> None:
    ok, error = room.set_ready(nickname, True)
    if not ok:
        await ws.send_text(ErrorMsg(message=error).model_dump_json())
    else:
        await room.broadcast_room_state()


async def handle_unready(nickname: str, _msg: UnreadyMsg, ws: WebSocket) -> None:
    ok, error = room.set_ready(nickname, False)
    if not ok:
        await ws.send_text(ErrorMsg(message=error).model_dump_json())
    else:
        await room.broadcast_room_state()


async def handle_start_game(nickname: str, _msg: StartGameMsg, ws: WebSocket) -> None:
    ok, error = room.start_game(nickname)
    if not ok:
        await ws.send_text(ErrorMsg(message=error).model_dump_json())
        return

    room.begin_session()
    g = Game(room.playing)
    g.determine_order()                       # round 1: sort by high card
    # Freeze the clockwise seating for the whole session.
    room.session.seat_order = list(g._order)
    g.deal()
    room.game = g

    await room.broadcast_all(g.order_result())
    await room.broadcast_room_state()
    await _broadcast_game()
    _restart_turn_timer()
    await _broadcast_turn_timer()


async def handle_ping(_nickname: str, _msg: PingMsg, ws: WebSocket) -> None:
    await ws.send_text(PongMsg().model_dump_json())


# ── Game action handlers ───────────────────────────────────────────────

async def _broadcast_sound(effect: str) -> None:
    """Tell every client to play a sound effect, so the whole room hears it."""
    await room.broadcast_all({"type": "play_sound", "effect": effect})


async def _after_action(g: Game) -> None:
    """Shared post-action logic: broadcast, check showdown."""
    await _broadcast_game()
    if g.phase == GamePhase.SHOWDOWN:
        asyncio.create_task(_trigger_showdown(g))
    else:
        _restart_turn_timer()
        await _broadcast_turn_timer()


async def handle_swap_all(nickname: str, _msg: SwapAllMsg, ws: WebSocket) -> None:
    g = room.game
    if g is None:
        await ws.send_text(ErrorMsg(message="No hay partida en curso.").model_dump_json()); return
    ok, error = g.apply_swap_all(nickname)
    if not ok:
        await ws.send_text(ErrorMsg(message=error).model_dump_json())
    else:
        await _broadcast_sound('swap_all')
        await _after_action(g)


async def _clear_taken_ghost_after_delay(game_id: int, swap_time: float) -> None:
    """Sleep for 3 seconds then clear the ghost cards if no other swap occurred."""
    await asyncio.sleep(3.0)
    g = room.game
    if g is not None and id(g) == game_id:
        if getattr(g, "_last_swap_timestamp", 0.0) == swap_time:
            g._last_taken_by_slot = {}
            await _broadcast_game()


async def handle_swap_one(nickname: str, msg: SwapOneMsg, ws: WebSocket) -> None:
    g = room.game
    if g is None:
        await ws.send_text(ErrorMsg(message="No hay partida en curso.").model_dump_json()); return
    ok, error = g.apply_swap_one(nickname, msg.hand_card_id, msg.table_card_id)
    if not ok:
        await ws.send_text(ErrorMsg(message=error).model_dump_json())
    else:
        await _broadcast_sound('swap_one')
        await _after_action(g)
        # Clear the ghost shadow after 3 seconds
        swap_time = getattr(g, "_last_swap_timestamp", 0.0)
        asyncio.create_task(_clear_taken_ghost_after_delay(id(g), swap_time))


async def handle_pass_turn(nickname: str, _msg: PassTurnMsg, ws: WebSocket) -> None:
    g = room.game
    if g is None:
        await ws.send_text(ErrorMsg(message="No hay partida en curso.").model_dump_json()); return
    ok, error = g.apply_pass(nickname)
    if not ok:
        await ws.send_text(ErrorMsg(message=error).model_dump_json())
    else:
        # A 2nd consecutive pass auto-stands the player — play that sound.
        await _broadcast_sound('stand' if g.last_pass_auto_stood else 'pass')
        await _after_action(g)


async def handle_stand(nickname: str, _msg: StandMsg, ws: WebSocket) -> None:
    g = room.game
    if g is None:
        await ws.send_text(ErrorMsg(message="No hay partida en curso.").model_dump_json()); return
    ok, error = g.apply_stand(nickname)
    if not ok:
        await ws.send_text(ErrorMsg(message=error).model_dump_json())
    else:
        await _broadcast_sound('stand')
        await _after_action(g)


async def handle_new_game(nickname: str, _msg: NewGameMsg, ws: WebSocket) -> None:
    conn = room._connections.get(nickname)
    if conn is None or conn.role not in (Role.PLAYING, Role.SPECTATOR):
        await ws.send_text(ErrorMsg(message="Solo los jugadores pueden reiniciar.").model_dump_json())
        return
    _cancel_turn_timer()
    _finish_session()
    await room.broadcast_room_state()


# ── Showdown reveal handler ────────────────────────────────────────────

async def handle_reveal_hand(nickname: str, _msg: RevealHandMsg, ws: WebSocket) -> None:
    g = room.game
    session = room.session
    if g is None or session is None or g.phase != GamePhase.SHOWDOWN:
        await ws.send_text(ErrorMsg(message="No hay showdown activo.").model_dump_json())
        return
    if nickname not in session.losers:
        await ws.send_text(ErrorMsg(message="Solo los jugadores que pierden vida pueden revelar voluntariamente.").model_dump_json())
        return

    hand = g.get_hand(nickname)
    session.revealed_hands[nickname] = [c.to_dict() for c in hand]
    # Broadcast the new reveal to everyone
    await room.broadcast_all({
        "type":     "showdown_reveal_update",
        "nickname": nickname,
        "cards":    session.revealed_hands[nickname],
    })


# ── Inter-round handlers ───────────────────────────────────────────────

async def handle_inter_ready(nickname: str, _msg: InterReadyMsg, ws: WebSocket) -> None:
    ok, error = room.set_inter_ready(nickname)
    if not ok:
        await ws.send_text(ErrorMsg(message=error).model_dump_json())
        return
    await room.broadcast_room_state()

    if room.all_inter_ready():
        await _proceed_next_round()


async def handle_inter_unready(nickname: str, _msg: InterUnreadyMsg, ws: WebSocket) -> None:
    room.unset_inter_ready(nickname)
    await room.broadcast_room_state()


async def _proceed_next_round() -> None:
    session = room.session
    if session is None:
        return

    alive = session.alive_players
    if len(alive) <= 1:
        winner = alive[0] if alive else None
        if winner:
            session.award_winner(winner)
        _finish_session(winner=winner)
        await room.broadcast_room_state()
        return

    # Updates roles from current lives: players who sold their last life
    # become spectators; revived players return to playing.
    _cancel_all_offer_expiry()
    room.begin_next_round()

    # Build the next round's turn order from the FIXED seating.
    # 1. Take the session-wide seat order (unchanging clockwise layout).
    # 2. Keep only players who are alive AND still connected — eliminated
    #    players' seats are simply skipped, never re-shuffled.
    connected = set(room._connections.keys())
    alive_set = set(alive)
    seated = [
        n for n in session.seat_order
        if n in alive_set and n in connected
    ]
    # Any alive+connected player missing from seat_order (shouldn't happen)
    # is appended so nobody is dropped.
    for n in alive:
        if n in connected and n not in seated:
            seated.append(n)

    if len(seated) <= 1:
        # Not enough connected survivors to continue — end the session.
        winner = seated[0] if seated else None
        if winner:
            session.award_winner(winner)
        _finish_session(winner=winner)
        await room.broadcast_room_state()
        return

    # The next round starts with the player seated clockwise-next after
    # last round's winner (skipping eliminated/absent seats).
    order = list(seated)
    if session.last_round_winner and session.last_round_winner in session.seat_order:
        win_idx = session.seat_order.index(session.last_round_winner)
        ring = session.seat_order
        first_player = None
        for i in range(1, len(ring) + 1):
            candidate = ring[(win_idx + i) % len(ring)]
            if candidate in seated:
                first_player = candidate
                break
        if first_player is not None:
            start = order.index(first_player)
            order = order[start:] + order[:start]

    g = Game(order)
    g.determine_order(explicit_order=order)
    g.deal()
    room.game = g

    await room.broadcast_all(g.order_result())
    await room.broadcast_room_state()
    await _broadcast_game()
    _restart_turn_timer()
    await _broadcast_turn_timer()


# ── Offer expiry ───────────────────────────────────────────────────────
# Each life offer auto-expires if nobody accepts it in time.
OFFER_TTL_SECONDS = 15

# offer_id -> the asyncio task that will expire it
_offer_expiry_tasks: dict[str, asyncio.Task] = {}


def _cancel_offer_expiry(offer_id: str) -> None:
    """Stop the expiry timer for an offer that was accepted or cancelled."""
    task = _offer_expiry_tasks.pop(offer_id, None)
    if task is not None and not task.done():
        task.cancel()


def _cancel_all_offer_expiry() -> None:
    """Stop every pending offer-expiry timer (e.g. when the round advances)."""
    for task in _offer_expiry_tasks.values():
        if not task.done():
            task.cancel()
    _offer_expiry_tasks.clear()


async def _expire_offer(offer_id: str) -> None:
    """Wait out the TTL, then remove the offer if it's still around."""
    try:
        await asyncio.sleep(OFFER_TTL_SECONDS)
    except asyncio.CancelledError:
        return
    _offer_expiry_tasks.pop(offer_id, None)
    session = room.session
    if session is None or room.phase != Phase.INTER_ROUND:
        return
    if offer_id in session.life_offers:
        offer = session.life_offers[offer_id]
        if offer.offer_type == "public_auction" and offer.highest_bidder:
            seller = offer.from_nick
            buyer = offer.highest_bidder
            ok, err = session.apply_life_trade(
                seller=seller, buyer=buyer,
                amount=offer.amount, price=offer.price,
            )
            if ok:
                await room.broadcast_all({
                    "type":      "trade_notice",
                    "seller":    seller,
                    "buyer":     buyer,
                    "amount":    offer.amount,
                    "price":     offer.price,
                    "directed":  False,
                    "auction":   True,
                })
        session.remove_offer(offer_id)
        await room.broadcast_room_state()

        if room.all_inter_ready():
            await _proceed_next_round()


async def handle_life_offer(nickname: str, msg: LifeOfferMsg, ws: WebSocket) -> None:
    session = room.session
    if session is None or room.phase != Phase.INTER_ROUND:
        await ws.send_text(ErrorMsg(message="Los intercambios solo ocurren entre rondas.").model_dump_json())
        return

    # Only players who took part in this session may trade lives. Eliminated
    # players (lives == 0) are still session participants and may still buy;
    # spectators who never joined the game are not in session.lives at all.
    if nickname not in session.lives:
        await ws.send_text(ErrorMsg(message="Los espectadores no pueden intercambiar vidas.").model_dump_json())
        return

    is_directed = msg.offer_type in ("direct_sell", "direct_buy")
    is_sell     = msg.offer_type in ("public_sell", "direct_sell")
    is_buy      = msg.offer_type in ("public_buy", "direct_buy")

    if msg.amount < 1:
        await ws.send_text(ErrorMsg(message="La cantidad de vidas debe ser al menos 1.").model_dump_json())
        return
    if msg.price < 0:
        await ws.send_text(ErrorMsg(message="El precio no puede ser negativo.").model_dump_json())
        return
    if msg.price > MAX_MONEY:
        await ws.send_text(ErrorMsg(message=f"El precio no puede superar S/. {MAX_MONEY:.2f}.").model_dump_json())
        return
    if is_directed and not msg.target_nick:
        await ws.send_text(ErrorMsg(message="Una oferta dirigida requiere indicar el destinatario.").model_dump_json())
        return
    if is_directed and msg.target_nick == nickname:
        await ws.send_text(ErrorMsg(message="No puedes hacerte una oferta a ti mismo.").model_dump_json())
        return

    # Validate the offerer has enough lives for sell-type offers
    if is_sell:
        if session.lives.get(nickname, 0) < msg.amount:
            await ws.send_text(ErrorMsg(message="No tienes suficientes vidas para esta oferta.").model_dump_json())
            return
    # Validate the offerer has room for buy-type offers
    if is_buy:
        if session.lives.get(nickname, 0) + msg.amount > session.max_lives:
            await ws.send_text(ErrorMsg(message=f"Superarías el máximo de vidas ({session.max_lives}).").model_dump_json())
            return

    offer = LifeOffer(
        id=str(uuid.uuid4())[:8],
        from_nick=nickname,
        offer_type=msg.offer_type,
        amount=msg.amount,
        price=round(msg.price, 2),
        target_nick=msg.target_nick,
        expires_at=time.time() + OFFER_TTL_SECONDS,
    )
    session.add_offer(offer)
    # Auto-expire the offer if nobody accepts it within the TTL.
    _offer_expiry_tasks[offer.id] = asyncio.create_task(_expire_offer(offer.id))
    await _broadcast_sound('new_offer')
    await room.broadcast_room_state()


async def handle_accept_offer(nickname: str, msg: AcceptOfferMsg, ws: WebSocket) -> None:
    session = room.session
    if session is None or room.phase != Phase.INTER_ROUND:
        await ws.send_text(ErrorMsg(message="Los intercambios solo ocurren entre rondas.").model_dump_json())
        return

    if nickname not in session.lives:
        await ws.send_text(ErrorMsg(message="Los espectadores no pueden intercambiar vidas.").model_dump_json())
        return

    offer = session.life_offers.get(msg.offer_id)
    if offer is None:
        await ws.send_text(ErrorMsg(message="Oferta no encontrada.").model_dump_json())
        return
    if offer.from_nick == nickname:
        await ws.send_text(ErrorMsg(message="No puedes aceptar tu propia oferta.").model_dump_json())
        return

    is_directed = offer.offer_type in ("direct_sell", "direct_buy")
    is_sell     = offer.offer_type in ("public_sell", "direct_sell")
    if is_directed and offer.target_nick != nickname:
        await ws.send_text(ErrorMsg(message="Esta oferta dirigida no es para ti.").model_dump_json())
        return

    if is_sell:
        # offerer sells to acceptor
        seller, buyer = offer.from_nick, nickname
    else:  # buy: offerer wants to buy from acceptor
        seller, buyer = nickname, offer.from_nick
    ok, err = session.apply_life_trade(
        seller=seller, buyer=buyer,
        amount=offer.amount, price=offer.price,
    )

    if not ok:
        await ws.send_text(ErrorMsg(message=err).model_dump_json())
        return

    session.remove_offer(msg.offer_id)
    _cancel_offer_expiry(msg.offer_id)
    # Notify everyone that a life trade just happened
    await room.broadcast_all({
        "type":      "trade_notice",
        "seller":    seller,
        "buyer":     buyer,
        "amount":    offer.amount,
        "price":     offer.price,
        "directed":  is_directed,
    })
    await room.broadcast_room_state()

    # Check if all ready after trade (lives may have changed eliminating someone)
    if room.all_inter_ready():
        await _proceed_next_round()


async def handle_cancel_offer(nickname: str, msg: CancelOfferMsg, ws: WebSocket) -> None:
    session = room.session
    if session is None:
        return
    offer = session.life_offers.get(msg.offer_id)
    if offer is None or offer.from_nick != nickname:
        await ws.send_text(ErrorMsg(message="No puedes cancelar esa oferta.").model_dump_json())
        return
    session.remove_offer(msg.offer_id)
    _cancel_offer_expiry(msg.offer_id)
    await room.broadcast_room_state()


# Emojis players may react to offers with.
ALLOWED_REACTIONS = {"👍", "👎", "😂", "😮", "🔥", "🤔"}


async def handle_react_offer(nickname: str, msg: ReactOfferMsg, ws: WebSocket) -> None:
    session = room.session
    if session is None or room.phase != Phase.INTER_ROUND:
        return
    # Only players who took part in the session may react (not spectators).
    if nickname not in session.lives:
        await ws.send_text(ErrorMsg(message="Los espectadores no pueden reaccionar.").model_dump_json())
        return
    if msg.emoji not in ALLOWED_REACTIONS:
        await ws.send_text(ErrorMsg(message="Emoji no permitido.").model_dump_json())
        return
    offer = session.life_offers.get(msg.offer_id)
    if offer is None:
        return
    offer.toggle_reaction(msg.emoji, nickname)
    await room.broadcast_room_state()


async def handle_place_bid(nickname: str, msg: PlaceBidMsg, ws: WebSocket) -> None:
    session = room.session
    if session is None or room.phase != Phase.INTER_ROUND:
        await ws.send_text(ErrorMsg(message="Las subastas solo ocurren entre rondas.").model_dump_json())
        return
    if nickname not in session.lives:
        await ws.send_text(ErrorMsg(message="Los espectadores no pueden pujar.").model_dump_json())
        return
    offer = session.life_offers.get(msg.offer_id)
    if offer is None:
        await ws.send_text(ErrorMsg(message="Oferta no encontrada.").model_dump_json())
        return
    if offer.offer_type != "public_auction":
        await ws.send_text(ErrorMsg(message="Esta oferta no es una subasta.").model_dump_json())
        return
    if offer.from_nick == nickname:
        await ws.send_text(ErrorMsg(message="No puedes pujar en tu propia subasta.").model_dump_json())
        return
    if msg.bid_price <= offer.price:
        await ws.send_text(ErrorMsg(message="La puja debe ser estrictamente mayor que el precio actual.").model_dump_json())
        return
    if msg.bid_price > MAX_MONEY:
        await ws.send_text(ErrorMsg(message=f"La puja no puede superar S/. {MAX_MONEY:.2f}.").model_dump_json())
        return
    # Validate bidder has room for the lives
    if session.lives.get(nickname, 0) + offer.amount > session.max_lives:
        await ws.send_text(ErrorMsg(message=f"Superarías el máximo de vidas ({session.max_lives}).").model_dump_json())
        return

    offer.price = round(msg.bid_price, 2)
    offer.highest_bidder = nickname
    
    # Reset/restart the expiration countdown timer for this auction offer
    _cancel_offer_expiry(offer.id)
    offer.expires_at = time.time() + OFFER_TTL_SECONDS
    _offer_expiry_tasks[offer.id] = asyncio.create_task(_expire_offer(offer.id))

    await _broadcast_sound('new_offer')
    await room.broadcast_room_state()


async def handle_game_reaction(nickname: str, msg: GameReactionMsg, ws: WebSocket) -> None:
    # Allow a fun expanded set of emojis for game reactions, e.g. includes 😱, 👑 and 🃏
    if msg.emoji not in {"👍", "👎", "😂", "😮", "🔥", "🤔", "😱", "🃏", "👑"}:
        await ws.send_text(ErrorMsg(message="Emoji no permitido.").model_dump_json())
        return
    await room.broadcast_all({
        "type": "game_reaction",
        "nickname": nickname,
        "emoji": msg.emoji,
    })


async def handle_propose_final_deal(nickname: str, msg: ProposeFinalDealMsg, ws: WebSocket) -> None:
    session = room.session
    if session is None or room.phase != Phase.INTER_ROUND:
        await ws.send_text(ErrorMsg(message="El trato final solo es posible entre rondas.").model_dump_json())
        return
    alive = session.alive_players
    if len(alive) != 2:
        await ws.send_text(ErrorMsg(message="El trato final solo está disponible cuando quedan 2 jugadores.").model_dump_json())
        return
    if nickname not in alive:
        await ws.send_text(ErrorMsg(message="Solo los jugadores vivos pueden proponer un trato.").model_dump_json())
        return
    if msg.my_share < 0 or msg.my_share > session.pot:
        await ws.send_text(ErrorMsg(message="El monto debe estar entre 0 y el pozo total.").model_dump_json())
        return

    session.final_deal = FinalDeal(proposer=nickname, my_share=round(msg.my_share, 2), pot=session.pot)
    await room.broadcast_room_state()


async def handle_accept_final_deal(nickname: str, _msg: AcceptFinalDealMsg, ws: WebSocket) -> None:
    session = room.session
    if session is None or session.final_deal is None:
        await ws.send_text(ErrorMsg(message="No hay trato pendiente.").model_dump_json())
        return
    deal = session.final_deal
    if nickname == deal.proposer:
        await ws.send_text(ErrorMsg(message="No puedes aceptar tu propio trato.").model_dump_json())
        return
    alive = session.alive_players
    other = next((p for p in alive if p != deal.proposer), None)
    if other != nickname:
        await ws.send_text(ErrorMsg(message="Solo el otro jugador puede aceptar el trato.").model_dump_json())
        return

    session.apply_final_deal(deal.proposer, nickname, deal.my_share)
    _finish_session(winner=None)
    await room.broadcast_room_state()


async def handle_reject_final_deal(nickname: str, _msg: RejectFinalDealMsg, ws: WebSocket) -> None:
    session = room.session
    if session is None or session.final_deal is None:
        return
    if nickname == session.final_deal.proposer:
        await ws.send_text(ErrorMsg(message="No puedes rechazar tu propio trato.").model_dump_json())
        return
    session.final_deal = None
    await room.broadcast_room_state()


async def handle_change_apodo(nickname: str, msg: ChangeApodoMsg, ws: WebSocket) -> None:
    conn = room._connections.get(nickname)
    if not conn:
        await ws.send_text(ErrorMsg(message="Conexión no encontrada.").model_dump_json())
        return

    # User can only change nickname in lobby (idle) or between rounds
    if room.phase not in (Phase.IDLE, Phase.INTER_ROUND):
        await ws.send_text(ErrorMsg(message="No puedes cambiar tu apodo en plena partida.").model_dump_json())
        return

    new_apodo = msg.apodo.strip()
    if not new_apodo:
        await ws.send_text(ErrorMsg(message="El apodo no puede estar vacío.").model_dump_json())
        return

    if len(new_apodo) > 15:
        await ws.send_text(ErrorMsg(message="El apodo no puede superar los 15 caracteres.").model_dump_json())
        return

    # Update in memory
    conn.apodo = new_apodo
    room._apodos[nickname] = new_apodo

    # Update in sheets (background)
    loop = asyncio.get_event_loop()
    loop.run_in_executor(None, sheets.update_user_apodo, nickname, new_apodo)

    # Broadcast new room state
    await room.broadcast_room_state()


# ── Handler registry ───────────────────────────────────────────────────

HANDLERS: dict = {
    "change_apodo":       handle_change_apodo,
    "join_game":          handle_join_game,
    "leave_game":         handle_leave_game,
    "set_config":         handle_set_config,
    "ready":              handle_ready,
    "unready":            handle_unready,
    "start_game":         handle_start_game,
    "ping":               handle_ping,
    "swap_all":           handle_swap_all,
    "swap_one":           handle_swap_one,
    "pass_turn":          handle_pass_turn,
    "stand":              handle_stand,
    "new_game":           handle_new_game,
    "reveal_hand":        handle_reveal_hand,
    "inter_ready":        handle_inter_ready,
    "inter_unready":      handle_inter_unready,
    "life_offer":         handle_life_offer,
    "accept_offer":       handle_accept_offer,
    "cancel_offer":       handle_cancel_offer,
    "react_offer":        handle_react_offer,
    "place_bid":          handle_place_bid,
    "game_reaction":      handle_game_reaction,
    "propose_final_deal": handle_propose_final_deal,
    "accept_final_deal":  handle_accept_final_deal,
    "reject_final_deal":  handle_reject_final_deal,
}


# ── User HTTP Endpoints ────────────────────────────────────────────────

from pydantic import BaseModel

class UserAuthMsg(BaseModel):
    username: str
    password: str

class ApodoUpdateMsg(BaseModel):
    username: str
    apodo: str

@app.post("/api/register")
def api_register(data: UserAuthMsg):
    success, msg = sheets.register_user(data.username, data.password)
    return {"success": success, "message": msg}

@app.post("/api/login")
def api_login(data: UserAuthMsg):
    success, msg, apodo = sheets.login_user(data.username, data.password)
    return {"success": success, "message": msg, "apodo": apodo}

@app.post("/api/change-password")
def api_change_password(data: UserAuthMsg):
    success, msg = sheets.change_password(data.username, data.password)
    return {"success": success, "message": msg}

@app.post("/api/update-apodo")
def api_update_apodo(data: ApodoUpdateMsg):
    success = sheets.update_user_apodo(data.username, data.apodo)
    return {"success": success}


# ── WebSocket endpoint ─────────────────────────────────────────────────

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    await websocket.accept()

    try:
        raw = await websocket.receive_text()
        msg = parse_incoming(raw)
    except ValueError as exc:
        await websocket.send_text(ErrorMsg(message=str(exc)).model_dump_json())
        await websocket.close()
        return

    if msg.type != "join" or not msg.nickname.strip():
        await websocket.send_text(
            ErrorMsg(message="El primer mensaje debe ser {type:'join', nickname:'...'}.").model_dump_json()
        )
        await websocket.close()
        return

    nickname = msg.nickname.strip()
    apodo = getattr(msg, "apodo", "").strip() if getattr(msg, "apodo", None) else ""
    ok, error = room.connect(websocket, nickname, apodo=apodo)
    if not ok:
        await websocket.send_text(ErrorMsg(message=error).model_dump_json())
        await websocket.close()
        return

    await room.broadcast_room_state()

    if room.game is not None:
        personal = {**room.game.public_state(), "valid_actions": room.game.valid_actions(nickname)}
        await websocket.send_text(json.dumps(personal))
        if room.is_reconnect(nickname):
            hand = room.game.get_hand(nickname)
            await websocket.send_text(json.dumps({"type": "hand", "cards": [c.to_dict() for c in hand]}))

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                incoming = parse_incoming(raw)
            except ValueError as exc:
                await websocket.send_text(ErrorMsg(message=str(exc)).model_dump_json())
                continue

            if incoming.type == "join":
                await websocket.send_text(ErrorMsg(message="Ya estás conectado.").model_dump_json())
                continue

            handler = HANDLERS.get(incoming.type)
            if handler:
                await handler(nickname, incoming, websocket)

    except WebSocketDisconnect:
        room.disconnect(nickname)
        await room.broadcast_room_state()
    except Exception:
        room.disconnect(nickname)
        await room.broadcast_room_state()
