# LocalStack (`stage=local`)

Use CDK context **`local`** to target **LocalStack** on your machine. This stage uses the same dummy account CDK uses elsewhere (`000000000000`) and turns off X-Ray tracing on the state machine. The **validate** Lambda sets **`MOCK_TEXTRACT=1`** because LocalStack Community does not implement **Textract AnalyzeExpense**; OCR fields are filled from a small synthetic `AnalyzeExpense`-shaped payload (override confidence with **`MOCK_TEXTRACT_MIN_CONFIDENCE`** for manual-verification scenarios).

### Cognito + HTTP API JWT (`POST /upload/presign`)

Why **`stage=local`** drops the JWT authorizer and uses **`x-presign-local-secret`** instead — full reasoning, security notes, and config table: **[LOCALSTACK-PRESIGN-AUTH.md](./LOCALSTACK-PRESIGN-AUTH.md)**.

## Prerequisites

| Requirement | Notes |
| ----------- | ----- |
| **LocalStack** | **`docker-compose.yml`** defines a **`localstack`** service (image **4.12**). **`npm run deploy:local`** on **Windows** runs **`docker compose up -d localstack`** then CDK in **`node20`** against **`http://localstack:4566`**. Host tools (AWS CLI, **`playwright:print-env`**, Playwright) use **`http://localhost:<port>`** where **`<port>`** is **`LOCALSTACK_HOST_PORT`** (default **4566**). If **4566** is already taken, set e.g. **`LOCALSTACK_HOST_PORT=4567`** before **`docker compose up`** / **`npm run deploy:local`**, then use **`http://localhost:4567`** on the host. |
| **Node 20** | Matches `engines` and Lambda runtime; on Windows with older Node, use Docker (`node20` service) |
| **Docker Desktop** (Windows deploy path) | `npm run deploy:local` runs CDK **inside** `docker compose` so **esbuild** matches Linux during bundling |
| **Optional:** `awslocal` / AWS CLI v2 | For ad hoc inspection; deploy uses **CDK CLI** + `AWS_ENDPOINT_URL` |

Override the emulator URL when needed (e.g. Linux Docker cannot resolve `host.docker.internal`):

```powershell
$env:AWS_ENDPOINT_URL = "http://172.17.0.1:4566"
npm run deploy:local
```

## Deploy / destroy

From this directory:

```bash
npm run deploy:local
npm run destroy:local
```

- **Windows:** starts **`localstack`** via Compose, then runs **`npm run build`**, then **`cdklocal` + `aws-cdk` CLI** inside **`docker compose run node20`** with **`AWS_ENDPOINT_URL=http://localstack:4566`** (in-container). **Bootstrap** uses **`-c stage=local`** and **`--app node dist/bin/invoice-app.js`**. To use a LocalStack on the host instead, set **`DEPLOY_LOCAL_DOCKER_ENDPOINT=http://host.docker.internal:4566`** (may hit S3 DNS issues during asset publish).
- **Linux / macOS (host Node 20):** same **`cdklocal`** flow on the host with **`AWS_ENDPOINT_URL=http://localhost:4566`**.

Bundled Lambdas require **CDK asset publishing** to LocalStack S3; raw `awslocal cloudformation deploy` of a single template is not sufficient for `NodejsFunction` assets.

**Troubleshooting (CDK → LocalStack S3 asset publish on Docker Desktop):** some setups still see **`getaddrinfo ENOTFOUND … host.docker.internal`** or mis-routed S3 traffic during asset upload. The deploy script already uses **aws-cdk-local** and path-style flags. If publish still fails, run **`npm run deploy:local` from macOS / Linux** (host `localhost:4566`), or from **WSL2** with LocalStack on Windows, or add a **LocalStack** service to **Docker Compose** on the same network as **`node20`** and point **`AWS_ENDPOINT_URL`** at that service (avoids `host.docker.internal` virtual-hosted bucket DNS).

## Synth only

```bash
npm run synth:local
```

On **Windows**, if `esbuild` was installed for Windows but you synth inside Docker, use **`npm run docker:synth`** (it runs **`npm rebuild esbuild`** first), then override the synth stage if needed:

```bash
docker compose run --rm node20 sh -lc "npm rebuild esbuild && npx cdk synth -c stage=local"
```

## Playwright E2E

After **`InvoiceProcessing-local`** exists on LocalStack, print **`PLAYWRIGHT_API_BASE_URL`** and related vars (needs **AWS CLI**):

```powershell
npm run playwright:print-env
```

Then run **`npm run test:e2e`** in the same shell (or copy lines from **`e2e/env.example`**). If the SPA dev server is already running, set **`PLAYWRIGHT_SKIP_WEBSERVER=1`**.

## Related

- Stage list and URLs: [README.md](./README.md), [README-dev.md](./README-dev.md)
- Unit tests (including Textract mock helpers): [README-test.md](./README-test.md)
- SPA, MailHog, review links, Playwright E2E: [user-guide.md](./user-guide.md)
