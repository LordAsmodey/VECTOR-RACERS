# Vector Racers — game UI design prototypes

Static **HTML + CSS** only (no React). Reference for Next.js `apps/web` per **TASK-012–014** (track renderer placeholder, lobby, race room HUD, disconnect banner, turn timer).

## Screens

| File | Description |
|------|-------------|
| `index.html` | Hub with links to all screens |
| `auth-login.html` | Login: email, password, remember me, link to register |
| `auth-register.html` | Register: display name, email, passwords, terms |
| `lobby.html` | Car grid (5), stats, public rooms, Create Room / Join by code, create-room modal |
| `room-pre-race.html` | Players, ready states, room code, READY CTA |
| `room-race.html` | HUD strip, **vector/wireframe track** (`vector-race-scene.svg`: green perspective rails, cars, thrust vector + landing dot, ghost), thrust bar, minimap, 60s turn timer ring, disconnect banner |
| `room-post-race.html` | Results table, Return to Lobby, Rematch |
| `championships-list.html` | Active / upcoming / past sections with cards |
| `championship-detail.html` | Schedule, leaderboard, Join next event, accordion for rounds |
| `admin-cars.html` | Fleet table + edit form with stat sliders |
| `admin-tracks.html` | Track list + waypoint editor placeholder |
| `replay-viewer.html` | Playback bar, timeline, annotation line |
| `profile.html` | Avatar, stats, medals, rating chart placeholder, recent races |

## Shared assets

- `styles.css` — tokens, shell, layout helpers (includes `--color-vector-*` for wireframe track)
- `components.css` — buttons, forms, cards, tables, HUD, modals, replay, vector viewport + scanlines, etc.
- `vector-race-scene.svg` — static **vector-arcade** race frame (bright green rails on black, perspective grid, checkered line, chevron cars, inertia ghost, thrust arrow + landing dot); reused by `room-race.html` and `replay-viewer.html`

### Visual direction (race view)

Arcade **wireframe / vector-beam** look (dark void, luminous green track edges, simple wedges, CRT-style scanlines) — aligned with classic top-down/perspective vector racers and TASK-012 (neon edge, drag vector, ghost, predicted point). External reference screenshots were used as mood only (URLs may vary).

## Components (high level)

- **Shell:** header, nav, main, footer
- **Cards / stat bars:** car selection (speed, accel, grip, mass)
- **Modal:** `#create-room-modal` — open via link `lobby.html#create-room-modal` (`:target`); Cancel returns to `lobby.html`
- **Race HUD:** metrics row, vector wireframe track scene, thrust meter, minimap (SVG curve + dots), SVG timer ring
- **Data tables:** results, leaderboard, admin, profile history
- **Accordion:** championship rounds (static; second panel `hidden`)

## States

- **Auth:** validation hints via HTML5 attributes (`required`, `minlength`, `pattern`); example error region on login (hidden)
- **Lobby:** one car `card--selected`; modal not shown until hash `#create-room-modal`
- **Pre-race:** mixed ready / waiting
- **Race:** disconnect **banner** example (TASK-014)
- **Post-race:** DNF row with em dash

## Assumptions

- Fonts: **Orbitron** + **Exo 2** from Google Fonts (CDN).
- Breakpoints: ~640px, 768px, 1024px (see `grid` / `grid-2` in `styles.css`).
- Modal without JS: CSS-only `:target` toggle; production will use `<dialog>` or controlled overlay.

## Preview

Open `index.html` in a browser (local file or static server).
