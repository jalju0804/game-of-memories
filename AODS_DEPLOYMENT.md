# AODS 웹게임 배포용 JSON 작성 가이드

이 문서는 AODS로 웹게임을 배포할 때 게임 저장소에 넣어야 하는 `aolda_deploy.json`과, UI 대신 API로 앱을 만들 때 사용할 수 있는 생성 요청 JSON을 정리한다.

## 1. 게임 저장소의 `aolda_deploy.json`

AODS는 GitHub 저장소의 `aolda_deploy.json`에서 배포 대상 서비스를 읽는다. 파일은 기본적으로 저장소 루트에 둔다.

웹게임이 정적 프론트엔드 하나로 끝나는 구조라면 아래처럼 작성한다.

```json
{
  "services": [
    {
      "serviceId": "space-runner-web",
      "image": "ghcr.io/<github-org>/<game-repo>:sha-<commit>",
      "port": 80,
      "replicas": 1,
      "strategy": "Rollout"
    }
  ]
}
```

각 필드의 의미는 다음과 같다.

| 필드 | 필수 | 설명 |
| --- | --- | --- |
| `services` | 예 | 배포할 서비스 목록. 웹게임 하나면 배열에 1개만 둔다. |
| `serviceId` | 예 | AODS가 선택할 서비스 ID. DNS-1123 스타일의 소문자 slug를 써야 한다. 예: `space-runner-web` |
| `image` | 예 | 배포할 컨테이너 이미지 주소. 예: `ghcr.io/aolda/space-runner:sha-abc1234` |
| `port` | 예 | 컨테이너가 실제로 listen 하는 포트. nginx 정적 서빙이면 보통 `80`이다. |
| `replicas` | 예 | 기본 Pod 개수. 처음에는 `1`, 중단 없는 교체가 필요하면 `2` 이상을 쓴다. |
| `strategy` | 아니오 | `Rollout` 또는 `Canary`. 외부 LB로 바로 노출할 웹게임이면 보통 `Rollout`을 쓴다. |

중요한 점은 `port`가 Docker 이미지 내부 서버 포트와 정확히 맞아야 한다는 것이다. 예를 들어 Vite 게임을 빌드해서 nginx로 서빙하면 `port`는 보통 `80`이고, Node 서버가 `3000`으로 떠 있으면 `3000`을 써야 한다.

## 2. 웹게임 + API 서버가 같이 있는 경우

게임 클라이언트와 점수 저장 API가 같은 저장소에 있다면 `services`에 둘 다 적고, AODS에서는 앱을 서비스별로 따로 등록하는 방식이 안전하다.

```json
{
  "services": [
    {
      "serviceId": "space-runner-web",
      "image": "ghcr.io/<github-org>/space-runner-web:sha-<commit>",
      "port": 80,
      "replicas": 1,
      "strategy": "Rollout"
    },
    {
      "serviceId": "space-runner-api",
      "image": "ghcr.io/<github-org>/space-runner-api:sha-<commit>",
      "port": 8080,
      "replicas": 1,
      "strategy": "Rollout"
    }
  ]
}
```

이 경우 AODS 앱 등록 시:

- 웹 앱의 `repositoryServiceId`는 `space-runner-web`
- API 앱의 `repositoryServiceId`는 `space-runner-api`
- 둘 다 같은 `repositoryUrl`, `repositoryBranch`, `configPath`를 사용할 수 있다.

## 3. AODS 앱 생성 JSON 예시

UI가 아니라 API로 AODS에 앱을 만들 경우에는 `aolda_deploy.json`과 별개로 앱 생성 요청 JSON을 보낼 수 있다. 외부 L7 라우팅 없이 서비스별 LoadBalancer로 여는 환경이면 웹게임 앱은 `loadBalancerEnabled: true`로 둔다.

```json
{
  "name": "space-runner-web",
  "description": "AODS로 배포하는 브라우저 웹게임",
  "environment": "prod",
  "meshEnabled": false,
  "loadBalancerEnabled": true,
  "repositoryUrl": "https://github.com/<github-org>/<game-repo>",
  "repositoryBranch": "main",
  "repositoryServiceId": "space-runner-web",
  "configPath": "aolda_deploy.json",
  "repositoryPollIntervalSeconds": 300,
  "registryServer": "ghcr.io",
  "registryUsername": "<github-username>",
  "registryToken": "<ghcr-read-packages-token>"
}
```

private 저장소라면 `repositoryToken`도 추가한다.

```json
{
  "repositoryToken": "<github-contents-read-token>"
}
```

