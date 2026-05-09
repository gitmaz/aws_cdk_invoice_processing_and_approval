# LocalStack (`stage=local`)

Use CDK context **`local`** to target **LocalStack** on your machine. This stage uses the same dummy account CDK uses elsewhere (`000000000000`) and turns off X-Ray tracing on the state machine. The **validate** Lambda sets **`MOCK_TEXTRACT=1`** because LocalStack Community does not implement **Textract AnalyzeExpense**; OCR fields are filled from a small synthetic `AnalyzeExpense`-shaped payload (override confidence with **`MOCK_TEXTRACT_MIN_CONFIDENCE`** for manual-verification scenarios).

### Cognito + HTTP API JWT (`POST /upload/presign`)

Why **`stage=local`** drops the JWT authorizer and uses **`x-presign-local-secret`** instead — full reasoning, security notes, and config table: **[LOCALSTACK-PRESIGN-AUTH.md](./LOCALSTACK-PRESIGN-AUTH.md)**.

## Prerequisites

| Requirement | Notes |
| ----------- | ----- |
| **LocalStack** | LocalStack running on the host (default: `http://127.0.0.1:4566`). |
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

## Related

- Stage list and URLs: [README.md](./README.md), [README-dev.md](./README-dev.md)
- Unit tests (including Textract mock helpers): [README-test.md](./README-test.md)
- SPA, MailHog, review links, Playwright E2E: [user-guide.md](./user-guide.md)
