# Local E2E user guide — Vite SPA + LocalStack

This guide covers running the **React + Vite** approval UI under [`spa/`](./spa) against a **`stage=local`** stack on **LocalStack**: **upload → workflow → review**, **email (SES)**, and **Playwright E2E**. It is intentionally separate from general AWS deploy docs.

For backend-only setup (CDK deploy, Textract mock, MailHog compose), see **[LOCALSTACK.md](./LOCALSTACK.md)**.

---

## What you are testing

| Piece | Local behaviour |
| ----- | ---------------- |
| **Textract** | Mocked in the validate Lambda (`MOCK_TEXTRACT`); see [LOCALSTACK.md](./LOCALSTACK.md). |
| **SES email** | Lambdas call the **SES API** (not raw SMTP). LocalStack emulates **`ses:SendEmail`**; delivery to a real inbox or to **MailHog** depends on how LocalStack is configured (see [Email](#email-localstack-ses-and-mailhog) below). |
| **SPA** | Reads **`VITE_API_BASE_URL`** and talks to **`GET /public/invoice/{id}`** and **`POST /public/decision`** on the deployed HTTP API. |

---

## Prerequisites

1. **LocalStack** running (default `http://localhost:4566` from the host).
2. **This CDK app** deployed with **`stage=local`** (`npm run deploy:local` from the repo root — see [LOCALSTACK.md](./LOCALSTACK.md)).
3. **Node 20+** for the SPA (recommended: Node 22).

Collect **stack outputs** after deploy (CDK prints them; or query CloudFormation on LocalStack):

| Output | Use |
| ------ | --- |
| **HttpApiUrl** | Set as **`VITE_API_BASE_URL`** for the SPA (no trailing slash). |
| **CognitoUserPoolId**, **CognitoClientId** (optional locally) | **AWS / real stacks:** JWT for **`POST /upload/presign`**. **`stage=local` / LocalStack Community:** use header **`x-presign-local-secret`** (value from **`cdk.json` → `invoice.local.presignLocalSecret`**) — see [LOCALSTACK.md](./LOCALSTACK.md). |
| **InvoicesBucketName** | Referenced by the presign response (client uploads with returned PUT URL). |

---

## Configure `local` recipients and URLs (optional)

Copy **[config/example.local.json](./config/example.local.json)** to **`config/local.json`** (gitignored) and adjust addresses. **`loadStageConfig`** merges this file for **`stage=local`**.

At minimum for email experiments, set:

- **`spaBaseUrl`** — usually **`http://localhost:5173`** (Vite dev server).
- **`humanReviewNotifyEmails`** — one or more addresses; SES in LocalStack still expects **verified identities** for `sesFromAddress` / destinations when enforcement is on (see below).

Redeploy after changing `config/local.json`:

```bash
npm run deploy:local
```

---

## Run the SPA (Vite)

From **`spa/`**:

```bash
cd spa
npm install
```

**PowerShell (Windows)** — set the API base to your deployed **`HttpApiUrl`**:

```powershell
$env:VITE_API_BASE_URL = "http://xxxxxxxx.execute-api.localhost.localstack.cloud:4566"
npm run dev
```

**bash**

```bash
export VITE_API_BASE_URL=http://xxxxxxxx.execute-api.localhost.localstack.cloud:4566
npm run dev
```

Open the URL Vite prints (typically **`http://localhost:5173`**).

The SPA expects query parameters **`invoiceId`** and **`session`** (same shape as the link produced by the **notify-human** Lambda). Without them it shows a short error — that is expected if you open the root URL directly.

---

## End-to-end flow (happy path)

1. **Upload** an invoice file via **`POST /upload/presign`**: on **`stage=local`** use **`x-presign-local-secret`**; on other stages use **Cognito JWT** → PUT to S3 → ingestion starts Step Functions.
2. **Validate** runs (mock Textract on `local`).
3. **Notify-human** writes **`reviewSessionId`** to DynamoDB and sends email via **SES** (if recipients are configured).
4. Open the **review URL** in a browser (see next section).
5. **Approve** or **reject** in the SPA; the UI calls **`POST /public/decision`**, which completes the Step Functions task.

### Getting the review link without hunting through Mail

For **`stage=local`**, the **notify-human** Lambda logs a line:

```text
[invoice-notify local] Review URL (open in browser; also sent via SES when configured): http://localhost:5173/?invoiceId=...&session=...
```

Use **LocalStack’s Lambda logs** (or your log viewer) to copy that URL. This keeps the flow testable even when SES → inbox is not wired yet.

---

## Email (LocalStack SES and MailHog)

AWS **SES** in application code uses the **HTTPS SES API**, not SMTP. **MailHog** is an **SMTP** server with a web UI — it does **not** receive SES HTTPS calls by itself. You connect them by running MailHog alongside LocalStack and using one of the patterns below.

### Option A — MailHog + LocalStack MailHog integration (recommended when available)

LocalStack documents a **MailHog extension** that routes SES-related traffic so messages appear in MailHog’s UI. Install and run per LocalStack’s docs (see [LocalStack tooling — MailHog](https://docs.localstack.cloud/aws/tooling/extensions/mailhog) and the sample walkthrough [Local testing of SES workflows](https://blog.localstack.cloud/local-testing-ses-workflows-using-localstack-mailhog-extension/)).

Typical shape:

1. Start **MailHog** (optional; run it separately if desired).
2. Enable the LocalStack **MailHog extension** (or equivalent configuration for your LocalStack edition).
3. **Verify** sender/recipient identities in **LocalStack SES** if required (`ses verify-email-identity` against the LocalStack endpoint).
4. Trigger the workflow; open **MailHog UI** at **`http://localhost:8025`** and click the message containing the review link.

Availability of the extension may depend on your **LocalStack edition**; check your installed version’s documentation.

### Option B — MailHog (run separately)

| Port | Purpose |
| ---- | ------- |
| **8025** | Web UI — **`http://localhost:8025`** |
| **1025** | SMTP |

Wire LocalStack (or its SES backend) to forward to **`localhost:1025`** according to your LocalStack setup so **`SendEmail`** results appear in MailHog. If you only run MailHog without that bridge, the UI stays empty while SES calls may still **succeed** inside LocalStack.

### Option C — No inbox (still test the SPA)

Use the **`[invoice-notify local]`** log line for the **review URL**, or temporarily leave **`humanReviewNotifyEmails`** empty: SES send is skipped, but DynamoDB still holds **`reviewSessionId`** — you would need the logged URL or a small script to reconstruct the query string. The **log line** path is simplest.

### Alternatives to MailHog

- **[Mailpit](https://mailpit.axllent.org/)** — similar idea (SMTP + web UI); often dropped in as a **`mailpit/mailpit`** container with ports **8025** / **1025**.
- **LocalStack resource browser / logs** — some setups expose sent payloads without MailHog; depends on version.

---

## Upload testing (presign authentication)

- **`stage=local` (recommended on LocalStack Community):** send **`x-presign-local-secret`** on **`POST /upload/presign`** with the same string as **`invoice.local.presignLocalSecret`** in **`cdk.json`** / **`config/local.json`** (HTTP JWT authorizer is **not** attached for local — rationale: **[LOCALSTACK-PRESIGN-AUTH.md](./LOCALSTACK-PRESIGN-AUTH.md)**; overview: [LOCALSTACK.md](./LOCALSTACK.md)).

- **`dev` / `test` / `prod`:** the route expects **`Authorization: Bearer`** with a Cognito **ID token** (**`CognitoIssuer`** + app client).

For JWT flows locally (advanced), use **AWS CLI** / **awslocal** or Postman against Cognito; issuer mismatches with API Gateway JWT validation are common on emulators.

---

## Quick reference — SPA env vars

| Variable | Required | Meaning |
| -------- | -------- | ------- |
| **`VITE_API_BASE_URL`** | Yes | Root URL of the HTTP API (**`HttpApiUrl`**), **no** trailing slash. |

---

## Playwright E2E (upload → email/MailHog check → SPA approve)

Automated test: **[e2e/invoice-approval-local.spec.ts](./e2e/invoice-approval-local.spec.ts)** (Chromium). It:

1. Calls **`POST /upload/presign`** with **`x-presign-local-secret`** (aligned with **`invoice.local.presignLocalSecret`** — default **`localstack-presign-change-me`**), **PUTs** a tiny PNG to S3, and waits for **`AWAITING_HUMAN`** in **`invoice-records-local`**.
2. Optionally uses **Cognito + JWT** when **`PLAYWRIGHT_USE_COGNITO=1`** (advanced).
3. If **`PLAYWRIGHT_MAILHOG_URL`** is set, **soft-asserts** MailHog lists a message mentioning **`invoiceId`** (when SES reaches MailHog).
4. Opens the **Vite** SPA with **`invoiceId` + `session`**, clicks **Approve**, accepts **`alert()`**.

**Host Node older than 20:** upgrade Node (recommended: Node 22).

**One-time browser install (host Node 20+):**

```bash
npm run test:e2e:install
```

**Environment:** **[e2e/env.example](./e2e/env.example)** — **`PLAYWRIGHT_API_BASE_URL`**, **`AWS_ENDPOINT_URL`**, **`PLAYWRIGHT_PRESIGN_LOCAL_SECRET`** (must match deployed **`presignLocalSecret`**).

```bash
npm run test:e2e
```

If you already run **`npm run dev`** in **`spa/`**, set **`PLAYWRIGHT_SKIP_WEBSERVER=1`**.

The suite **skips** when **`PLAYWRIGHT_API_BASE_URL`** is unset (Vitest **`npm test`** unchanged).

---

## Related docs

- **[README-dev.md](./README-dev.md)** — HTTP routes, security model, Cognito.  
- **[README-test.md](./README-test.md)** — Mock API + Vitest without AWS.  
- **[LOCALSTACK.md](./LOCALSTACK.md)** — Deploy/destroy `stage=local`.
