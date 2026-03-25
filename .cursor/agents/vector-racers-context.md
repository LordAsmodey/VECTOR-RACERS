# Vector Racers — контекст проекта для агентов

**Источник задач и соглашений:** `vector-racers-tasks.md` в корне репозитория (TASK-001 … TASK-025, фазы P0–P12).

## Стек (production task list)

| Область | Технология |
|--------|------------|
| Monorepo | **pnpm** workspaces + **Turborepo** (`turbo.json`) |
| Frontend | `apps/web` — **Next.js 14+** (App Router), **TypeScript** |
| Backend | `apps/api` — **NestJS**, **TypeScript** |
| БД | **PostgreSQL** + **Prisma** (только в пакете БД) |
| Shared | `packages/shared` — типы игры, физика, константы |
| DB package | `packages/db` — npm name **`@vector-racers/db`**: `schema.prisma`, `migrations/`, seed, сгенерированный клиент |
| Config | `packages/config` — базовые eslint/tsconfig/prettier |
| Realtime | **Socket.io** (Nest `@nestjs/platform-socket.io`) + **Redis** adapter |
| Кэш / сессии | **Redis** (refresh-токены, состояние комнат/игры — по задачам) |
| Инфра | **Docker**, Node **20.x или 22.x** LTS (как в `engines` / `.nvmrc`) |

## Границы пакетов (обязательно)

- **`@vector-racers/db`**: единственное место Prisma (`packages/db`). Импорт клиента: `import { PrismaClient } from '@vector-racers/db'` из `apps/api` и seed.
- **`packages/shared`**: **без** зависимости от `@prisma/client` — чтобы Next.js не тащил рантайм БД в клиентский бандл.
- **`apps/web`**: зависит от `@vector-racers/shared`; **не** зависит от `@vector-racers/db`.
- **`apps/api`**: зависит от `@vector-racers/db` и `@vector-racers/shared`.
- Миграции / `prisma migrate` / `prisma generate` — рабочая директория **`packages/db`** (корневые скрипты вида `pnpm db:migrate` вызывают prisma с `--schema packages/db/prisma/schema.prisma` или `cd packages/db`).

## Паттерны из задач (реализация)

- **API:** REST; базовый URL **`API_URL`** (сервер) / **`NEXT_PUBLIC_API_URL`** (браузер). Префикс `/v1` — опционально, фиксировать в коде и документации.
- **Auth:** JWT (access/refresh), bcrypt, refresh в Redis; **не** использовать NextAuth — по задачам токены через **Route Handlers** Next.js и httpOnly cookies где указано (TASK-007).
- **Формы (web):** **React Hook Form** + **Zod** там, где это задано задачами (например auth UI).
- **WebSockets:** клиент **socket.io**; сервер — Nest **GameGateway**, JWT в handshake (`auth.token`), Redis adapter для горизонтального масштаба.
- **Физика:** детерминированный движок в `packages/shared` (`applyMove`, Vitest-тесты).
- **Логирование/метрики/безопасность (prod):** winston, Prometheus `/metrics`, helmet, throttler + Redis, Joi env validation — по PHASE 10–11 в task list.

## Тестирование (ожидаемые места)

| Слой | Инструмент / расположение |
|------|---------------------------|
| Unit shared (физика) | **Vitest** — `packages/shared` |
| API unit/e2e API | **Jest** или **Vitest** + Nest testing — `apps/api` |
| Frontend unit/component | **Vitest** + **React Testing Library** — `apps/web` (если настроено) |
| E2E браузер | **Playwright** — `apps/web/e2e/` (TASK-023) |
| Нагрузка | **k6** — `load-test/` (TASK-024; не часть стандартной «тестовой фазы» оркестратора) |

Команды запуска — из `package.json` корня и пакетов (`pnpm test`, `pnpm e2e`, и т.д.).

## Типичные пути в коде

- `apps/web/app/` — маршруты App Router
- `apps/web/src/components/`, `apps/web/src/lib/` — UI, game client, хуки
- `apps/api/src/` — NestJS модули (`auth/`, `rooms/`, `game/`, `championships/`, …)
- `packages/shared/src/` — `physics.ts`, типы (`CarState`, `TrackDef`, `GameState`, …)
- `packages/db/prisma/` — единственная схема и миграции

## Игровая логика (кратко)

- Очерёдность: `gameState.playerOrder`, `currentPlayerId`, монотонный **`moveSeq`** на комнату.
- Состояние гонки в Redis (`game:{roomId}`) во время игры; синхронизация с Postgres — по задачам.
- Клиент: оптимистичные ходы + сверка с `state_update`; порог расхождения — в «единицах мира», согласованных с физикой (TASK-011).

## Дизайн HTML/CSS → реализация

- Прототипы лежат в `designs/<feature-slug>/`. Перенос в Next.js: **App Router**, компоненты React, существующая стилизация проекта (Tailwind/CSS Modules — как принято в репозитории).
- Игровой UI (трек, HUD) может опираться на **neon / racing** визуальный язык из задач (Canvas TrackRenderer, лобби, комната гонки).

При противоречии между этим файлом и **`vector-racers-tasks.md`** приоритет у **task list** и принятых в репозитории ADR/README.