단, 토큰 값은 예시처럼 문서나 Git에 저장하지 말고 AODS UI/API 입력으로만 전달한다. AODS는 저장소 토큰, 레지스트리 토큰, 앱 환경변수를 서로 다른 Vault 경로로 분리해서 저장한다.

## 4. 운영상 권장값

웹게임처럼 단일 프론트 서비스를 외부에 바로 노출하는 경우:

- `strategy`: `Rollout`
- `meshEnabled`: `false`
- `loadBalancerEnabled`: `true`
- `replicas`: 처음에는 `1`, 무중단 배포가 필요하면 `2`
- `image` 태그: `latest`보다 `sha-<commit>` 같은 immutable tag 권장

`Canary`는 Istio/mesh 기반 라우팅이 필요한 전략이다. 현재처럼 외부 L7 라우팅 없이 LoadBalancer로 직접 여는 환경에서는 `Canary`와 `loadBalancerEnabled: true`를 같이 쓰지 않는다.

## 5. 배포 전 체크리스트

1. 게임 저장소 루트에 `aolda_deploy.json`이 있는지 확인한다.
2. `serviceId`가 AODS 앱 등록 시 넣는 `repositoryServiceId`와 정확히 같은지 확인한다.
3. `image`가 실제 registry에 push되어 있는지 확인한다.
4. `port`가 컨테이너 내부 listen 포트와 같은지 확인한다.
5. private GHCR 이미지면 `registryUsername`, `registryToken`을 AODS에 입력한다.
6. private GitHub 저장소면 `repositoryToken`을 AODS에 입력한다.
7. 게임에서 API를 호출한다면 API 주소를 빌드 환경변수나 런타임 설정으로 분리한다.

## 6. 이 저장소의 CI / GHCR 발행

이 저장소는 GitHub Actions 기준으로 다음 흐름을 사용한다.

- `.github/workflows/ci.yml`
  - `npm ci`
  - `npm run check`
  - `npm run build`
  - `docker compose up -d --build`
  - web/api health check
- `.github/workflows/publish-images.yml`
  - 수동 실행
  - `vite_api_base_url` 입력값을 웹 이미지의 `VITE_API_BASE_URL`로 사용
  - `bear-feast-web`, `bear-feast-api` 이미지를 GHCR에 push
  - `aolda_deploy.generated.json` artifact 생성

이미지 태그는 `sha-<full-commit-sha>`와 `sha-<short-commit-sha>`를 함께 발행한다. AODS에는 immutable tag인 `sha-<full-commit-sha>` 사용을 권장한다.

현재 이 게임 저장소에서는 DB를 AODS 서비스로 배포하지 않는다. API 서비스는 `shared` namespace의 PXC/MySQL 서비스인 `aolda-games-haproxy.shared.svc.cluster.local:3306`에 `DATABASE_URL`로 연결하는 전제다. 로컬 개발과 CI smoke test에서만 `docker-compose.yml`의 `db` 서비스를 사용한다.

주의: 현재 API 구현은 PostgreSQL `pg` 드라이버 기반이다. 위 PXC/MySQL 서비스에 실제 연결하려면 백엔드 DB 어댑터를 MySQL 호환 구현으로 바꿔야 한다.

배포 시 필요한 환경변수는 저장소의 `DEPLOY_ENV.md`와 서비스별 `.env.example` 파일을 기준으로 입력한다.

- API 런타임 env: `apps/api/.env.example`
- Web 빌드타임 env: `apps/web/.env.example`

## 7. 자주 나는 오류

`aolda_deploy.json`을 못 읽는 경우:

- 저장소 루트가 아닌 다른 경로에 파일이 있거나 `configPath`가 다르다.
- private 저장소인데 `repositoryToken`이 없다.
- 브랜치명이 실제 기본 브랜치와 다르다.

서비스 선택 오류:

- `services`가 2개 이상인데 `repositoryServiceId`를 비워 두었다.
- `repositoryServiceId`와 `serviceId`의 철자가 다르다.

이미지 pull 오류:

- 이미지가 private인데 registry token이 없다.
- GHCR token에 `read:packages` 권한이 없다.
- 이미지 tag가 registry에 실제로 존재하지 않는다.

접속은 되는데 화면이 안 뜨는 경우:

- `port`가 실제 컨테이너 listen 포트와 다르다.
- 정적 파일 서버가 `0.0.0.0`이 아니라 `127.0.0.1`로만 listen 한다.
- 웹게임이 호출하는 API URL이 로컬 주소나 잘못된 운영 도메인으로 빌드되어 있다.
