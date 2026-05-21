# viuda — Juego de cartas multijugador

MVP de juego de cartas en línea. Frontend en React + Vite, backend en Python + FastAPI con WebSockets.

## Estructura

```
viuda/
├── frontend/    # React 19 + Vite
└── backend/     # FastAPI + WebSockets nativos
```

## Arranque rápido

### Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # macOS/Linux
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Abrir `http://localhost:5173` en el navegador.

---

## Despliegue (Vercel + Render)

El frontend se despliega en **Vercel** y el backend en **Render**. El historial
de partidas se guarda en Google Sheets (ver `backend/README.md`).

### 0. Requisitos previos

- El proyecto debe estar en un repositorio de **GitHub**.
- Crea cuentas gratuitas en [vercel.com](https://vercel.com) y [render.com](https://render.com),
  iniciando sesión con tu cuenta de GitHub en ambas.

### 1. Backend en Render

1. En Render: **New → Blueprint**, y selecciona este repositorio.
   Render detecta el archivo `render.yaml` y crea el servicio `viuda-backend`.
2. Antes de finalizar, define las variables de entorno (todas marcadas `sync: false`):
   - `CORS_ORIGINS` — la URL de tu frontend en Vercel (la tendrás en el paso 2;
     puedes dejarla vacía ahora y completarla después).
   - `GOOGLE_SHEETS_ID` y `GOOGLE_SHEETS_URL` — datos de tu hoja de cálculo.
   - `GOOGLE_SHEETS_CREDENTIALS` — ver siguiente punto.
3. **Credenciales de Google**: en el servicio, ve a **Environment → Secret Files**,
   crea un archivo (p. ej. `credentials.json`) y pega el contenido del JSON de la
   cuenta de servicio. Render lo monta en `/etc/secrets/credentials.json`.
   Pon ese path completo en la variable `GOOGLE_SHEETS_CREDENTIALS`.
4. Render despliega y te da una URL como `https://viuda-backend.onrender.com`.

> El plan gratis de Render duerme el servicio tras 15 min sin uso; el primer
> jugador tras la inactividad espera ~50 s a que despierte.

### 2. Frontend en Vercel

1. En Vercel: **Add New → Project**, y selecciona este repositorio.
2. En **Settings → Build and Deployment**, pon **Root Directory = `frontend`**.
   Vercel usará el `frontend/vercel.json` (framework Vite).
3. En **Settings → Environment Variables**, añade:
   - `VITE_WS_URL` = `wss://viuda-backend.onrender.com/ws`
     (usa la URL de Render del paso 1; **`wss`**, no `ws`, porque va sobre HTTPS).
4. Despliega. Vercel te da una URL como `https://viuda.vercel.app`.

### 3. Cerrar el círculo

1. Copia la URL de Vercel del paso 2.
2. En Render, edita la variable `CORS_ORIGINS` y ponla con esa URL.
   El backend se reinicia automáticamente.
3. Abre la URL de Vercel: el juego ya está en línea.

### Resumen de variables de entorno

| Servicio | Variable                    | Valor                                          |
|----------|-----------------------------|------------------------------------------------|
| Render   | `CORS_ORIGINS`              | URL del frontend en Vercel                     |
| Render   | `GOOGLE_SHEETS_ID`          | ID de la hoja de cálculo                       |
| Render   | `GOOGLE_SHEETS_URL`         | URL completa de la hoja                        |
| Render   | `GOOGLE_SHEETS_CREDENTIALS` | Ruta al secret file (`/etc/secrets/...`)       |
| Vercel   | `VITE_WS_URL`               | `wss://<backend>.onrender.com/ws`              |

> **Nota:** el estado del juego vive en memoria. Si Render reinicia el backend
> (al desplegar o por inactividad), las partidas en curso se pierden y los
> jugadores vuelven a la pantalla de nick. El historial en Sheets no se ve afectado.
