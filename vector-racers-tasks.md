# VECTOR RACERS — Production Task List
> Stack: Next.js 14+ (App Router) · NestJS · PostgreSQL · Prisma · Socket.io · Redis · Docker  
> Optional / later: Stripe (платежи не входят в MVP — см. TASK-025)

---

## Conventions & prerequisites (read first)

Эти договорённости снимают типичные неоднозначности при реализации.

### Monorepo и Prisma
- **Пакет `@vector-racers/db`** (папка `packages/db/`) — единственное место для Prisma: `schema.prisma`, каталог `migrations/`, сгенерированный клиент, `prisma/seed.ts`. Ни одна другая пакетная папка не содержит схемы.
- **Клиент**: генерировать в `packages/db` (стандартный `output` или явный `src/generated/client` — зафиксировать в одном `schema.prisma`). Импорт только так: `import { PrismaClient } from '@vector-racers/db'` из `apps/api` и из seed.
- **`packages/shared`**: типы игры (`CarState`, `TrackDef`, …), физика, константы — **без** зависимости от `@prisma/client`, чтобы Next.js не тянул рантайм БД в клиентский бандл.
- **Миграции и CLI**: рабочая директория для `prisma migrate` / `prisma generate` — `packages/db` (корневые скрипты вида `pnpm db:migrate` вызывают `prisma migrate` с `--schema packages/db/prisma/schema.prisma` или через `cd packages/db`). В CI и проде — `prisma migrate deploy` из того же пакета.
- **Seed**: идемпотентный; `package.json` в `packages/db` содержит `prisma.seed`, исполняется через `prisma db seed`.

### API и фронт
- Базовый URL API: `API_URL` (сервер) / `NEXT_PUBLIC_API_URL` (браузер, если нужен). Префикс версии: опционально `/v1` — если вводите, зафиксируйте в TASK-001 и в OpenAPI.
- Webhook Stripe (когда подключите): только отдельный route + проверка подписи; секреты не в клиенте.

### Игровая модель
- **Очерёдность ходов**: при старте гонки зафиксировать порядок (например, порядок подключения к комнате или сортировка по `userId`) и хранить в `gameState.playerOrder: string[]`; `currentPlayerId` берётся из этого массива по `turnIndex`.
- **Каждое действие `submit_move`**: сервер присваивает монотонный `moveSeq` (per room); клиент отбрасывает устаревшие `state_update` с `moveSeq` меньше уже применённого.
- **Отключение игрока**: политика — либо пауза и ожидание реконнекта N секунд, либо авто-проигрыш/пропуск ходов — выберите одну и опишите в `GAME_DISCONNECT_POLICY` (env или константа).

### Физика и единицы
- Координаты трека и машин в одной системе (логические единицы «как в прототипе»). Порог рассинхрона **2px** из TASK-011 имеет смысл только после согласования масштаба канваса (scale): в коде зафиксировать «2 единицы мира» или «2 CSS px после transform» — одно из двух.

---

## PHASE 0 — Infrastructure & Monorepo Setup

### TASK-001 · Monorepo scaffold
```
Create a pnpm workspaces monorepo with the following packages:
- apps/web           (Next.js 14+, App Router, TypeScript)
- apps/api           (NestJS, TypeScript)
- packages/shared    (shared types, game constants, physics engine — no Prisma)
- packages/db        (npm name: @vector-racers/db — Prisma schema, migrations, generated client, seed; see TASK-004)
- packages/config    (eslint, tsconfig, prettier base configs)

Workspace dependencies:
- apps/api depends on @vector-racers/db and @vector-racers/shared
- apps/web depends on @vector-racers/shared (and never on @vector-racers/db)

Requirements:
- pnpm workspaces with hoisted dependencies
- Turborepo for build pipeline (turbo.json with dev/build/lint tasks); `apps/api` build must run after `prisma generate` in `@vector-racers/db` (declare dependency in turbo.json or root scripts)
- Root .env.example with all required env vars documented (include API_URL, NEXT_PUBLIC_API_URL, JWT keys, DATABASE_URL, REDIS_URL, CORS, METRICS_TOKEN, optional STRIPE_* for later)
- packages/shared importable in both apps/web and apps/api
- TypeScript strict mode everywhere
- Node: LTS 20.x or 22.x — pick one in .nvmrc / package.json engines and use consistently in CI/Dockerfile
```

