# ADR-0001: Monorepo tooling and package boundaries

| Field | Value |
|--------|--------|
| Status | Accepted |
| Date | 2026-03-25 |
| Deciders | TASK-001 (vector-racers-tasks.md) |

## Context

Проект Vector Racers — монорепозиторий с фронтом (Next.js), API (NestJS), общей логикой и единым пакетом БД (Prisma). Нужны предсказуемые сборки, кэширование задач и жёсткие границы зависимостей (чтобы клиент не тянул Prisma).

## Decision

- **Менеджер пакетов и workspace:** `pnpm` workspaces, в корне `.npmrc` с `shamefully-hoist=true` и `strict-peer-dependencies=false` для совместимости с Nest/Next и типичным hoisting.
- **Оркестрация задач:** Turborepo (`turbo.json`): `build`, `dev`, `lint`, `typecheck`; `build` зависит от `^build`, чтобы зависимости (в т.ч. `@vector-racers/db` → `prisma generate`, `@vector-racers/shared` → `tsc`) собирались до приложений.
- **Пакеты:**  
  - `packages/db` (`@vector-racers/db`) — единственное место Prisma; клиент: `import { PrismaClient } from '@vector-racers/db'`.  
  - `packages/shared` — без `@prisma/client`.  
  - `apps/web` зависит только от `shared`; `apps/api` — от `db` и `shared`.  
  - `packages/config` — базовые ESLint/TypeScript/Prettier настройки.
- **Node:** LTS 20.x или 22.x, зафиксировано в `.nvmrc` и `package.json` engines.

## Consequences

**Positive:** Один источник правды для схемы БД; Turbo кэширует сборки; границы пакетов проверяются зависимостями.

**Negative:** Нужен `pnpm install` и понимание порядка `turbo build`; Prisma Client генерируется в `packages/db` (gitignore в `src/generated/`), локально после `pnpm install`/`db:generate` клиент должен быть сгенерирован.

## Alternatives considered

- **npm / Yarn workspaces:** отклонено в пользу pnpm + единого lockfile и дисковой эффективности.
- **Nx вместо Turborepo:** отложено; Turborepo достаточен для задач TASK-001 и уже в task list.
- **Публиковать `@vector-racers/db` в npm:** не требуется; workspace-only.
