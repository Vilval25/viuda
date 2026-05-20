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