### TASK-002 · Docker Compose (development)
```
Create docker-compose.dev.yml for local development:
- postgres:16 with persistent volume, healthcheck
- redis:7-alpine with persistent volume, healthcheck
- Service depends_on with condition: service_healthy
- .env.example → .env mapping documented in README

Do NOT containerize Next.js or NestJS — they run locally via pnpm dev.
```

### TASK-003 · CI/CD pipeline (GitHub Actions)
```
Create .github/workflows/ci.yml:
- Trigger: push to main, PRs
- Jobs: lint, typecheck, test (unit), build (all workspaces)
- Matrix: same Node major as in engines (.nvmrc)
- Cache: pnpm store, turbo cache
- On merge to main: build Docker images, push to ghcr.io (Dockerfiles from TASK-020; if Dockerfiles do not exist yet, use workflow_dispatch only or a job that builds after TASK-020 is merged)
- Secrets: registry login; runtime secrets (POSTGRES_URL, REDIS_URL) via GitHub Environments for deploy, not for PR builds

Note: PR pipeline should run prisma validate + migrate diff check against packages/db/prisma/schema.prisma, without applying migrations to production.
```

---

## PHASE 1 — Database & Core Models

### TASK-004 · Prisma schema
```
Create packages/db/prisma/schema.prisma with the following models (package @vector-racers/db):

User          { id, email, username, passwordHash, avatarUrl, createdAt, role: PLAYER|ADMIN }
Car           { id, slug, name, stats: Json, imageUrl, unlockedByDefault }
Track         { id, slug, name, waypointsJson, previewUrl, lapCount, difficulty }
Room          { id, code(6-char), status: WAITING|RACING|FINISHED, maxPlayers, createdAt }
RoomPlayer    { roomId, userId, carId, position, laps, isReady }
Championship  { id, name, status: DRAFT|ACTIVE|FINISHED, startAt, endAt }
ChampEvent    { id, championshipId, trackId, orderIndex, status }
ChampResult   { id, champEventId, userId, points, finishPosition, fastestLapMs }
Replay        { id, roomId, movesJson, createdAt }

Rules:
- All foreign keys with cascading deletes where appropriate
- Use @db.Text for JSON fields in PostgreSQL (waypointsJson, stats, movesJson)
- Add @@index on frequently queried foreign keys
- RoomPlayer: unique constraint on (roomId, userId); primary key strategy: @@id([roomId, userId]) or surrogate id — document choice
- Generate and include the initial migration
- Replay.movesJson: store an array of { moveSeq, userId, input: { inputX, inputY }, resultingStateHash? } for deterministic replay and debugging (hash optional)

Post-MVP (optional migration): UserCar or unlock rules if not only unlockedByDefault.
```

### TASK-005 · Seed data
```
Create packages/db/prisma/seed.ts and wire it in packages/db/package.json (prisma.seed). Use PrismaClient from @vector-racers/db. apps/api does not own the seed file.
- 5 Cars with distinct stats (speed, acceleration, grip, mass) as JSON
- 4 Tracks (waypoints arrays matching the physics engine format)
- 1 Admin user (credentials from env vars SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD)
- 1 Championship with 3 events (one per track)

Car stat ranges:
  speed:        0.6 – 1.0  (multiplier on MAX_THRUST)
  acceleration: 0.6 – 1.0  (multiplier on ctrl factor)
  grip:         0.4 – 1.0  (inverse of MAX_INERTIA cap)
  mass:         0.6 – 1.0  (inertia accumulation rate)

Idempotent: use upsert by slug/email where applicable.
```

---

## PHASE 2 — Auth

### TASK-006 · Auth module (NestJS)
```
Implement JWT authentication in apps/api/src/auth/:
- POST /auth/register  { email, username, password } → { accessToken, refreshToken }
- POST /auth/login     { email, password }           → { accessToken, refreshToken }
- POST /auth/refresh   { refreshToken }              → { accessToken }
- POST /auth/logout    (invalidate refresh token in Redis)

Requirements:
- bcrypt password hashing (rounds: 12)
- Access token TTL: 15 min, signed with RS256 (document key generation in README; dev may use single key pair in files)
- Refresh token TTL: 30 days, stored in Redis as "rt:{userId}:{jti}"
- JwtAuthGuard usable as @UseGuards(JwtAuthGuard) globally opt-in
- DTO validation with class-validator
- Return 401 on invalid credentials (no info about which field is wrong)

Optional post-MVP: email verification, password reset — not blocking lobby MVP.
```

