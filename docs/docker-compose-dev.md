# Docker Compose (локальная разработка)

Соответствует **TASK-002** в `vector-racers-tasks.md`. Файл в корне репозитория: `docker-compose.dev.yml`.

**Next.js и NestJS в контейнеры не входят** — их запускают на хосте (`pnpm dev`). Compose поднимает только **PostgreSQL 16** и **Redis 7** с постоянными томами и проверками здоровья.

## Сервисы

| Сервис   | Образ              | Порт (хост) | Назначение        |
|----------|--------------------|-------------|-------------------|
| postgres | `postgres:16-alpine` | 5432        | БД Prisma         |
| redis    | `redis:7-alpine`     | 6379        | кэш / сессии (по задачам) |

Учётные данные Postgres в compose: пользователь `postgres`, пароль `postgres`, база `vector_racers`. Redis без пароля (порт по умолчанию).

## Согласование с `.env`

После `cp .env.example .env` значения по умолчанию совместимы с compose:

- `DATABASE_URL=postgresql://postgres:postgres@localhost:5432/vector_racers?schema=public`
- `REDIS_URL=redis://localhost:6379`

Если меняете порты или креды в `docker-compose.dev.yml`, обновите те же переменные в `.env`.

## Зависимости между сервисами

У сервиса `redis` задано `depends_on` для `postgres` с условием `service_healthy`: Redis стартует только после успешного `healthcheck` Postgres (`pg_isready`).

## Команды

Запуск в фоне:

```bash
docker compose -f docker-compose.dev.yml up -d
```

Логи:

```bash
docker compose -f docker-compose.dev.yml logs -f
```

Остановка (тома с данными **сохраняются**):

```bash
docker compose -f docker-compose.dev.yml down
```

Полный сброс данных (удалить именованные тома):

```bash
docker compose -f docker-compose.dev.yml down -v
```

Проверка конфигурации без запуска:

```bash
docker compose -f docker-compose.dev.yml config
```

## Тома

Именованные тома Docker: данные Postgres и Redis переживают `down` без `-v`. После `down -v` потребуется снова выполнить миграции и при необходимости seed.

## Типичные проблемы

- **Порт 5432 или 6379 занят** — остановите локальный Postgres/Redis или измените проброс портов в `docker-compose.dev.yml` и обновите `DATABASE_URL` / `REDIS_URL` в `.env`.
- **Контейнер не становится healthy** — смотрите `docker compose ... logs postgres` / `redis`; для Postgres при первом старте может потребоваться время до прохождения `pg_isready`.

См. также [development.md](./development.md) (первый запуск и команды monorepo).
