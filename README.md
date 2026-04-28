# 추억의 게임

픽셀아트 감성의 미니게임 종합 앱입니다. 첫 번째 게임은 `고기왕 곰찾기`이며, AODS의 일반적인 `web + api` 배포와 외부 PostgreSQL 연결을 검증하기 위해 설계되었습니다.

## 구성

- `apps/web`: Vite + React frontend
- `apps/api`: Express + PostgreSQL API
- `db`: PostgreSQL initialization SQL
- `docker-compose.yml`: local full-stack run
- `aolda_deploy.json`: AODS service declaration

## 로컬 실행

```bash
npm install
npm run check
npm run build
docker compose up --build
```

브라우저에서 `http://localhost:8088`을 엽니다.

개발 모드로 따로 실행할 때:

```bash
docker compose up db
DATABASE_URL=postgres://bear_feast:bear_feast@localhost:5432/bear_feast CORS_ORIGIN=http://localhost:5173 npm run dev:api
VITE_API_BASE_URL=http://localhost:8080 npm run dev:web
```

## AODS 배포

`aolda_deploy.json`의 이미지 주소를 실제 GHCR 이미지로 치환합니다.

서비스 ID:

- `bear-feast-web`
- `bear-feast-api`

포트:

- web: `80`
- api: `8080`

DB는 AODS 배포 대상이 아닙니다. AODS의 API 앱 환경변수에 외부 PostgreSQL `DATABASE_URL`을 주입합니다. 로컬 개발과 CI smoke test에서는 `docker-compose.yml`의 `db` 서비스를 사용합니다.

자세한 배포 메모는 [AODS_DEPLOYMENT.md](./AODS_DEPLOYMENT.md)를 참고하세요.

## CI / 이미지 발행

GitHub Actions 워크플로:

- `.github/workflows/ci.yml`: PR, `main` push, 수동 실행에서 `npm ci`, 타입체크, 빌드, Docker compose smoke test를 실행합니다.
- `.github/workflows/publish-images.yml`: 수동 실행으로 web/api GHCR 이미지를 발행하고, 해당 SHA 태그가 들어간 `aolda_deploy.generated.json` artifact를 만듭니다.

이미지 발행 시 `vite_api_base_url` 입력값에 운영 API 주소를 넣어야 합니다. 이 값은 웹 이미지 빌드 시 `VITE_API_BASE_URL`로 포함됩니다.

발행되는 이미지:

- `ghcr.io/<github-owner>/bear-feast-web:sha-<commit>`
- `ghcr.io/<github-owner>/bear-feast-api:sha-<commit>`