### TASK-007 · Auth UI (Next.js)
```
Create app/(auth)/login/page.tsx and app/(auth)/register/page.tsx:
- Form with React Hook Form + Zod validation
- Call /auth/login or /auth/register via fetch, store tokens in httpOnly cookies
  via Next.js Route Handler (apps/web/app/api/auth/[...action]/route.ts)
- Redirect to /lobby on success
- Show field-level validation errors
- "Remember me" checkbox (extends cookie TTL)
- Link between login ↔ register pages
- No external auth libraries (no NextAuth)
```

---

## PHASE 3 — Physics Engine (Shared)

### TASK-008 · Deterministic physics engine
```
Create packages/shared/src/physics.ts — a pure, side-effect-free physics engine
that runs identically on client AND server.

Export:
  applyMove(state: CarState, input: MoveInput, track: TrackDef): CarState

Types:
  CarState    { x, y, vx, vy, laps, mid, prog, offTrack }
  MoveInput   { inputX, inputY }  // clamped thrust vector
  CarStats    { speed, acceleration, grip, mass }  // 0-1 multipliers
  TrackDef    { waypoints: [number,number][], halfWidth: number, lapCount: number }

Physics rules (extract and refactor from the prototype):
  MAX_THRUST   = 82 * car.speed
  MAX_INERTIA  = 0.74 * (1 - car.grip * 0.4)
  inertiaRate  = car.mass
  ctrl         = (1 - inertia) * car.acceleration
  offTrackPenalty = 0.4

  Lap counting:
    progress = trackProgress(x, y, waypoints)
    if progress > 0.42 → mid = true
    if mid && prev_prog > 0.82 && new_prog < 0.18 → laps++, mid = false

Unit tests (Vitest):
  - Car stays on track when moving slowly
  - Car overshoots bend at high speed
  - Lap counter increments correctly after full lap
  - Off-track penalty applied
  - High-grip car has less inertia than low-grip
```

---

## PHASE 4 — Game Server (Realtime)

### TASK-009 · Room management (NestJS REST)
```
Create RoomsModule in apps/api/src/rooms/:
- POST /rooms            { trackId, carId, maxPlayers }  → Room (creates, sets code)
- POST /rooms/join       { code, carId }                 → Room
- GET  /rooms/:id        → Room with players
- GET  /rooms/public     → list of WAITING rooms (paginated)

Room code: 6 uppercase alphanumeric, unique, generated on creation.
Validate: user not already in another active room.
Store room state in Redis hash "room:{id}" for fast access by game gateway.
Sync to Postgres async (non-blocking); define retry/backoff for failed syncs (log + metric).
```

### TASK-010 · Game Gateway (Socket.io)
```
Create GameGateway in apps/api/src/game/game.gateway.ts:

Events client→server:
  'join_room'    { roomId }        → joins socket room, broadcasts 'player_joined'
  'player_ready' {}                → marks player ready, if all ready → emit 'game_start'
  'submit_move'  { inputX, inputY }

Events server→client:
  'player_joined'  { players[] }
  'game_start'     { gameState, playerOrder, moveSeq: 0 }
  'state_update'   { gameState, lastMove, moveSeq }
  'game_end'       { results[] }
  'error'          { code, message }

Server-side move processing:
  1. Validate it's the submitting player's turn (match socket userId to currentPlayerId)
  2. Increment moveSeq; reject stale/duplicate submits if moveSeq mismatch
  3. Run applyMove() from packages/shared/physics
  4. Persist move to Replay.movesJson (append with moveSeq, userId, input)
  5. Broadcast new gameState to room
  6. Advance turn; if all laps done → emit game_end

Game state stored in Redis "game:{roomId}" during play.
Use @nestjs/platform-socket.io with Redis adapter (@socket.io/redis-adapter).
Auth: JwtWsGuard reading token from handshake.auth.token.

Document disconnect policy (pause vs forfeit) and sync with TASK-014 banner behavior.
```

