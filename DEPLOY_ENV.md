# Deployment Environment Values

This document lists the environment values needed when deploying `추억의 게임`.

## AODS Services

`aolda_deploy.json` deploys only:

- `bear-feast-web`
- `bear-feast-api`

The database is external to AODS. The target DB is the shared PXC/MySQL service:

```text
aolda-games-haproxy.shared.svc.cluster.local:3306
```

Important: the current API implementation still uses the PostgreSQL `pg` driver. The env below documents the target deployment values, but the backend DB adapter must be migrated to MySQL/PXC before this database can work in production.

## API Service: `bear-feast-api`

Use these as runtime environment variables on the AODS API app.

```dotenv
NODE_ENV=production
PORT=8080
DATABASE_URL=mysql://<db-user>:<db-password>@aolda-games-haproxy.shared.svc.cluster.local:3306/<db-name>
CORS_ORIGIN=https://bear-game.ajou.app
SESSION_TTL_DAYS=30
API_VERSION=0.1.0
BUILD_SHA=<commit-sha>
```

Notes:

- `DATABASE_URL` values should come from `secret/aolda-games-secrets` or `secret/internal-aolda-games` in the `shared` namespace.
- `CORS_ORIGIN` is the frontend origin. Use `*` only for temporary testing.
- `BUILD_SHA` should match the image commit SHA when possible.
- If the AODS app runs in a different namespace, use the full service DNS name shown above.

## Web Service: `bear-feast-web`

The web image is static nginx output. `VITE_API_BASE_URL` is a build-time value, not a runtime env read by nginx.

When running the GitHub Actions `Publish Images` workflow, set:

```dotenv
VITE_API_BASE_URL=https://<api-origin>
```

The workflow input name is:

```dotenv
vite_api_base_url=https://<api-origin>
```

Use the public API origin that the browser can reach. Examples:

```dotenv
# If API is on a separate public host
vite_api_base_url=https://api.bear-game.ajou.app

# If API is reverse-proxied on the same public host
vite_api_base_url=https://bear-game.ajou.app
```

Local compose currently builds the web image with:

```dotenv
VITE_API_BASE_URL=http://localhost:8080
```

## Local Development

API:

```dotenv
NODE_ENV=development
PORT=8080
DATABASE_URL=postgres://bear_feast:bear_feast@localhost:5432/bear_feast
CORS_ORIGIN=http://localhost:5173
SESSION_TTL_DAYS=30
API_VERSION=0.1.0
BUILD_SHA=local-dev
```

Web:

```dotenv
VITE_API_BASE_URL=http://localhost:8080
```
