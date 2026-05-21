# Viuda — Reglas del juego

## Descripción general

Viuda es un juego de cartas multijugador para **2 a 9 jugadores**. El objetivo es terminar la partida con la mejor mano de póker posible. Los jugadores pueden intercambiar cartas con una mesa compartida para mejorar su mano antes del enfrentamiento final.

---

## Material

- **Baraja francesa de 54 cartas**: 52 cartas estándar (A, 2–10, J, Q, K en cuatro palos) + 1 Joker negro + 1 Joker rojo.
- La baraja **incluye Jokers** para el reparto de la partida, pero **no** para la determinación del orden de juego.

---

## Antes de empezar — Determinación del orden

1. Se baraja el mazo **sin Jokers** (52 cartas).
2. Se reparte **1 carta boca arriba** a cada jugador.
3. El jugador con la carta de **mayor valor** juega primero; el resto sigue en orden **descendente**.
4. En caso de **empate**, el orden entre los empatados se decide **aleatoriamente**.
5. El sentido de juego es **horario**.

### Valores de las cartas para el orden

| Carta | Valor |
|-------|-------|
| As    | 14 (máximo) |
| K     | 13 |
| Q     | 12 |
| J     | 11 |
| 10–2  | Su valor numérico |

---

## Reparto

1. Se baraja el mazo completo **con Jokers** (54 cartas).
2. Se reparten **5 cartas a cada jugador** y **5 cartas a la mesa**, de forma intercalada siguiendo el orden de juego (la mesa actúa como el último "jugador" de cada ronda).
3. Las cartas de **cada jugador son privadas** — nadie puede ver la mano de otro.
4. Las cartas de la **mesa quedan boca abajo** al inicio — nadie puede verlas.

---

## Desarrollo de la partida

Los jugadores actúan en orden. En su turno, cada jugador elige **una** de las siguientes acciones:

### Acciones disponibles

#### 1. Cambiar toda la mano
- El jugador intercambia **su mano completa** por las **5 cartas de la mesa**.
- Sus cartas antiguas pasan a la mesa y quedan **boca arriba** — todos los jugadores pueden verlas a partir de ese momento.
- Esta acción está **siempre disponible**.

#### 2. Cambiar una carta *(solo si la mesa está boca arriba)*
- El jugador elige **1 carta de su mano** y la intercambia por **1 carta de la mesa** a su elección.
- Solo es posible si un jugador anterior ya cambió su mano completa (lo que volteó la mesa).

#### 3. Pasar el turno
- El jugador no realiza ningún intercambio y cede el turno al siguiente.
- Si un jugador **pasa 2 turnos consecutivos**, queda automáticamente **plantado**.

#### 4. Plantarse
- El jugador declara que está conforme con su mano y no actuará más en la partida.
- Una vez plantado, el jugador **salta todos los turnos** restantes hasta el Showdown.

---

## Condición de Showdown

El Showdown se activa cuando el **primer jugador en plantarse** vuelve a recibir su turno — es decir, cuando ha transcurrido **una vuelta completa** desde que alguien se plantó por primera vez.

> **Ejemplo:** Con 4 jugadores (A, B, C, D), si B se planta en su turno, el Showdown ocurre cuando le vuelve a tocar a B. Los jugadores C, D y A tienen una última oportunidad de actuar antes del enfrentamiento.

---

## Showdown — Evaluación de manos

Al llegar el Showdown, todos los jugadores revelan su mano. Gana el jugador con la **mejor mano de póker**.

### Ranking de manos (de mayor a menor)

| Rango | Mano |
|-------|------|
| 10 | Escalera Real |
| 9  | Escalera de Color |
| 8  | Póker (cuatro iguales) |
| 7  | Full House |
| 6  | Color (Flush) |
| 5  | Escalera (Straight) |
| 4  | Trío |
| 3  | Doble Par |
| 2  | Par |
| 1  | Carta Alta |

### Desempate
Si dos o más jugadores tienen el mismo rango, gana el que tenga las cartas de **mayor valor** dentro de ese rango. Si persiste el empate, se comparan las cartas restantes en orden descendente.

---

## El As

El As es la carta más alta en la mayoría de las situaciones (**vale 14**), pero en una escalera baja (A–2–3–4–5) actúa como **1**, formando la escalera conocida como "rueda" o *wheel*.

---

## Los Jokers

- El **Joker negro** puede sustituir a **cualquier carta negra** (picas ♠ o tréboles ♣) que no esté ya en la mano del jugador.
- El **Joker rojo** puede sustituir a **cualquier carta roja** (corazones ♥ o diamantes ♦) que no esté ya en la mano del jugador.
- El Joker toma automáticamente el valor que **más beneficie** la mano del jugador.
- El Joker **no puede duplicar** una carta que ya esté en la mano. Por ejemplo, si tienes 3♠ y un Joker negro, el Joker no puede ser otro 3♠.
- Si hay **dos Jokers**, cada uno debe representar una carta diferente.

---

## Nueva partida

Al terminar la partida (tras el Showdown), cualquier jugador puede iniciar una nueva. Todos los jugadores vuelven al lobby y pueden unirse a la sala de espera para la siguiente ronda.

---

## Resumen de una partida típica

```
1. Determinar orden → repartir 1 carta sin Joker a cada jugador
2. Repartir 5 cartas a cada jugador + 5 a la mesa (boca abajo)
3. Primer jugador actúa → siguiente → … → turno a turno
4. Cuando alguien se planta, comienza la cuenta regresiva
5. Al completar la vuelta → Showdown
6. Se revelan manos → gana la mejor mano de póker
```
