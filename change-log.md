# Change log

Reason-focused notes and small excerpts so we can recall **why** something changed. Newest dates first.

---

## 2026-05-09

### LocalStack Windows: make E2E pass reliably (REST API quirks, presign endpoint host, S3 notifications)

**Reason:** On Windows running Playwright on the host against LocalStack in Docker, the naive LocalStack defaults break the “upload → ingest → review” flow:

- **Presigned S3 URLs** can point at a **Docker-internal IP** (e.g. `172.17.*`) which the Windows host cannot reach.
- **S3 → SQS notifications** are not consistently applied/working via CDK/CloudFormation on Community LocalStack.
- API Gateway **REST (v1)** event shape differs from HTTP API (v2), and LocalStack’s REST API deployment behavior can require an explicit deployment/stage.
- Browser SPA calls need permissive **CORS** headers (Vite origin).

**What changed**

- **`lambda/presign-upload/index.ts`** — For **`stage=local`**, sign URLs against a reachable edge endpoint (defaults to `http://localhost:4566`) and force path-style; responses include CORS.
- **`lambda/upload-complete/index.ts`** + **`lib/invoice-processing-stack.ts`** — Added local-only `POST /upload/complete` to **explicitly start Step Functions** after the client PUT succeeds (workaround for missing S3 notifications).
- **`lib/invoice-processing-stack.ts`** — Adjusted Step Functions JSONPaths for LocalStack’s lambda invoke wrapper (`$.validated.Payload.*`).
- **`lambda/public-api/index.ts`** — Accept REST API (v1) event fields (`httpMethod`/`path`) and emit CORS headers.
- **`spa/src/App.tsx`** + **`e2e/invoice-approval-local.spec.ts`** — SPA can accept `apiBase` via query param; test appends it so the SPA always hits the same API base the test used.
- **`playwright.config.ts`** — Don’t reuse an existing Vite server so `VITE_API_BASE_URL` can’t be stale between runs.

### Local presign secret (LocalStack Community), Docker Playwright, Cognito notes

**Reason:** **HTTP API JWT authorizers** usually cannot validate tokens minted by **LocalStack Cognito** (issuer/JWKS mismatch). Community LocalStack users still need a reliable **`POST /upload/presign`** path. Host **Node** is often **older than Node 20** while the repo **`engines`** / Docker **`node20`** image target **20**.

**What changed**

- **`LOCALSTACK-PRESIGN-AUTH.md`** — Standalone doc for workaround + reasoning + config/security.
- **`lib/stage-config.ts`** — Optional **`presignLocalSecret`** (default for **`local`**: `localstack-presign-change-me`).
- **`cdk.json`** / **`config/example.local.json`** — **`invoice.local.presignLocalSecret`** documented.
- **`lib/invoice-processing-stack.ts`** — For **`stage===local`**: **no** **`HttpJwtAuthorizer`** on **`/upload/presign`**; CORS allows **`x-presign-local-secret`**; Lambda env **`PRESIGN_LOCAL_SECRET`**.
- **`lambda/presign-upload/index.ts`** — **`local`**: require matching **`x-presign-local-secret`** or (if ever wired) JWT claims; non-local: require **`sub`** from JWT authorizer.
- **`package.json`** — **`test:e2e:docker`**, **`test:e2e:docker:install`**.
- **`playwright.config.ts`**, **`e2e/*`**, **`user-guide.md`**, **`LOCALSTACK.md`**, **`README-dev.md`** — Document secret-first flow and **`host.docker.internal`** for Docker Playwright.

---

### Playwright E2E for LocalStack (`invoice-approval-local`)

**Reason:** Automated verification of **JWT presign → S3 upload → Step Functions → notify → SPA approve** against **`stage=local`** without manual copying of review URLs.

**What changed**

- **`playwright.config.ts`** — **`e2e/`** tests, Chromium, **`webServer`** starts **`spa`** dev server with **`VITE_API_BASE_URL`** from **`PLAYWRIGHT_API_BASE_URL`** (skip with **`PLAYWRIGHT_SKIP_WEBSERVER=1`**).
- **`e2e/helpers/`** — Cognito (**create user / password / InitiateAuth**), DynamoDB **scan poll** for **`AWAITING_HUMAN`**, presign **PUT** upload, optional **MailHog REST** check.
- **`e2e/invoice-approval-local.spec.ts`** — Full flow + **`expect.soft`** MailHog when **`PLAYWRIGHT_MAILHOG_URL`** set.
- **`e2e/env.example`** — Required **`PLAYWRIGHT_*`** and **`AWS_ENDPOINT_URL`** for LocalStack SDK calls.
- **`package.json`** — **`test:e2e`**, **`test:e2e:ui`**, **`test:e2e:install`**; devDeps **`@playwright/test`**, **`@aws-sdk/client-cognito-identity-provider`**.
- **`user-guide.md`** — Playwright section.

---

### SPA user guide, MailHog in Compose, local review URL log

**Reason:** Operators needed a single place to run the **Vite SPA** against **`stage=local`**, understand **SES vs SMTP vs MailHog**, and complete the human step when email capture is awkward on Community LocalStack.

**What changed**

- **`user-guide.md`** — Run **`spa/`** with **`VITE_API_BASE_URL`**, stack outputs (HttpApi, Cognito), **`config/local.json`** from **`config/example.local.json`**, end-to-end flow, MailHog + LocalStack SES extension notes, Mailpit alternative, Cognito caveats.
- **`docker-compose.yml`** — **`mailhog`** service (**UI 8025**, **SMTP 1025**).
- **`config/example.local.json`** — Template recipients/sender for local SES experiments.
- **`lambda/notify-human/index.ts`** — When **`STAGE===local`**, **`console.log`** the **review URL** so testers can open the SPA without relying on inbox delivery.

