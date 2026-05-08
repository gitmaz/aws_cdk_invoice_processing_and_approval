# Change log

Reason-focused notes and small excerpts so we can recall **why** something changed. Newest dates first.

---

## 2026-05-09

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