### TASK-011 · Game state reconciliation (Next.js client)
```
Create apps/web/src/lib/game-client.ts:
- Singleton socket.io client (lazy init, auto-reconnect)
- useGameSocket(roomId) React hook:
    connects, handles join_room/game_start/state_update/game_end
    returns { gameState, submitMove, connectionStatus, lastMoveSeq }
- Optimistic update: apply move locally via applyMove() immediately,
  then reconcile with server state on state_update
- If client state diverges from server (position diff > threshold in WORLD units — same as physics), snap to server; threshold configurable constant
- On state_update: if moveSeq <= lastApplied, ignore or merge carefully
- Disconnect on component unmount
```

---

## PHASE 5 — Game UI

### TASK-012 · Track renderer (Canvas)
```
Create apps/web/src/components/game/TrackRenderer.tsx:
- Pure canvas rendering, no DOM elements on top
- Props: { track: TrackDef, cars: CarState[], currentPlayerId, onMoveInput }
- Render:
    - Track surface with neon edge glow
    - Checkered start/finish line
    - Per-car: body, headlights, player label, speed trail (last 55 positions)
    - Active player drag UI: input vector arrow, predicted landing dot, inertia ghost
    - Thrust bar (bottom-left)
    - Grid-dot background
- Scales to container width maintaining aspect ratio
- Runs at 60fps via requestAnimationFrame (render-only, no game logic here)
- Accept drag events (mouse + touch), call onMoveInput({ inputX, inputY }) on release
```

### TASK-013 · Lobby page
```
Create app/lobby/page.tsx (authenticated route):
- Car selection: grid of 5 cars with name, stats bars (speed/accel/grip/mass)
  Selected car highlighted, stats animate in
- Track preview thumbnails for public rooms
- "Create Room" modal: track picker, max players (2–6)
- "Join by Code" input: 6-char code, JOIN button
- Public rooms list: auto-refreshes every 5s, shows track, players waiting
- Responsive layout
```

### TASK-014 · Race room page
```
Create app/room/[id]/page.tsx:
- Pre-race: player list with ready checkmarks, "READY" button
  Start countdown (3-2-1-GO) when all ready
- During race:
    TrackRenderer (full width)
    HUD: lap counter per player, current speed, turn indicator, inertia %
    Minimap: small overhead view of track with car dots
- Post-race: results table (finish position, total time, fastest lap)
  "Return to Lobby" and "Rematch" buttons
- Handle disconnect: show "Player X disconnected" banner; behavior matches server policy (TASK-010)
- Turn timer: 60s per move, visual countdown ring; auto-submit (0,0) on timeout
```

---

## PHASE 6 — Championships

### TASK-015 · Championship REST API
```
Create ChampionshipsModule in apps/api/src/championships/:
- GET  /championships              → list (status filter)
- GET  /championships/:id          → detail with events and leaderboard
- POST /championships  (ADMIN)     → create { name, events: [{trackId,order}][] }
- POST /championships/:id/start (ADMIN) → set status ACTIVE, open first event
- POST /championships/:id/events/:eid/complete (ADMIN) → record results, award points

Points system (Formula 1 style):
  P1=25, P2=18, P3=15, P4=12, P5=10, P6=8, P7=6, P8=4, P9=2, P10=1
  Fastest lap bonus: +1 (only if finished in top 10)

GET /championships/:id/leaderboard → sorted ChampResult aggregated by userId

Clarify: "Join next event" creates or joins a Room linked to champEventId (add optional room.champEventId in schema or separate mapping table if needed).
```

### TASK-016 · Championship UI
```
Create app/championships/page.tsx and app/championships/[id]/page.tsx:

List page:
  - Active championships highlighted, upcoming and past in separate sections
  - Card: name, tracks preview icons, dates, top 3 current leaders

Detail page:
  - Event schedule: each track with status (upcoming/live/done)
  - Live leaderboard table: position, avatar, username, points, events played
  - "Join next event" button (opens room for current active event)
  - Event results accordion (expand to see per-race finishing order)
```

---

## PHASE 7 — Cars & Tracks CMS

