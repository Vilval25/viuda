"""
Google Sheets integration for game reports.

Configuration (environment variables):
  GOOGLE_SHEETS_CREDENTIALS  – path to the Service Account JSON key file
  GOOGLE_SHEETS_ID           – the spreadsheet ID (the long string in its URL)
  GOOGLE_SHEETS_URL          – the full spreadsheet URL (shown to users in the lobby)

If credentials/ID are not configured, the integration is silently disabled:
the game still works, reports just are not uploaded.
"""
import os
import time
import datetime
from typing import Optional

# Load backend/.env so GOOGLE_SHEETS_* vars are available without exporting
# them by hand. Looks for a .env file starting from the current working dir.
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

try:
    import gspread
    from google.oauth2.service_account import Credentials
    _GSPREAD_AVAILABLE = True
except ImportError:
    _GSPREAD_AVAILABLE = False

_SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]
_HEADER = ["Fecha y hora", "Partida", "Jugador", "Balance"]

_worksheet = None        # cached gspread Worksheet
_init_attempted = False   # so we only try to connect once


def sheets_url() -> Optional[str]:
    """Public spreadsheet URL to surface in the lobby, or None if not set."""
    return os.environ.get("GOOGLE_SHEETS_URL") or None


def is_enabled() -> bool:
    """True if credentials and a sheet ID are configured."""
    return bool(
        _GSPREAD_AVAILABLE
        and os.environ.get("GOOGLE_SHEETS_CREDENTIALS")
        and os.environ.get("GOOGLE_SHEETS_ID")
    )


def _get_worksheet():
    """Lazily connect to the sheet. Returns the Worksheet or None on failure."""
    global _worksheet, _init_attempted
    if _worksheet is not None:
        return _worksheet
    if _init_attempted:
        return None
    _init_attempted = True

    if not is_enabled():
        return None

    cred_path  = os.environ["GOOGLE_SHEETS_CREDENTIALS"]
    sheet_id   = os.environ["GOOGLE_SHEETS_ID"]
    try:
        creds = Credentials.from_service_account_file(cred_path, scopes=_SCOPES)
        client = gspread.authorize(creds)
        sheet  = client.open_by_key(sheet_id)
        ws = sheet.sheet1
        # Ensure the header row exists.
        if ws.row_values(1) != _HEADER:
            if ws.row_count == 0 or not ws.row_values(1):
                ws.insert_row(_HEADER, 1)
        _worksheet = ws
        return _worksheet
    except Exception as exc:
        print(f"[sheets] No se pudo conectar a Google Sheets: {exc!r}")
        return None


def _append_rows_with_retry(rows: list[list], attempts: int = 3) -> bool:
    """Append rows, retrying transient failures. Returns True on success."""
    ws = _get_worksheet()
    if ws is None:
        return False
    for attempt in range(1, attempts + 1):
        try:
            ws.append_rows(rows, value_input_option="USER_ENTERED")
            return True
        except Exception as exc:
            print(f"[sheets] Intento {attempt}/{attempts} falló: {exc!r}")
            if attempt < attempts:
                time.sleep(2 * attempt)
    return False


def append_report(report) -> bool:
    """
    Append one game report to the sheet — one row per player:
        Fecha y hora | Partida# | Jugador | Balance

    This runs synchronously and may block on network I/O; callers should run
    it in a thread (see room/main). Never raises: returns False on any failure.
    """
    if not is_enabled():
        return False

    timestamp = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    game_label = report.id
    rows = [
        [timestamp, game_label, nick, round(bal, 2)]
        for nick, bal in report.final_balances.items()
    ]
    if not rows:
        return False
    return _append_rows_with_retry(rows)
