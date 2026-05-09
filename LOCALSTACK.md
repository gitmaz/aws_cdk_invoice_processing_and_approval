# LocalStack (`stage=local`)

Use CDK context **`local`** to target **LocalStack** on your machine. This stage uses the same dummy account CDK uses elsewhere (`000000000000`) and turns off X-Ray tracing on the state machine. The **validate** Lambda sets **`MOCK_TEXTRACT=1`** because LocalStack Community does not implement **Textract AnalyzeExpense**; OCR fields are filled from a small synthetic `AnalyzeExpense`-shaped payload (override confidence with **`MOCK_TEXTRACT_MIN_CONFIDENCE`** for manual-verification scenarios).

### Cognito + HTTP API JWT (`POST /upload/presign`)

Why **`stage=local`** drops the JWT authorizer and uses **`x-presign-local-secret`** instead — full reasoning, security notes, and config table: **[LOCALSTACK-PRESIGN-AUTH.md](./LOCALSTACK-PRESIGN-AUTH.md)**.

---

## Install and run LocalStack (Community, no login)

This repo follows the same **LocalStack CLI + Docker image** pattern as **`aws_cdk_simple_lambda`** (image tag **`localstack:4.12`**).

### 1) Install the LocalStack CLI (Python)

Use a supported Python (for example **3.12**) and install **[LocalStack](https://docs.localstack.cloud/getting-started/installation/)** so you can run:

```bash
py -3.12 -m localstack.cli.main --version
```

### 2) Start LocalStack in Docker (daemon)

```bash
py -3.12 -m localstack.cli.main start -d -s localstack:4.12
```

The CLI pulls **`localstack:4.12`** and starts the container; the API listens on **`http://127.0.0.1:4566`** by default.

**Windows note:** if `localstack start` fails with a Unicode encoding error (`charmap`), set **`PYTHONUTF8=1`** and **`PYTHONIOENCODING=utf-8`**, then run the same command again.

**Sanity check:**

```bash
curl http://127.0.0.1:4566/_localstack/health
```

### 3) Environment variables (host deploy / CDK)

Deploy scripts default to dummy credentials and path-style S3; you normally only need an endpoint override when LocalStack is not on localhost.

| Variable | Typical value | When |
| -------- | ------------- | ---- |
| **`AWS_ENDPOINT_URL`** | `http://127.0.0.1:4566` | Default. Point CDK/CLI at LocalStack. |
| **`AWS_ACCESS_KEY_ID`** / **`AWS_SECRET_ACCESS_KEY`** | `test` / `test` | Set by **`npm run deploy:local`** if unset. |
| **`AWS_DEFAULT_REGION`** / **`CDK_DEFAULT_REGION`** | `us-east-1` | Matches this app’s default region. |
| **`AWS_S3_FORCE_PATH_STYLE`** | `1` | Required for S3 against LocalStack (set by deploy script). |
| **`SMTP_HOST`** | `localhost:1025` | **SES → MailHog:** see [SES and MailHog](#ses-and-mailhog-smtp) below. |

If something that runs **inside Docker** must reach LocalStack on the host (Linux):

```bash
export AWS_ENDPOINT_URL=http://172.17.0.1:4566
npm run deploy:local
```

On **Docker Desktop (Windows/macOS)**, use **`http://host.docker.internal:4566`** from other containers.

---

## Docker Compose (MailHog and optional LocalStack)

Repository file: **[docker-compose.yml](./docker-compose.yml)**.

### MailHog only (recommended if LocalStack runs via the CLI on the host)

Starts **MailHog** so SES email from LocalStack can be forwarded over SMTP to an inbox UI.

```bash
docker compose up -d mailhog
```

| Port | Purpose |
| ---- | ------- |
| **8025** | Web UI — **`http://localhost:8025`** |
| **1025** | SMTP (what LocalStack uses via **`SMTP_HOST`**) |

Then start LocalStack on the host **with** SMTP pointing at MailHog (see below).

### LocalStack + MailHog in Docker (profile `localstack`)

Runs **LocalStack** and **MailHog** on the same Docker network; LocalStack is configured with **`SMTP_HOST=mailhog:1025`** so **`ses:SendEmail`** is relayed to MailHog.

```bash
docker compose --profile localstack up -d
```

- **LocalStack:** **`http://127.0.0.1:4566`**
- **MailHog UI:** **`http://127.0.0.1:8025`**

Override persistence directory (optional):

```bash
LOCALSTACK_VOLUME_DIR=/path/to/data docker compose --profile localstack up -d
```

Default data dir (gitignored): **`.localstack-data/`** next to **`docker-compose.yml`**.

**Port 4566 conflict:** if you already use the CLI to run LocalStack on **4566**, either stop that instance or only start **`mailhog`** from Compose and keep using host LocalStack.

---

## SES and MailHog (SMTP)

Application Lambdas call the **SES HTTPS API** (`SendEmail`). LocalStack’s SES emulation forwards outbound mail to an **SMTP** server when configured.

For **LocalStack Community**, use the documented email variables ([configuration reference — Emails](https://docs.localstack.cloud/references/configuration/)):

| Variable | Example | Meaning |
| -------- | ------- | ------- |
| **`SMTP_HOST`** | `localhost:1025` | Host **`MailHog`** when MailHog maps **1025** on the host and LocalStack runs **on the host**. |
| **`SMTP_HOST`** | `mailhog:1025` | MailHog service name when **both** run under **docker-compose** (see profile **`localstack`**). |
| **`SMTP_USER`** / **`SMTP_PASS`** | *(omit)* | Optional auth if your SMTP server requires it. |

**Before starting LocalStack** (host CLI), point SES at MailHog:

**PowerShell**

```powershell
$env:SMTP_HOST = "localhost:1025"
py -3.12 -m localstack.cli.main start -d -s localstack:4.12
```

**bash**

```bash
export SMTP_HOST=localhost:1025
py -3.12 -m localstack.cli.main start -d -s localstack:4.12
```

Restart LocalStack after changing **`SMTP_HOST`**.

The separate **LocalStack MailHog extension** (UI under **`/mailhog/`** on port 4566) is a **LocalStack Pro / account** flow — see [MailHog extension](https://docs.localstack.cloud/aws/tooling/extensions/mailhog). Community setups use **your own MailHog container** + **`SMTP_HOST`** as above.

More detail and Playwright hooks: **[local-e2e-userguide.md](./local-e2e-userguide.md)** → *Email (LocalStack SES and MailHog)*.

---

## Prerequisites (short)

| Requirement | Notes |
| ----------- | ----- |
| **LocalStack** | Running (default: `http://127.0.0.1:4566`). |
| **Node 20+** | Matches `engines` and Lambda runtime (recommended: Node 22). |
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

- Deploy runs on the host with **`AWS_ENDPOINT_URL=http://127.0.0.1:4566`** by default.

Bundled Lambdas require **CDK asset publishing** to LocalStack S3; raw `awslocal cloudformation deploy` of a single template is not sufficient for `NodejsFunction` assets.

**Troubleshooting (CDK → LocalStack S3 asset publish):** if asset publish fails, ensure you’re using the host-based deploy script (`npm run deploy:local`) with `AWS_S3_FORCE_PATH_STYLE=1` (already set by the script) and that LocalStack is reachable at `AWS_ENDPOINT_URL`.

## Synth only

```bash
npm run synth:local
```

On Windows, ensure your `node` and `npm` come from the same installation and rebuild `esbuild` if you switch Node versions.

## Playwright E2E

After **`InvoiceProcessing-local`** exists on LocalStack, print **`PLAYWRIGHT_API_BASE_URL`** and related vars (needs **AWS CLI**):

```powershell
npm run playwright:print-env
```

Then run **`npm run test:e2e`** in the same shell (or copy lines from **`e2e/env.example`**). If the SPA dev server is already running, set **`PLAYWRIGHT_SKIP_WEBSERVER=1`**.

Set **`PLAYWRIGHT_MAILHOG_URL=http://127.0.0.1:8025`** when MailHog is up if you want the suite’s soft MailHog assertion (see **local-e2e-userguide.md**).

## Related

- Stage list and URLs: [README.md](./README.md), [README-dev.md](./README-dev.md)
- Unit tests (including Textract mock helpers): [README-test.md](./README-test.md)
- Local Vite + backends (prepare monolith → LocalStack → AWS, **`VITE_API_BASE_URL`**): [local-e2e-userguide.md](./local-e2e-userguide.md), [spa/.env.example](./spa/.env.example)
