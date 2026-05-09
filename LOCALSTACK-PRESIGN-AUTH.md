# LocalStack presign authentication (`stage=local`)

This note explains **why** the **`POST /upload/presign`** route behaves differently on **`stage=local`** and how the **shared-secret header** workaround fits together with **Cognito + JWT** used on real AWS stages.

---

## Problem

For **`dev` / `test` / `prod`**, the HTTP API uses an **`HttpJwtAuthorizer`** backed by **Amazon Cognito**. API Gateway validates each request’s **`Authorization: Bearer`** token against the Cognito user pool’s **issuer** and **JWKS** at URLs shaped like **`https://cognito-idp.<region>.amazonaws.com/<poolId>/...`**.

On **LocalStack Community** (and many emulator setups):

1. **Cognito Identity Provider APIs** often work enough to create pools, clients, and sometimes **`InitiateAuth`** / **`AdminInitiateAuth`**.
2. Tokens issued locally may still carry an **issuer**, **kid**, or **JWKS URL** that **does not match** what API Gateway’s JWT authorizer fetches when validating against the **real** AWS-style issuer URL.
3. Result: **`POST /upload/presign`** can fail **before** the Lambda runs, even though “login” appears to work in isolation.

So **JWT-at-the-gateway** is an unreliable contract for **`stage=local`** when you only need “something only my dev client knows” to obtain a presigned S3 URL.

---

## Workaround (kept for `stage=local` only)

For **`stage=local`**:

1. **No HTTP JWT authorizer** on **`POST /upload/presign`** (CDK omits **`authorizer`** for that route).
2. The **presign Lambda** reads **`PRESIGN_LOCAL_SECRET`** from its environment (from **`invoice.local.presignLocalSecret`** in **`cdk.json`** / **`config/local.json`**, with a safe default in **`loadStageConfig`**).
3. Clients send the same value in header **`x-presign-local-secret`**.
4. If the header matches, the Lambda treats the caller as **`sub = local-upload`** for S3 key prefixing (same code path shape as a real **`sub`** from JWT).

**CORS** for the HTTP API includes **`x-presign-local-secret`** only when **`stage=local`**.

**Non-local stages** are unchanged: Cognito **JWT authorizer** remains; the Lambda still expects **`sub`** from **`requestContext.authorizer.jwt.claims`**.

---

## Security expectations

- This mechanism is **only** intended for **local emulator** workflows. It is **not** a substitute for Cognito in production.
- Override the default secret via **`config/local.json`** (gitignored) or **`cdk.json` → `context.invoice.local.presignLocalSecret`** on shared machines.
- Treat **`presignLocalSecret`** like a **dev API key**: anyone who can reach your LocalStack API and knows the secret can obtain upload URLs.

---

## Configuration reference

| Source | Field | Purpose |
| ------ | ----- | ------- |
| **`cdk.json`** | `context.invoice.local.presignLocalSecret` | Versioned default for team |
| **`config/local.json`** | `presignLocalSecret` | Local override (gitignored) |
| **Lambda env** | `PRESIGN_LOCAL_SECRET` | Set by CDK from merged **`StageConfig`** when **`stage=local`** |

Default string (unless overridden): **`localstack-presign-change-me`**.

---

## Related files

| File | Role |
| ---- | ---- |
| [`lib/invoice-processing-stack.ts`](./lib/invoice-processing-stack.ts) | Conditional JWT authorizer; CORS; `PRESIGN_LOCAL_SECRET` env |
| [`lambda/presign-upload/index.ts`](./lambda/presign-upload/index.ts) | Validates **`x-presign-local-secret`** vs env for **`stage=local`** |
| [`lib/stage-config.ts`](./lib/stage-config.ts) | **`presignLocalSecret`** on **`StageConfig`** |
| [`e2e/env.example`](./e2e/env.example) | **`PLAYWRIGHT_PRESIGN_LOCAL_SECRET`** for Playwright |

See also **[LOCALSTACK.md](./LOCALSTACK.md)** (overview) and **[local-e2e-userguide.md](./local-e2e-userguide.md)** (local Vite SPA / uploads / E2E).