### TASK-017 · Car & Track admin panel
```
Create app/admin/ (ADMIN role guard on all routes):

/admin/cars:
  - List all cars with slug, stats, default/locked status
  - Create/Edit form: name, slug, stats sliders (0–1 step 0.05), image upload
  - Image storage: prefer S3-compatible storage (env) for prod; local /public only for dev
  - If local: document Docker volume mount for prod or accept ephemeral storage limitation

/admin/tracks:
  - List tracks with difficulty badge, lap count
  - Create/Edit: visual waypoint editor on canvas
      Click to add waypoint, drag to reposition, right-click to delete
      Live preview of track shape with half-width fill
      Set halfWidth, lapCount, difficulty (EASY/MEDIUM/HARD/EXPERT)
  - Export waypoints JSON, import from JSON file
```

---

## PHASE 8 — Replay System

### TASK-018 · Replay viewer
```
Create app/replays/[id]/page.tsx:
- Fetch Replay.movesJson from GET /replays/:id
- Reconstruct full game state sequence by replaying all moves in moveSeq order
  through applyMove() (same physics, deterministic)
- Playback controls: play/pause, 2×/4× speed, scrub timeline
- Per-turn scrubbing: slider shows turn number, seek to any point
- TrackRenderer shows all cars at current playback position
- "Turn N — PLAYER X" annotation on each move
```

---

## PHASE 9 — Profiles & Social

### TASK-019 · User profile
```
Create app/profile/[username]/page.tsx:
- Avatar (upload via PATCH /users/me with multipart), username, join date
- Stats: total races, wins, win rate, avg finish position, total laps
- Championship medals: gold/silver/bronze icons per championship
- Recent races table (last 10): track, position, date, link to replay
- Career chart: finish positions over last 20 races (Recharts LineChart)
- Self-profile shows "Edit" button (username change, avatar upload)

Requires: persisted race results linked to users (extend schema if results only exist inside Replay — define aggregation strategy).
```

---

## PHASE 10 — Production Deployment

### TASK-020 · Production Docker Compose
```
Create docker-compose.prod.yml:
- api: built from apps/api/Dockerfile (multi-stage, node:20-alpine or 22-alpine — match engines)
- web: built from apps/web/Dockerfile (standalone Next.js output)
- postgres:16 with volume
- redis:7-alpine with volume
- nginx: reverse proxy for web (:3000) and api (:4000), SSL termination
  nginx.conf included; cert paths from env
- All secrets via environment variables (no hardcoded values)
- Restart policy: unless-stopped on all services

apps/api/Dockerfile:
  Stage 1 (builder): install all deps from monorepo root, build NestJS
  Stage 2 (runner):  copy apps/api dist, production node_modules (workspace layout preserved), and packages/db (schema + migrations + generated client)
  Migrations: prisma migrate deploy with schema packages/db/prisma/schema.prisma on startup OR separate init job — document one approach; DATABASE_URL required

apps/web/Dockerfile:
  Stage 1 (builder): install all deps, next build (output: standalone)
  Stage 2 (runner):  copy standalone output, run with node server.js
```

### TASK-021 · Observability
```
Add structured logging and metrics:

Logging (apps/api):
  - Replace NestJS default logger with winston
  - JSON format in production, pretty in development
  - Log levels from LOG_LEVEL env var
  - Request logging: method, path, status, duration, userId
  - Error logging: stack trace, request context
  - Structured fields: { service: "api", env, version }

Metrics (apps/api):
  - /metrics endpoint (Prometheus format, protected by METRICS_TOKEN)
  - Counters: http_requests_total (by method, route, status)
  - Histograms: http_request_duration_ms, game_move_processing_ms
  - Gauges: active_rooms, connected_sockets, redis_pool_size

Health checks:
  - GET /health → { status, db, redis, uptime }
  - Used by Docker HEALTHCHECK and nginx upstream checks
```

### TASK-022 · Rate limiting & security hardening
```
Apply to apps/api:
- helmet() middleware (CSP, HSTS, X-Frame-Options)
- Rate limiting via @nestjs/throttler backed by Redis:
    Global:          100 req / 15 min per IP
    POST /auth/*:     10 req / 15 min per IP
    POST /rooms:      20 req / hour per user
    Socket events:    30 events / 10 sec per socket (custom WS throttler)
- CORS: whitelist from ALLOWED_ORIGINS env var
- Request size limit: 64kb (json body parser)
- SQL injection: Prisma parameterized queries only (no raw where avoidable)
- Input sanitisation: strip HTML from all string DTOs with class-sanitizer
- Env var validation on startup with Joi schema (fail fast if missing)
```

