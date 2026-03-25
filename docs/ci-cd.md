# CI/CD (GitHub Actions)

Этот документ описывает workflow `.github/workflows/ci.yml` (TASK-003).

## Триггеры

- `push` в ветку `main`
- `pull_request`
- `workflow_dispatch` с input `docker_push`:
  - `false` (default)
  - `true` (форсирует push Docker-образов при наличии Dockerfile)

## Общая схема

Сначала job `resolve-node` вычисляет `node_major` из `.nvmrc` и валидирует совместимость с `package.json#engines.node`.

Далее выполняются:
- `lint`, `typecheck`, `test`, `build`
- `prisma-pr-checks` (только на `pull_request`)
- `detect-dockerfiles` и `docker-images` (только если обнаружены Dockerfile)

## Node resolution и совместимость

Job `resolve-node` запускает скрипт `.github/scripts/resolve-node-major.mjs`, который:
- читает `.nvmrc` и извлекает major-версию Node
- сравнивает major с `package.json#engines.node`
- публикует `node_major` в `GITHUB_OUTPUT`

Остальные job’ы используют `node_major` в `actions/setup-node`.

## Кэширование (pnpm + Turborepo)

- В каждом job’е используется `actions/setup-node` с:
  - `cache: pnpm`
  - `cache-dependency-path: pnpm-lock.yaml`
  - кеширование pnpm store между запусками workflow
- Turbo cache кешируется отдельным шагом:
  - путь: `.turbo`
  - `key` включает OS, `node_major`, `github.ref_name`, хэши `pnpm-lock.yaml` и `turbo.json`
  - `restore-keys` дают более “мягкое” восстановление при изменениях ref/lockfile

## Основные job’ы

### `lint`

Запускает `pnpm lint`.

### `typecheck`

Запускает `pnpm typecheck`.

### `test`

Запускает `pnpm test` (unit-тесты).

### `build`

Запускает `pnpm build` (сборка всего монорепозитория).

## Prisma PR checks (только для Pull Request)

Job `prisma-pr-checks` выполняется только при `github.event_name == 'pull_request'`.

Команды внутри job’а:
- `prisma validate` по схеме `./prisma/schema.prisma`
- проверка дрейфа миграций:
  - `prisma migrate diff --exit-code`
  - `--shadow-database-url "file:./prisma/.prisma-shadow.db"`
  - сравнение `./prisma/migrations` и `./prisma/schema.prisma`

Что это дает:
- `schema.prisma` синтаксически и структурно валидна
- миграции не “расходятся” со схемой (drift detection)
- миграции не применяются в production/боевую БД: используется shadow DB только на раннере, а результат контролируется `--exit-code`

## Docker build/push в GHCR и gating (безопасно до TASK-020)

Docker job’ы защищены от запуска в момент, когда Dockerfile еще не добавлены в проект.

### `detect-dockerfiles`

Запускает `.github/scripts/check-dockerfiles.mjs` и формирует outputs:
- `has_api_dockerfile`
- `has_web_dockerfile`
- `has_any_dockerfile`

Проверяются файлы:
- `apps/api/Dockerfile`
- `apps/web/Dockerfile`

### `docker-images`

Job `docker-images` запускается только если `detect-dockerfiles.outputs.has_any_dockerfile == 'true'`.

Публикация в GHCR управляется переменной `SHOULD_PUSH`:
- `github.event_name != 'pull_request'`
- и одновременно:
  - ветка `main` *или*
  - `workflow_dispatch` + input `docker_push == 'true'`

Дополнительно:
- `docker/login-action` выполняется только при `SHOULD_PUSH == 'true'`
- `docker/build-push-action` получает `push: ${{ env.SHOULD_PUSH == 'true' }}`
- build конкретного образа пропускается, если соответствующий Dockerfile отсутствует

### Почему это безопасно до TASK-020

До TASK-020 Dockerfile’ы для `apps/api` и/или `apps/web` обычно отсутствуют. В этом случае:
- `detect-dockerfiles` выставляет `has_any_dockerfile == 'false'`
- job `docker-images` пропускается полностью

В результате workflow не пытается собрать/опубликовать Docker-образы, пока Docker инфраструктура еще не реализована (то есть до появления файлов из TASK-020).

После TASK-020 push начнется на `main` и по `workflow_dispatch`, а для `pull_request` останется build без публикации.

## Где смотреть исходники

- Workflow: `.github/workflows/ci.yml`
- Node script: `.github/scripts/resolve-node-major.mjs`
- Docker gating script: `.github/scripts/check-dockerfiles.mjs`

