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
import hashlib
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


# ── CONFIGURACIÓN DIRECTA DE GOOGLE SHEETS ─────────────────────────────
# NOTA: Intentamos leer de las variables de entorno si están configuradas,
# de lo contrario usamos los valores hardcodeados directamente aquí.

# 1. Ruta al archivo de credenciales JSON
GOOGLE_SHEETS_CREDENTIALS = os.environ.get("GOOGLE_SHEETS_CREDENTIALS") or "credentials.json"

# 2. ID del Excel de reporte de partidas
GOOGLE_SHEETS_ID = os.environ.get("GOOGLE_SHEETS_ID") or "131kOaokkJpFHyqd3EJmLpdeK0_xKe3LWhuQCQl8fyZg"

# 3. URL completa del Excel de partidas
GOOGLE_SHEETS_URL = os.environ.get("GOOGLE_SHEETS_URL") or "https://docs.google.com/spreadsheets/d/131kOaokkJpFHyqd3EJmLpdeK0_xKe3LWhuQCQl8fyZg/edit?usp=sharing"



def sheets_url() -> Optional[str]:
    """Public spreadsheet URL to surface in the lobby, or None if not set."""
    return GOOGLE_SHEETS_URL or None


def is_enabled() -> bool:
    """True if credentials and a sheet ID are configured."""
    return bool(
        _GSPREAD_AVAILABLE
        and GOOGLE_SHEETS_CREDENTIALS
        and GOOGLE_SHEETS_ID
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

    cred_path  = GOOGLE_SHEETS_CREDENTIALS
    sheet_id   = GOOGLE_SHEETS_ID
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
        print(f"[sheets] No se pudo conectar a Google Sheets de partidas: {exc!r}")
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


from datetime import timezone, timedelta

_last_report_dt = None
_current_date_str = None
_current_session_num = 1

def _get_last_session_info_from_sheet(ws) -> tuple[Optional[datetime.datetime], Optional[str], int]:
    """
    Reads the sheet from the bottom up to find the last valid game report.
    Returns (last_datetime, last_date_str, last_session_number).
    """
    try:
        all_rows = ws.get_all_values()
        if len(all_rows) <= 1:
            return None, None, 0
            
        for row in reversed(all_rows[1:]):
            if len(row) < 2:
                continue
            timestamp_str = row[0]
            game_id = row[1]
            
            if "_" in game_id and game_id.startswith(tuple(str(x) for x in range(10))):
                parts = game_id.split("_S")
                if len(parts) == 2:
                    date_str = parts[0] # "DD-MM-YYYY"
                    try:
                        session_num = int(parts[1])
                        dt = datetime.datetime.strptime(timestamp_str, "%Y-%m-%d %H:%M:%S")
                        return dt, date_str, session_num
                    except ValueError:
                        continue
    except Exception as e:
        print(f"[sheets] Error al obtener información de la última sesión: {e!r}")
    return None, None, 0

def append_report(report) -> bool:
    """
    Append one game report to the sheet — one row per player:
        Fecha y hora | Partida# | Jugador | Balance

    This runs synchronously and may block on network I/O; callers should run
    it in a thread (see room/main). Never raises: returns False on any failure.
    """
    global _last_report_dt, _current_date_str, _current_session_num

    if not is_enabled():
        return False

    ws = _get_worksheet()
    if ws is None:
        return False

    # Get Peruvian time (UTC-5)
    peru_now = datetime.datetime.now(timezone.utc) - timedelta(hours=5)
    peru_date_str = peru_now.strftime("%d-%m-%Y") # "DD-MM-YYYY"
    timestamp = peru_now.strftime("%Y-%m-%d %H:%M:%S")

    # Connect to sheet and read last session if cache is empty
    if _last_report_dt is None:
        last_dt, last_date, last_sess = _get_last_session_info_from_sheet(ws)
        if last_dt is not None:
            _last_report_dt = last_dt
            _current_date_str = last_date
            _current_session_num = last_sess
        else:
            _last_report_dt = peru_now
            _current_date_str = peru_date_str
            _current_session_num = 1

    # Check inactivity: if more than 1 hour (3600 seconds) has elapsed since the last report
    elapsed_seconds = (peru_now - _last_report_dt).total_seconds()
    
    needs_separator = False
    if elapsed_seconds > 3600:
        needs_separator = True
        if peru_date_str != _current_date_str:
            _current_session_num = 1
        else:
            _current_session_num += 1
        _current_date_str = peru_date_str
    else:
        if peru_date_str != _current_date_str:
            _current_session_num = 1
            _current_date_str = peru_date_str

    _last_report_dt = peru_now
    game_label = f"{_current_date_str}_S{_current_session_num}"
    report.id = game_label # update report in memory so it matches

    rows_to_append = []
    
    if needs_separator:
        separator_row = [
            timestamp,
            f"=== NUEVA SESIÓN ({_current_date_str} S{_current_session_num}) ===",
            "=====================",
            "======="
        ]
        rows_to_append.append(separator_row)

    rows_to_append.extend([
        [timestamp, game_label, nick, round(bal, 2)]
        for nick, bal in report.final_balances.items()
    ])

    if not rows_to_append:
        return False
        
    return _append_rows_with_retry(rows_to_append)


# ── User Authentication Sheet Database ─────────────────────────────────

# ID del Excel de usuarios (extraído de la URL)
GOOGLE_SHEETS_USERS_ID = "131kOaokkJpFHyqd3EJmLpdeK0_xKe3LWhuQCQl8fyZg"

_users_worksheet = None
_users_init_attempted = False

def _get_users_worksheet():
    """Lazily connect to the users spreadsheet. Returns the Worksheet or None on failure.
    Usa la misma lógica de conexión que _get_worksheet (partidas)."""
    global _users_worksheet, _users_init_attempted
    if _users_worksheet is not None:
        return _users_worksheet
    if _users_init_attempted:
        return None
    _users_init_attempted = True

    if not is_enabled():
        return None

    cred_path = GOOGLE_SHEETS_CREDENTIALS
    sheet_id  = GOOGLE_SHEETS_USERS_ID
    try:
        creds = Credentials.from_service_account_file(cred_path, scopes=_SCOPES)
        client = gspread.authorize(creds)
        sheet  = client.open_by_key(sheet_id)

        # Abrir la hoja "Usuarios". Si no existe, crearla.
        try:
            ws = sheet.worksheet("Usuarios")
        except gspread.exceptions.WorksheetNotFound:
            ws = sheet.add_worksheet(title="Usuarios", rows="1000", cols="3")
            ws.insert_row(["Usuario", "Contraseña", "Apodo"], 1)

        _users_worksheet = ws
        return _users_worksheet
    except Exception as exc:
        print(f"[sheets] No se pudo conectar a Google Sheets de usuarios: {exc!r}")
        return None


def hash_password(password: str) -> str:
    """Hash the password securely using SHA-256."""
    return hashlib.sha256(password.encode("utf-8")).hexdigest()

def register_user(username, password) -> tuple[bool, str]:
    ws = _get_users_worksheet()
    if ws is None:
        return False, "Base de datos de usuarios no disponible."
        
    username_clean = username.strip()
    password_clean = password.strip()
    
    if not username_clean or not password_clean:
        return False, "El usuario y la contraseña no pueden estar vacíos."
        
    try:
        # Get all records to check for duplicates
        rows = ws.get_all_values()
        for r in rows[1:]:
            if len(r) > 0 and r[0].lower().strip() == username_clean.lower():
                return False, "El usuario ya está registrado."
                
        # Append new user row with hashed password
        hashed_pass = hash_password(password_clean)
        ws.append_row([username_clean, hashed_pass, ""], value_input_option="USER_ENTERED")
        return True, "¡Registro exitoso!"
    except Exception as e:
        return False, f"Error al registrar usuario en Excel: {e!r}"

def login_user(username, password) -> tuple[bool, str, str]:
    ws = _get_users_worksheet()
    if ws is None:
        return False, "Base de datos de usuarios no disponible.", ""
        
    username_clean = username.strip().lower()
    password_clean = password.strip()
    hashed_pass = hash_password(password_clean)
    
    try:
        rows = ws.get_all_values()
        for r in rows[1:]:
            if len(r) >= 2 and r[0].lower().strip() == username_clean:
                if r[1] == hashed_pass:
                    apodo = r[2] if len(r) > 2 else ""
                    return True, "Inicio de sesión exitoso.", apodo
                else:
                    return False, "Contraseña incorrecta.", ""
        return False, "Usuario no encontrado.", ""
    except Exception as e:
        return False, f"Error al conectar: {e!r}", ""

def change_password(username, new_password) -> tuple[bool, str]:
    ws = _get_users_worksheet()
    if ws is None:
        return False, "Base de datos de usuarios no disponible."
        
    username_clean = username.strip().lower()
    new_password_clean = new_password.strip()
    
    if not new_password_clean:
        return False, "La contraseña no puede estar vacía."
        
    hashed_pass = hash_password(new_password_clean)
    
    try:
        rows = ws.get_all_values()
        for idx, r in enumerate(rows):
            if idx == 0:
                continue
            if len(r) > 0 and r[0].lower().strip() == username_clean:
                row_num = idx + 1
                ws.update_cell(row_num, 2, hashed_pass)
                return True, "Contraseña actualizada con éxito."
        return False, "Usuario no encontrado."
    except Exception as e:
        return False, f"Error al actualizar la contraseña: {e!r}"

def update_user_apodo(username, apodo) -> bool:
    ws = _get_users_worksheet()
    if ws is None:
        return False
        
    username_clean = username.strip().lower()
    apodo_clean = apodo.strip()
    
    try:
        rows = ws.get_all_values()
        for idx, r in enumerate(rows):
            if idx == 0:
                continue
            if len(r) > 0 and r[0].lower().strip() == username_clean:
                row_num = idx + 1
                ws.update_cell(row_num, 3, apodo_clean)
                return True
        return False
    except Exception as e:
        print(f"[sheets] Error al actualizar apodo: {e!r}")
        return False
