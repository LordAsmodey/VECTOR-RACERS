# Разработка (monorepo)

## Требования

- **Node** 20+ или 22+ (см. `.nvmrc` и `engines` в корневом `package.json`).
- **pnpm** 9.x: `corepack enable && corepack prepare pnpm@9.15.4 --activate`.

## Первый запуск

```bash
cp .env.example .env
pnpm install
```

Переменные описаны в [Переменные окружения](#переменные-окружения). Для БД и Redis подними **Docker Compose** из корня репозитория или используй локальные сервисы.

```bash
docker compose -f docker-compose.dev.yml up -d
```

Файл `docker-compose.dev.yml`: PostgreSQL 16 и Redis 7; креды Postgres берутся из `.env` (`POSTGRES_*`), не из литералов в YAML. После `cp .env.example .env` примеры в файле согласованы с `DATABASE_URL` и `REDIS_URL`.

Подробная справка: [docker-compose-dev.md](./docker-compose-dev.md).

## Команды из корня

| Команда | Назначение |
|---------|------------|
| `pnpm dev` | Turborepo: параллельные `dev` в пакетах (Next, Nest, watch shared/db по необходимости). |
| `pnpm build` | Сборка всех пакетов; `^build` гарантирует порядок зависимостей. |
| `pnpm lint` | Линт во всех пакетах, где зада скрипт. |
| `pnpm typecheck` | `tsc --noEmit` / проверки типов. |
| `pnpm test` | Unit-тесты API (Jest, `@vector-racers/api`). |
| `pnpm --filter @vector-racers/web test` | Unit/integration тесты web (`Vitest` + `React Testing Library`). |
| `pnpm e2e` | E2E тесты web (`Playwright`), включая smoke auth-флоу. |
| `pnpm db:generate` | `prisma generate` в `packages/db`. |
| `pnpm db:migrate` | `prisma migrate dev` в `packages/db`. |
| `pnpm db:seed` | seed в `packages/db` (см. TASK-005). |

## Порты и URL

| Сервис | По умолчанию | Примечание |
|--------|----------------|------------|
| Next.js (`apps/web`) | `3000` | `next dev` / `next start`. |
| NestJS (`apps/api`) | `API_PORT` или **3001** | В `apps/api/src/main.ts` — `API_PORT` (предпочтительно), иначе `PORT`, иначе 3001. В `.env.example`: `API_PORT=3001` вместе с `API_URL` / `NEXT_PUBLIC_API_URL`. Не задавайте общий `PORT=3001` для всего monorepo, если он же попадает в Next — лучше только `API_PORT`. |

## Auth module (TASK-006)

Реализован модуль аутентификации в `apps/api/src/auth` с валидацией DTO (`class-validator`) и интеграцией `JwtAuthGuard`/`JwtStrategy` для защищенных endpoint-ов через `@UseGuards(JwtAuthGuard)`.

### Endpoint-ы

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`

### Токены и сессия refresh

- `access token`: TTL `15m`, алгоритм подписи `RS256`.
- `refresh token`: TTL `30d`, хранится в Redis по ключу `rt:{userId}:{jti}`.
- При `logout` refresh-токен инвалидируется удалением записи из Redis.
- Хеширование паролей: `bcrypt`, `12` раундов.

### Переменные окружения для JWT

Для запуска auth-модуля должны быть заданы пути к RSA PEM-ключам:

- `JWT_ACCESS_PUBLIC_KEY_PATH`
- `JWT_ACCESS_PRIVATE_KEY_PATH`
- `JWT_REFRESH_PUBLIC_KEY_PATH`
- `JWT_REFRESH_PRIVATE_KEY_PATH`

## Auth UI (TASK-007)

В `apps/web` реализованы страницы аутентификации на Next.js App Router с `react-hook-form` + `zod`:

- `GET /login`
- `GET /register`

Для обмена с API используется Next Route Handler proxy:

- `POST /api/auth/[...action]`

Handler проксирует запросы к backend auth endpoint-ам и управляет `httpOnly` cookie для клиентской сессии. Политика TTL cookie зависит от `rememberMe`:

- `rememberMe = true` -> длительный TTL (persisted cookie);
- `rememberMe = false` -> короткий TTL (session-oriented cookie policy).

Ошибки API приведены к единому формату для UI:

- field-level ошибки маппятся на конкретные поля формы (`email`, `password`, и т.д.);
- глобальные ошибки отображаются как form-level message.

## Lobby (TASK-013)

Страница **`/lobby`** в `apps/web` — защищённый маршрут: в `lobby/layout.tsx` проверяется наличие httpOnly cookie `vr_access_token`; при отсутствии токена выполняется `redirect` на `/login`.

### UI

- Сетка машин из каталога: статы 0–1 отображаются как проценты с анимацией ширины полос; заблокированные машины (`unlockedByDefault: false`) не выбираются.
- Выбранный `carId` сохраняется в **`localStorage`** (`vr_lobby_car_id`).
- Модальное окно «Create room»: выбор трека, `maxPlayers` 2–6, `POST` создания комнаты.
- Ввод 6-символьного кода и **Join by Code** → `POST /api/rooms/join`.
- Список публичных комнат опрашивается **каждые 5 с** через прокси (см. ниже).

### Next.js BFF (same-origin, httpOnly JWT)

Браузер не читает access token из JS; запросы к API идут через Route Handlers:

| Route | Назначение |
|-------|------------|
| `GET /api/catalog/cars` | Прокси на Nest `GET /catalog/cars` с `Authorization: Bearer …` |
| `GET /api/catalog/tracks` | Прокси на `GET /catalog/tracks` |
| `POST /api/rooms` | Прокси на `POST /rooms` |
| `POST /api/rooms/join` | Прокси на `POST /rooms/join` |
| `GET /api/rooms/public` | Прокси на `GET /rooms/public` (JWT не требуется на стороне API) |

Базовый URL бэкенда: `getBackendBaseUrl()` в `apps/web/src/lib/api/backend-url.ts` (`API_URL` / `NEXT_PUBLIC_API_URL`, в dev fallback `http://localhost:3001`).

### NestJS catalog

Модуль `apps/api/src/catalog/`:

- `GET /catalog/cars` и `GET /catalog/tracks` под **`JwtAuthGuard`**; `stats` у машин отдаются как распарсенный JSON.

### Маршрут комнаты после create/join

Редирект на **`/room/[id]`**; полноценный pre-race / race UI — **TASK-014** (сейчас возможна минимальная заглушка страницы).

### Тесты

- Unit / интеграция (web): Vitest — `lobby-client.test.tsx`, прокси `api/catalog/*`, `api/rooms/*`.
- Unit (api): Jest — `catalog.service.spec.ts`.
- E2E: Playwright — `e2e/lobby.spec.ts`; в `e2e/auth.spec.ts` при моке успешного login/register ответ прокси дополняется заголовком **`Set-Cookie`** с `vr_access_token`, иначе layout лобби отправит обратно на `/login`.

### Заметка по списку публичных комнат

`GET /rooms/public` читает **PostgreSQL**; только что созданная комната может кратко отсутствовать в списке, пока не завершится синхронизация с Redis (см. TASK-009).

## Prisma (`packages/db`)

- Схема: `packages/db/prisma/schema.prisma`.
- Клиент генерируется в `packages/db/src/generated/` (в git не коммитится).
- Импорт в приложениях только так: `import { PrismaClient } from '@vector-racers/db'`.
- Рабочая директория для CLI — пакет `packages/db` (корневые скрипты `db:*` вызывают prisma с `--schema`).

## Физика игры (TASK-008 · Детерминированный движок)

Детерминированная физика и прогресс лэйна реализованы в `packages/shared/src/physics.ts`:

- `applyMove(state: CarState, input: MoveInput, track: TrackDef): CarState` — один фиксированный шаг интеграции (скорость -> позиция) без мутаций входных объектов.
- `trackProgress(x, y, waypoints)` — прогресс по циклической центральной линии в диапазоне `[0..1)` и квадрат расстояния до ближайшего сегмента.

Ключевые правила (сигнал для логики игры/рендеринга):

- Прогресс вычисляется по ближайшему сегменту циклической полилинии из `track.waypoints` и нормализуется к длине трека; при `prog ≈ 1` выполняется стабильный wrap в `0`.
- `offTrack` считается по сравнению квадрата расстояния до центральной линии и `track.halfWidth^2`.
- Счётчик `laps` инкрементируется при переходе через “mid”-событие: если было `prevMid=true` и `prevProg>0.82`, а стало `newProg<0.18`.
- Управление ослабляется off-track штрафом через `ctrlEffective`: penalty применяется к “эффективности управления” на шаге, а `offTrack` пересчитывается после движения.

Тесты детерминизма:

- Unit: `packages/shared/src/physics.test.ts` (сценарии: `on-track slow`, `overshoot` на высокой скорости, инкремент `lap`, off-track penalty, влияние `grip` на инерцию).
- Smoke: `apps/web/src/lib/applyMove.smoke.test.ts` (доп. проверка, что `applyMove` детерминирован и не мутирует входные данные).

## Границы пакетов

- **`apps/web`** — только `@vector-racers/shared`; **не** зависит от `@vector-racers/db`.
- **`apps/api`** — `@vector-racers/db` и `@vector-racers/shared`.
- **`packages/shared`** — без Prisma и без зависимости от `@prisma/client`.

Подробнее см. [ADR-0001: Monorepo tooling](./adr/ADR-0001-monorepo-tooling.md).
