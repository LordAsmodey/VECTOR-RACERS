# Vector Racers

Monorepo: **pnpm** workspaces + **Turborepo** (`apps/web`, `apps/api`, `packages/shared`, `packages/db`, `packages/config`).

## Prerequisites

- Node.js **20+** or **22+** (see `.nvmrc`)
- [pnpm](https://pnpm.io/) 9.x (`corepack enable && corepack prepare pnpm@9.15.4 --activate`)

## Setup

```bash
cp .env.example .env
pnpm install
```

## Scripts (root)

| Script        | Description                    |
|---------------|--------------------------------|
| `pnpm dev`    | `turbo dev` — web + api + shared watch |
| `pnpm build`  | `turbo build` — all workspaces       |
| `pnpm lint`   | `turbo lint`                         |
| `pnpm typecheck` | `turbo typecheck`                 |
| `pnpm test`     | API unit tests (Jest)              |
| `pnpm db:generate` | Prisma Client in `packages/db` |

## Packages

- **`@vector-racers/web`** — Next.js (App Router)
- **`@vector-racers/api`** — NestJS
- **`@vector-racers/shared`** — shared types/physics (no Prisma)
- **`@vector-racers/db`** — Prisma schema & client (`import { PrismaClient } from '@vector-racers/db'`)
- **`@vector-racers/config`** — shared ESLint / TypeScript / Prettier bases

Dependency rules: `apps/web` → `shared` only; `apps/api` → `db` + `shared`.
