import json
from typing import Literal, Union, Annotated, Optional
from pydantic import BaseModel, Field, ValidationError, TypeAdapter


# ── Incoming messages (client → server) ───────────────────────────────

class JoinMsg(BaseModel):
    type: Literal["join"]
    nickname: str

class JoinGameMsg(BaseModel):
    type: Literal["join_game"]

class LeaveGameMsg(BaseModel):
    type: Literal["leave_game"]

class SetConfigMsg(BaseModel):
    type:      Literal["set_config"]
    buy_in:    Optional[float] = None
    max_lives: Optional[int]   = None

class ReadyMsg(BaseModel):
    type: Literal["ready"]

class UnreadyMsg(BaseModel):
    type: Literal["unready"]

class StartGameMsg(BaseModel):
    type: Literal["start_game"]

class PingMsg(BaseModel):
    type: Literal["ping"]

class SwapAllMsg(BaseModel):
    type: Literal["swap_all"]

class SwapOneMsg(BaseModel):
    type: Literal["swap_one"]
    hand_card_id:  str
    table_card_id: str

class PassTurnMsg(BaseModel):
    type: Literal["pass_turn"]

class StandMsg(BaseModel):
    type: Literal["stand"]

class NewGameMsg(BaseModel):
    type: Literal["new_game"]

# ── Showdown ───────────────────────────────────────────────────────────

class RevealHandMsg(BaseModel):
    """Loser voluntarily reveals their hand during the 8-second showdown window."""
    type: Literal["reveal_hand"]

# ── Inter-round ────────────────────────────────────────────────────────

class InterReadyMsg(BaseModel):
    type: Literal["inter_ready"]

class InterUnreadyMsg(BaseModel):
    type: Literal["inter_unready"]

class LifeOfferMsg(BaseModel):
    """
    Post a life offer.
    offer_type:
      public_sell  – visible to all, anyone can accept (you sell `amount` lives for `price`)
      public_buy   – visible to all, anyone can accept (you want to buy `amount` lives for `price`)
      direct_sell  – directed at `target_nick`: you sell them lives for `price`
      direct_buy   – directed at `target_nick`: you buy lives from them for `price`
    amount: number of lives to trade
    price:  total S/. for the whole trade
    target_nick: required for directed offers
    """
    type:        Literal["life_offer"]
    offer_type:  Literal["public_sell", "public_buy", "direct_sell", "direct_buy"]
    amount:      int
    price:       float
    target_nick: Optional[str] = None

class AcceptOfferMsg(BaseModel):
    type:     Literal["accept_offer"]
    offer_id: str

class CancelOfferMsg(BaseModel):
    type:     Literal["cancel_offer"]
    offer_id: str

class ReactOfferMsg(BaseModel):
    """Toggle the sender's emoji reaction on an offer."""
    type:     Literal["react_offer"]
    offer_id: str
    emoji:    str

class ProposeFinalDealMsg(BaseModel):
    type:     Literal["propose_final_deal"]
    my_share: float

class AcceptFinalDealMsg(BaseModel):
    type: Literal["accept_final_deal"]

class RejectFinalDealMsg(BaseModel):
    type: Literal["reject_final_deal"]


IncomingMessage = Annotated[
    Union[
        JoinMsg, JoinGameMsg, LeaveGameMsg,
        SetConfigMsg, ReadyMsg, UnreadyMsg, StartGameMsg,
        PingMsg,
        SwapAllMsg, SwapOneMsg, PassTurnMsg, StandMsg, NewGameMsg,
        RevealHandMsg,
        InterReadyMsg, InterUnreadyMsg,
        LifeOfferMsg, AcceptOfferMsg, CancelOfferMsg, ReactOfferMsg,
        ProposeFinalDealMsg, AcceptFinalDealMsg, RejectFinalDealMsg,
    ],
    Field(discriminator="type"),
]

_KNOWN_TYPES = {
    "join", "join_game", "leave_game",
    "set_config", "ready", "unready", "start_game",
    "ping",
    "swap_all", "swap_one", "pass_turn", "stand", "new_game",
    "reveal_hand",
    "inter_ready", "inter_unready",
    "life_offer", "accept_offer", "cancel_offer", "react_offer",
    "propose_final_deal", "accept_final_deal", "reject_final_deal",
}

_adapter: TypeAdapter[IncomingMessage] = TypeAdapter(IncomingMessage)


# ── Outgoing messages (server → client) ───────────────────────────────

class PongMsg(BaseModel):
    type: Literal["pong"] = "pong"

class ErrorMsg(BaseModel):
    type: Literal["error"] = "error"
    message: str


# ── Parser ─────────────────────────────────────────────────────────────

def parse_incoming(raw: str) -> IncomingMessage:
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise ValueError(f"JSON inválido: {exc}") from exc

    msg_type = data.get("type")
    if msg_type is None:
        raise ValueError("El mensaje no tiene campo 'type'.")
    if msg_type not in _KNOWN_TYPES:
        raise ValueError(f"Tipo de mensaje desconocido: '{msg_type}'.")

    try:
        return _adapter.validate_python(data)
    except ValidationError as exc:
        raise ValueError(str(exc)) from exc
