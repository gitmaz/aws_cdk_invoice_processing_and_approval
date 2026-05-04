# Testing (local, no AWS account required)

This repo supports two complementary approaches:

| Track | Purpose | Command |
| ----- | ------- | ------- |
| **Fast UI / flow demos** | Run the React SPA against a tiny in-memory HTTP server that mimics the real `GET /public/invoice/*` and `POST /public/decision` contract. | [`npm run demo:api`](#1-fast-ui--flow-demos-mock-public-api) + SPA |
| **Confidence in Lambdas** | Vitest unit tests with **mocked** `@aws-sdk/*` clients — exercises handler logic (thresholds, sessions, `SendTaskSuccess` payloads, analytics counters, EventBridge detail). | `npm test` |

Neither path calls AWS APIs over the network.

---

## 1. Fast UI / flow demos (mock public API)

### What it is

[`local/mock-public-api.cjs`](./local/mock-public-api.cjs) is a **standalone Node** server (no CDK deploy). It keeps two **seeded** invoices in memory:

| Invoice id | Session | `manualVerificationRequired` | Use case |
| ---------- | ------- | ----------------------------- | -------- |
| `demo-inv-low` | `demo-session-low` | `true` | Yellow “manual verification” banner + **editable** OCR JSON |
| `demo-inv-high` | `demo-session-high` | `false` | Green “verification automatic” banner + **read-only** OCR JSON |

Approving/rejecting updates in-memory status only and logs to the terminal — **Step Functions is not contacted** (demos only).

### Run

Terminal A:

```bash
npm run demo:api
```

Default URL: `http://127.0.0.1:3009/` (shows copy-paste hints). Override port: `MOCK_API_PORT=3010 npm run demo:api`.

Terminal B (from [`spa/`](./spa)):

```bash
cd spa
npm install
```

**PowerShell (Windows):**

```powershell
$env:VITE_API_BASE_URL = "http://127.0.0.1:3009"
npm run dev
```

**bash:**

```bash
export VITE_API_BASE_URL=http://127.0.0.1:3009
npm run dev
```

Open:

- Manual-verify demo: `http://localhost:5173/?invoiceId=demo-inv-low&session=demo-session-low`
- Approval-only demo: `http://localhost:5173/?invoiceId=demo-inv-high&session=demo-session-high`

### Why this exists

Validates **routing, query params, CORS, and both SPA modes** without Cognito, DynamoDB, or API Gateway — fastest feedback loop for UX.

---

## 2. Confidence in Lambdas (Vitest)

### What it covers

All tests live under [`tests/lambdas/`](./tests/lambdas/) and use **module mocks** for AWS SDK clients so handlers never open real connections.

| File | Handler / module | What is asserted |
| ---- | ---------------- | ---------------- |
| [`validate.handler.test.ts`](./tests/lambdas/validate.handler.test.ts) | [`lambda/validate`](./lambda/validate/index.ts) | Textract confidence → `manualVerificationRequired`; DynamoDB `Put` shape; empty S3 → error |
| [`public-api.handler.test.ts`](./tests/lambdas/public-api.handler.test.ts) | [`lambda/public-api`](./lambda/public-api/index.ts) | GET session + status guardrails; POST builds `SendTaskSuccess` output |
| [`finalize-human-approve.test.ts`](./tests/lambdas/finalize-human-approve.test.ts) | [`lambda/finalize-human-approve`](./lambda/finalize-human-approve/index.ts) | `emitInvoiceOutcome` called with `APPROVED` |
| [`finalize-human-reject.test.ts`](./tests/lambdas/finalize-human-reject.test.ts) | [`lambda/finalize-human-reject`](./lambda/finalize-human-reject/index.ts) | Outcome + optional SES when emails configured |
| [`analytics-ingest.test.ts`](./tests/lambdas/analytics-ingest.test.ts) | [`lambda/analytics-ingest`](./lambda/analytics-ingest/index.ts) | DynamoDB `ADD` uses correct counter attribute per outcome |
| [`outcomes.test.ts`](./tests/lambdas/outcomes.test.ts) | [`lambda/shared/outcomes`](./lambda/shared/outcomes.ts) | EventBridge `PutEvents` entry shape (`Source`, `DetailType`, JSON detail) |

### Commands

Requires **Node.js 20+** (matches repo `engines`; Vitest 3 on Node 18 may warn or fail).

```bash
npm install
npm test
npm run test:watch
```

Config: [`vitest.config.ts`](./vitest.config.ts). The main [`tsconfig.json`](./tsconfig.json) **excludes** `tests/` from `tsc` CDK build — tests are run only via Vitest.

### Why this exists

Catches regressions in **business rules** (threshold, session checks, outcome payloads) before `cdk deploy`, without sandbox AWS credentials.

---

## What is *not* covered here

- **CDK synthesis** of stacks (`npm run synth`) — still useful; requires correct Node/aws-cdk install but not necessarily account calls unless you use lookups.
- **End-to-end** upload → SQS → Step Functions → SES — requires AWS (or a heavy emulator such as LocalStack, not wired in this repo).

---

## Related docs

- [README.md](./README.md) — install & deploy  
- [README-dev.md](./README-dev.md) — architecture & code map  
