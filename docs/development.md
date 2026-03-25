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
| `pnpm test` | Сейчас: unit-тесты API (Jest). |
| `pnpm db:generate` | `prisma generate` в `packages/db`. |
| `pnpm db:migrate` | `prisma migrate dev` в `packages/db`. |
| `pnpm db:seed` | seed в `packages/db` (см. TASK-005). |

## Порты и URL

| Сервис | По умолчанию | Примечание |
|--------|----------------|------------|
| Next.js (`apps/web`) | `3000` | `next dev` / `next start`. |
| NestJS (`apps/api`) | `PORT` или **3000** | В `apps/api/src/main.ts` — `process.env.PORT ?? 3000`. В `.env.example` задано `PORT=3001` вместе с `API_URL` / `NEXT_PUBLIC_API_URL`. Пока Nest не подгружает корневой `.env` автоматически, экспортируйте `PORT` в shell или передайте явно: `PORT=3001 pnpm --filter @vector-racers/api start:dev`. |

## Prisma (`packages/db`)

- Схема: `packages/db/prisma/schema.prisma`.
- Клиент генерируется в `packages/db/src/generated/` (в git не коммитится).
- Импорт в приложениях только так: `import { PrismaClient } from '@vector-racers/db'`.
- Рабочая директория для CLI — пакет `packages/db` (корневые скрипты `db:*` вызывают prisma с `--schema`).

## Границы пакетов

- **`apps/web`** — только `@vector-racers/shared`; **не** зависит от `@vector-racers/db`.
- **`apps/api`** — `@vector-racers/db` и `@vector-racers/shared`.
- **`packages/shared`** — без Prisma и без зависимости от `@prisma/client`.

Подробнее см. [ADR-0001: Monorepo tooling](./adr/ADR-0001-monorepo-tooling.md).
