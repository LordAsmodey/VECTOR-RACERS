# Vector Racers

Monorepo: **pnpm** workspaces + **Turborepo** (`apps/web`, `apps/api`, `packages/shared`, `packages/db`, `packages/config`).

**Документация:** см. каталог [`docs/`](./docs/README.md) (разработка, ADR).

## Prerequisites

- Node.js **20+** or **22+** (see `.nvmrc`)
- [pnpm](https://pnpm.io/) 9.x (`corepack enable && corepack prepare pnpm@9.15.4 --activate`)

## Setup

```bash
cp .env.example .env
pnpm install
```

Подробнее: [docs/development.md](./docs/development.md).

### Docker Compose (PostgreSQL и Redis)

Приложения (**не** в контейнерах) запускаются локально через `pnpm dev`. База и Redis через Compose:

```bash
docker compose -f docker-compose.dev.yml up -d
```

- **PostgreSQL 16** и **Redis 7** с именованными томами и `healthcheck`; Redis стартует после готовности Postgres (`depends_on` + `service_healthy`).
- Значения в [`.env.example`](./.env.example) — `DATABASE_URL` и `REDIS_URL` — рассчитаны на `localhost:5432` и `localhost:6379` с теми же учётными данными, что и в `docker-compose.dev.yml` (`postgres` / `postgres`, БД `vector_racers`). После `cp .env.example .env` дополнительно менять ничего не нужно для этого сценария.

Остановка: `docker compose -f docker-compose.dev.yml down` (данные в томах сохраняются; для полного сброса добавьте `-v`).

## Scripts (root)

| Script        | Description                    |
|---------------|--------------------------------|
| `pnpm dev`    | `turbo dev` — web + api + shared watch |
| `pnpm build`  | `turbo build` — all workspaces       |
| `pnpm lint`   | `turbo lint`                         |
| `pnpm typecheck` | `turbo typecheck`                 |
| `pnpm test`     | API unit tests (Jest)              |
| `pnpm db:generate` | Prisma Client in `packages/db` |
| `pnpm db:migrate` | Prisma migrate dev (`packages/db`) |
| `pnpm db:seed` | Prisma db seed (`packages/db`) |

## Environment variables

Корневой [`.env.example`](./.env.example) — единый ориентир для локальной разработки и CI. Кратко:

| Variable | Назначение |
|----------|------------|
| `API_URL` / `NEXT_PUBLIC_API_URL` | Базовый URL API (браузер и сервер) |
| `PORT` | Порт NestJS (в `apps/api`; см. [docs/development.md](./docs/development.md)) |
| `DATABASE_URL` | PostgreSQL для Prisma в `packages/db` |
| `REDIS_URL` | Redis (сессии, refresh-токены — по задачам) |
| `JWT_*_KEY_PATH` | Пути к PEM для RS256 (TASK-006) |
| `CORS_ORIGINS` | Разрешённые origin для API |
| `METRICS_TOKEN` | Защита endpoint метрик (PHASE 10–11) |
| `STRIPE_*` | Опционально, post-MVP |

## Packages

- **`@vector-racers/web`** — Next.js (App Router)
- **`@vector-racers/api`** — NestJS
- **`@vector-racers/shared`** — shared types/physics (no Prisma)
- **`@vector-racers/db`** — Prisma schema & client (`import { PrismaClient } from '@vector-racers/db'`)
- **`@vector-racers/config`** — shared ESLint / TypeScript / Prettier bases

Dependency rules: `apps/web` → `shared` only; `apps/api` → `db` + `shared`.

## Architecture decisions

- [ADR-0001: Monorepo tooling](./docs/adr/ADR-0001-monorepo-tooling.md) — pnpm, Turborepo, границы пакетов.
