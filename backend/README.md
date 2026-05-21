# Backend — viuda

FastAPI + WebSockets nativos. Todo el estado vive en memoria (sin base de datos).

## Requisitos

- Python 3.11+
- (Recomendado) Entorno virtual

## Instalación

```bash
cd backend
python -m venv venv
# Windows
venv\Scripts\activate
# macOS/Linux
source venv/bin/activate

pip install -r requirements.txt
```

## Arranque

```bash
uvicorn app.main:app --reload --port 8000
```

El servidor queda disponible en `http://localhost:8000`.  
El endpoint WebSocket está en `ws://localhost:8000/ws`.

## Reportes en Google Sheets (opcional)

Al terminar una partida, el balance final de cada jugador se envía a una hoja de
cálculo de Google (una fila por jugador: `Fecha y hora | Partida | Jugador | Balance`).
En el lobby aparece un enlace con el ícono de Sheets que abre esa hoja.

Si no se configura, el juego funciona igual; los reportes simplemente no se suben.

### Configuración

1. **Crear una hoja de cálculo** en Google Sheets. Anota su ID (la cadena larga
   en la URL: `https://docs.google.com/spreadsheets/d/<ID>/edit`).

2. **Crear una cuenta de servicio** en [Google Cloud Console](https://console.cloud.google.com/):
   - Crea (o usa) un proyecto.
   - Habilita la **Google Sheets API**.
   - En *IAM y administración → Cuentas de servicio*, crea una cuenta de servicio.
   - Genera una **clave JSON** y descárgala.

3. **Compartir la hoja** con el email de la cuenta de servicio
   (`...@...iam.gserviceaccount.com`), con permiso de *Editor*.

4. **Definir las variables de entorno** antes de arrancar el servidor:

   | Variable                     | Descripción                                              |
   |------------------------------|----------------------------------------------------------|
   | `GOOGLE_SHEETS_CREDENTIALS`  | Ruta al archivo JSON de la cuenta de servicio            |
   | `GOOGLE_SHEETS_ID`           | ID de la hoja de cálculo                                 |
   | `GOOGLE_SHEETS_URL`          | URL completa de la hoja (se muestra como enlace en el lobby) |

   ```bash
   # Windows (PowerShell)
   $env:GOOGLE_SHEETS_CREDENTIALS = "C:\ruta\credenciales.json"
   $env:GOOGLE_SHEETS_ID  = "1AbC...xyz"
   $env:GOOGLE_SHEETS_URL = "https://docs.google.com/spreadsheets/d/1AbC...xyz/edit"

   # macOS/Linux
   export GOOGLE_SHEETS_CREDENTIALS="/ruta/credenciales.json"
   export GOOGLE_SHEETS_ID="1AbC...xyz"
   export GOOGLE_SHEETS_URL="https://docs.google.com/spreadsheets/d/1AbC...xyz/edit"
   ```

> **No subas el archivo JSON de credenciales al repositorio.** En producción
> (Render, etc.) cárgalo como *secret file* y apunta `GOOGLE_SHEETS_CREDENTIALS` a su ruta.
