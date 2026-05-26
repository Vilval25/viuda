# Archivos de sonido

Efectos de sonido en MP3. El código los referencia por estos nombres
exactos (mapa `EFFECT_FILES` en `src/hooks/useSound.js`):

- `swap-all.mp3`   — cambiar toda la mano
- `swap-one.mp3`   — cambiar una carta por la de la mesa
- `pass.mp3`       — pasar turno
- `stand.mp3`      — plantarse
- `showdown.mp3`   — empieza el showdown
- `new-offer.mp3`  — se publica una oferta de intercambio

## Música de fondo

La música de fondo NO es un archivo local: se reproduce desde un video de
YouTube (un MP3 de horas sería demasiado pesado para alojarlo aquí).

Configúrala con la variable de entorno `VITE_YOUTUBE_MUSIC_ID` — el ID del
video (la parte después de `v=` en la URL de YouTube). Ver `.env.example`.

Si la variable se deja vacía, no hay música de fondo y el panel de sonido
solo muestra el control de efectos.