```ts
if (process.env.STAGE === "local") {
  console.log(`[invoice-notify local] Review URL ...: ${approveUrl}`);
}
```

- **`README.md`** / **`LOCALSTACK.md`** — Link to **`user-guide.md`**.

---

### LocalStack stage (`local`) and deploy flow

**Reason:** Run the same CDK app against **LocalStack** (Community) for local integration testing. **Textract AnalyzeExpense** is not realistically available there, so validation uses a **mock OCR path** when deployed with `stage=local`.

**What changed**

- **`bin/invoice-app.ts`** — `stage=local` keeps dummy env (`account: "000000000000"`, region from env default). **Removed `BootstraplessSynthesizer` for `local`**: bundled `NodejsFunction` assets must publish to S3; bootstrapless synth cannot attach those assets.

```ts
const isLocal = stage === "local";
const localEnv = {
  account: "000000000000",
  region: process.env.CDK_DEFAULT_REGION ?? "us-east-1",
};
```

- **`scripts/deploy-local-localstack.mjs`** / **`scripts/destroy-local-localstack.mjs`** — Use **`cdk bootstrap`** then **`cdk deploy --all -c stage=local`** (or **`cdk destroy --all --force`**) with LocalStack-oriented env (`AWS_ENDPOINT_URL`, dummy `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`). On Windows, CDK runs inside **`docker compose run node20`** with default endpoint **`http://host.docker.internal:4566`** so the container reaches LocalStack on the host; **`npm rebuild esbuild`** runs first so Linux bundling matches bind-mounted Windows `node_modules`.

- **`package.json`** — Scripts `synth:local`, `deploy:local`, `destroy:local`; **`docker:synth`** chains **`npm rebuild esbuild`** before synth for the same Windows/Docker reason.

- **`cdk.json`** — Optional `context.invoice.local` defaults (SPA URL, OCR threshold).

- **Docs:** **`LOCALSTACK.md`** (operator guide), **`README.md`** / **`README-test.md`** updated to mention `stage=local` and mock Textract.

---

### Mock Textract (`MOCK_TEXTRACT`) and helpers split

**Reason:** Avoid calling AWS Textract when **`MOCK_TEXTRACT=1`** (set automatically for `stage=local` in the stack). Keeps **`minConfidence`**, **`manualVerificationRequired`**, and DynamoDB **`ocrSummary`** shape aligned with production logic.

**What changed**

- **`lib/invoice-processing-stack.ts`** — For `stage === "local"`, validate Lambda env includes **`MOCK_TEXTRACT: "1"`**; Step Functions **X-Ray tracing** disabled for `local` (often unsupported/noisy on emulator).

```ts
...(stage === "local" ? { MOCK_TEXTRACT: "1" } : {}),
tracingEnabled: stage !== "local",
```

- **`lambda/validate/index.ts`** — Branches on `MOCK_TEXTRACT` to use **`mockAnalyzeExpenseOutput()`** instead of **`TextractClient.send`**.
- **`lambda/validate/textract-helpers.ts`** — Holds **`minConfidenceFromAnalyze`** (same algorithm as before, extracted from the handler file) and **`mockAnalyzeExpenseOutput`** (optional **`MOCK_TEXTRACT_MIN_CONFIDENCE`** for testing low-confidence paths).

```ts
const analyze = MOCK_TEXTRACT
  ? mockAnalyzeExpenseOutput()
  : await textract.send(new AnalyzeExpenseCommand({ Document: { Bytes: Buffer.from(bytes) } }));
const minConfidence = minConfidenceFromAnalyze(analyze);
```

---

### Step Functions callback payload (CDK validation)

**Reason:** Newer CDK validates **`WAIT_FOR_TASK_TOKEN`** payloads: the task token must be expressed with **`sfn.JsonPath.taskToken`**, not only `"taskToken.$": "$$.Task.Token"` in **`TaskInput.fromObject`**.

**What changed**

- **`lib/invoice-processing-stack.ts`** — **`notifyTask`** payload uses **`taskToken: sfn.JsonPath.taskToken`** alongside the existing `"field.$": "$.validated...."` entries.

```ts
payload: sfn.TaskInput.fromObject({
  "bucket.$": "$.validated.bucket",
  // ...
  taskToken: sfn.JsonPath.taskToken,
}),
```

---

### Vitest coverage

**Reason:** Include existing **`tests/lambdas/**`** suites in the same **`vitest run`** as **`lambda/**/*.test.ts`**; add coverage for **`MOCK_TEXTRACT`** and **`textract-helpers`**.

**What changed**

- **`vitest.config.ts`** — **`include`** adds **`tests/**/*.test.ts`**.
- **`tests/lambdas/validate.handler.test.ts`** — Case that reloads module with **`MOCK_TEXTRACT=1`** and asserts Textract **`send`** is not called.
- **`lambda/validate/validate.test.ts`** — Unit tests for **`mockAnalyzeExpenseOutput`** / **`minConfidenceFromAnalyze`** (imports **`textract-helpers`** only to avoid heavy SDK load in simple tests).

---

### Tooling / TS build

**Reason:** Keep **`*.test.ts`** and **`vitest.config.ts`** out of the CDK **`tsc`** output.

**What changed**

- **`tsconfig.json`** — **`exclude`** extended with **`**/*.test.ts`** and **`vitest.config.ts`**.

---

## How to extend this file

Add a new **`## YYYY-MM-DD`** section at the **top** (below the title block), with short **Reason** / **What changed** subsections and optional snippets.