---

## PHASE 11 — Quality

### TASK-023 · E2E tests (Playwright)
```
Create apps/web/e2e/ with Playwright:
- auth.spec.ts:   register → login → logout flow
- lobby.spec.ts:  create room → join room → see room code
- race.spec.ts:   two-player race (use two browser contexts), complete 1 lap each
  Verify: turn alternates, laps increment, winner screen appears

Test fixtures:
  - createAuthenticatedUser(page) helper
  - Seed database before each test suite: call /test/seed endpoint (TEST_MODE=true only) or `pnpm --filter @vector-racers/db exec prisma migrate reset` (or equivalent from packages/db) against test DB

Infrastructure:
  - docker-compose.test.yml: postgres:16 (or testcontainers) + redis + api + web; DATABASE_URL points to test Postgres
  - Do NOT use SQLite for E2E if schema uses PostgreSQL-specific types (@db.Text, enums) — keep provider consistent

Run via: pnpm e2e (headed: false by default, HEADED=1 for debug)
CI: run against docker-compose.test.yml with isolated DB
```

### TASK-024 · Load testing
```
Create load-test/ with k6:
- scenarios/race.js: 50 concurrent users, each completing a full 3-lap race
  Steps: register → login → create/join room → ready → submit 20 moves
- scenarios/championship.js: 20 users joining championship, 4 simultaneous rooms
- Thresholds:
    http_req_duration p95 < 200ms
    ws_session_duration p95 < 30s per move round-trip
    error_rate < 1%
- Output: JSON summary + HTML report (k6-reporter)
```

---

## PHASE 12 — Payments (optional, post-MVP)

### TASK-025 · Stripe integration (stub)
```
Not required for core gameplay. When needed:
- Stripe Customer linked to User (stripeCustomerId on User)
- Checkout or Portal for cosmetic purchases / season pass (define product catalog)
- Webhook endpoint: verify signature, idempotent event handling (store processed event ids in Redis or DB)
- Never trust client price; validate amount server-side

Until implemented, remove Stripe from deployment secrets checklist or leave keys empty.
```

---

## Appendix — Shared Types Reference

```typescript
// packages/shared/src/types.ts (must exist before TASK-008)

export interface CarStats {
  speed: number;        // 0–1
  acceleration: number; // 0–1
  grip: number;         // 0–1
  mass: number;         // 0–1
}

export interface CarState {
  id: string;           // userId
  x: number; y: number;
  vx: number; vy: number;
  laps: number;
  mid: boolean;
  prog: number;
  offTrack: boolean;
}

export interface MoveInput {
  inputX: number;       // thrust vector, magnitude ≤ MAX_THRUST
  inputY: number;
}

export interface TrackDef {
  waypoints: [number, number][];
  halfWidth: number;
  lapCount: number;
}

export interface GameState {
  roomId: string;
  turnIndex: number;
  playerOrder: string[];  // fixed order for turns
  currentPlayerId: string;
  cars: CarState[];
  status: 'waiting' | 'racing' | 'finished';
  results?: RaceResult[];
}

export interface RaceResult {
  userId: string;
  finishPosition: number;
  totalTurns: number;
  fastestLapTurns: number;  // or tie to wall-clock ms if added to state machine
}
```

### Replay move record (suggested shape)
```typescript
export interface PersistedMove {
  moveSeq: number;
  userId: string;
  input: { inputX: number; inputY: number };
}
```

---

## Execution Order

```
P0: 001 → 002 → 003
P1: 004 → 005
P2: 006 → 007
P3: 008  ← unblock P4 and P5
P4: 009 → 010 → 011
P5: 012 → 013 → 014
P6: 015 → 016
P7: 017
P8: 018
P9: 019
P10: 020 → 021 → 022
P11: 023 → 024
P12: 025 (optional, when product requires payments)
```

> Each task block should stay self-contained. Prisma lives only in `@vector-racers/db` (`packages/db`); do not add a second schema or client package.

---

## Gaps intentionally left open

| Topic | Recommendation |
|-------|----------------|
| i18n | Add when audience is not English-only |
| Mobile PWA | Add manifest + service worker after core UX is stable |
| OpenAPI | Generate from NestJS decorators for frontend and QA |
| GDPR / account deletion | Legal requirement depends on jurisdiction |
