# Invoice processing & approval (AWS CDK)

TypeScript **AWS CDK** app for an event-driven invoice pipeline: upload to **S3**, **SQS**-buffered ingest, **Textract** (`AnalyzeExpense`) inside **Step Functions**, then **mandatory human approve/reject** via **SES** + **HTTP API** + **React** SPA. OCR confidence only selects **manual verification** (low) vs **approval-only** UI (high)—never automatic approval from OCR alone. State in **DynamoDB**, **EventBridge** analytics in a separate stack.

| Resource | Stack / name pattern |
| -------- | -------------------- |
| Event bus for outcomes | `InvoiceAnalytics-<stage>` → `invoice-events-<stage>` |
| Invoices, workflow, API | `InvoiceProcessing-<stage>` → e.g. `invoice-records-<stage>`, `invoice-processing-<stage>` (state machine) |
| Counters / daily rollups | `invoice-analytics-<stage>` (DynamoDB) |

**Stages** are selected with CDK context: `-c stage=dev` (default), `test`, `prod`, or **`local`** (LocalStack — see **[LOCALSTACK.md](./LOCALSTACK.md)**). Deeper configuration, architecture, and links into the code are in **[README-dev.md](./README-dev.md)**.

Product intent and scope notes: **`prompts.txt`** (versioned in this repo).

**SPA + LocalStack (review UI, MailHog, presign, Playwright E2E):** **[user-guide.md](./user-guide.md)**.

---

## Installation guide

### Prerequisites

| Requirement | Purpose |
| ----------- | ------- |
| **Git** | Clone / pull this repo |
| **Node.js 20+** | Same major version as Lambda (`nodejs20.x`) |
| **AWS credentials** (optional for `synth` only; required for `deploy`) | Profile or env vars the AWS CLI / CDK can use (`aws sts get-caller-identity`) |

### 1. Open a terminal in this folder

```bash
cd maz/aws/serverless/aws_cdk_invoice_processing_and_approval
```

(Adjust the path if your checkout layout differs.)

### 2. Install dependencies

```bash
node -v    # expect v20+ (recommended: v22)
npm install
```

### 3. Optional: stage-specific overrides

Copy [config/example.dev.json](./config/example.dev.json) to **`config/dev.json`** (gitignored) and set SES addresses, reviewer emails, and `spaBaseUrl` for your environment. CDK merges this with [cdk.json](./cdk.json) `context.invoice.*`. Details: [README-dev.md — Configuration layers](./README-dev.md#configuration-layers).

### 4. Verify the app synthesizes

```bash
npm run synth
```

You should get a `cdk.out` directory without errors.

### 5. Deploy to AWS (optional)

Ensure your account/region are set (for example `CDK_DEFAULT_ACCOUNT`, `CDK_DEFAULT_REGION`, or `AWS_PROFILE`).

```bash
npm run deploy:dev
```

After deploy, note CloudFormation outputs (API URL, Cognito ids). Use them when running the SPA (see [README-dev.md — HTTP API and SPA](./README-dev.md#http-api-and-spa)).

### LocalStack deploy (`stage=local`) on Windows

On this repo, **local deploy means LocalStack**. On Windows, CDK asset publishing for `NodejsFunction` can fail when run inside Docker due to **S3 virtual-hosted bucket DNS**. The supported workflow is to **run CDK on the host**:

```powershell
cd maz/aws/serverless/aws_cdk_invoice_processing_and_approval

# ensure LocalStack is running on the host at http://127.0.0.1:4566
npm run deploy:local
```

If you need a different LocalStack endpoint, set `AWS_ENDPOINT_URL` (and optionally `AWS_ENDPOINT_URL_S3`) before running the script.

**Important (Windows PATH):** make sure `node` and `npm` come from the **same** Node installation.
If `Get-Command node` and `Get-Command npm` point to different places (for example, `node` from Cursor but `npm` from `C:\Program Files\nodejs\`),
install Node **22.x** (or newer) from nodejs.org (or use nvm-windows) and remove/disable the older Node from PATH.

---

---

For architecture, security model, Step Functions behaviour, and navigable links into source files, see **[README-dev.md](./README-dev.md)**.

**Local testing (mock API + Vitest, no AWS):** **[README-test.md](./README-test.md)**.
