# Invoice processing & approval (AWS CDK)

TypeScript **AWS CDK** app for an event-driven invoice pipeline: upload to **S3**, **SQS**-buffered ingest, **Textract** (`AnalyzeExpense`) inside **Step Functions**, optional **auto-approval** or **human review** via **SES** + **HTTP API** + a small **React** SPA, state in **DynamoDB**, and **EventBridge**-driven **analytics** in a separate stack.

| Resource | Stack / name pattern |
| -------- | -------------------- |
| Event bus for outcomes | `InvoiceAnalytics-<stage>` → `invoice-events-<stage>` |
| Invoices, workflow, API | `InvoiceProcessing-<stage>` → e.g. `invoice-records-<stage>`, `invoice-processing-<stage>` (state machine) |
| Counters / daily rollups | `invoice-analytics-<stage>` (DynamoDB) |

**Stages** are selected with CDK context: `-c stage=dev` (default), `test`, or `prod`. Deeper configuration, architecture, and links into the code are in **[README-dev.md](./README-dev.md)**.

**Product notes** live in `prompts.txt` (intentionally **not** committed; see [.gitignore](./.gitignore)).

---

## Installation guide

### Prerequisites

| Requirement | Purpose |
| ----------- | ------- |
| **Git** | Clone / pull this repo |
| **Node.js 20+** *or* **Docker Desktop** | Same major version as Lambda (`nodejs20.x`); use Docker if your PC still has Node 18 (common on Windows) |
| **AWS credentials** (optional for `synth` only; required for `deploy`) | Profile or env vars the AWS CLI / CDK can use (`aws sts get-caller-identity`) |

### 1. Open a terminal in this folder

```bash
cd maz/aws/serverless/aws_cdk_invoice_processing_and_approval
```

(Adjust the path if your checkout layout differs.)

### 2. Install dependencies (pick one toolchain)

**Option A — Node 20 installed on the host**

```bash
node -v    # expect v20.x
npm install
```

**Option B — Node 20 only inside Docker** (recommended when the host cannot run Node 20 yet — see [Local development with Docker (dev)](#local-development-with-docker-dev) below).

```bash
docker compose build
docker compose run --rm node20 npm install
```

Shortcut (same as above): `npm run docker:build` then `npm run docker:install`.

### 3. Optional: stage-specific overrides

Copy [config/example.dev.json](./config/example.dev.json) to **`config/dev.json`** (gitignored) and set SES addresses, reviewer emails, and `spaBaseUrl` for your environment. CDK merges this with [cdk.json](./cdk.json) `context.invoice.*`. Details: [README-dev.md — Configuration layers](./README-dev.md#configuration-layers).

### 4. Verify the app synthesizes

**Host Node 20:**

```bash
npm run synth
```

**Docker:**

```bash
docker compose run --rm node20 npm run synth
# or: npm run docker:synth
```

You should get a `cdk.out` directory without errors.

### 5. Deploy to AWS (optional)

Ensure your account/region are set (for example `CDK_DEFAULT_ACCOUNT`, `CDK_DEFAULT_REGION`, or `AWS_PROFILE`).

**Host:**

```bash
npm run deploy:dev
```

**Docker** (mount credentials on Windows if they are not already visible to the container — see the Docker section below):

```bash
docker compose run --rm node20 npm run deploy:dev
```

After deploy, note CloudFormation outputs (API URL, Cognito ids). Use them when running the SPA (see [README-dev.md — HTTP API and SPA](./README-dev.md#http-api-and-spa)).

---

## Local development with Docker (dev)

Use this when you want a **local dev** workflow on **Node 20** (for example **Windows with Node 18** globally) without changing the host install. The image is defined in [Dockerfile](./Dockerfile); [docker-compose.yml](./docker-compose.yml) mounts the repo at `/app` so edits on disk stay in sync.

### One-time: install Docker and build the image

1. Install **[Docker Desktop](https://www.docker.com/products/docker-desktop/)** (Windows/macOS) or Docker Engine + Compose v2 (Linux).
2. From this directory:

   ```bash
   docker compose build
   ```

### Day-to-day: install / synth / shell

| Goal | Command |
| ---- | ------- |
| Install deps (persists to `./node_modules` on host) | `docker compose run --rm node20 npm install` or **`npm run docker:install`** |
| Synth | `docker compose run --rm node20 npm run synth` or **`npm run docker:synth`** |
| Interactive shell (Node 20, repo at `/app`) | `docker compose run --rm node20 bash` or **`npm run docker:sh`** |

Inside the shell: `node -v` → **v20.x**, then run any npm script (e.g. `npm run deploy:dev`).

### AWS credentials inside the container (dev deploy)

[docker-compose.yml](./docker-compose.yml) forwards `AWS_REGION`, `CDK_DEFAULT_ACCOUNT`, and `CDK_DEFAULT_REGION` from the host when set. To use your profile credentials on **Windows**, mount the read-only AWS config directory:

```powershell
docker compose run --rm `
  -v "${env:USERPROFILE}\.aws:/root/.aws:ro" `
  -e AWS_PROFILE=your-profile `
  node20 npm run deploy:dev
```

### SPA (approval UI) locally

The React app lives under [`spa/`](./spa). For quick UI work you can use **host** Node for Vite (often works on Node 18):

```bash
cd spa
npm install
$env:VITE_API_BASE_URL="https://your-api.execute-api....amazonaws.com"   # PowerShell
npm run dev
```

If you prefer everything on Node 20, run `npm install` and `npm run dev` **inside** the `docker compose run --rm node20 bash` session from the `spa` folder, and open the URL Vite prints (you may need `-p 5173:5173` on `docker run` if you switch to publishing ports — for simplicity, host-side `npm run dev` in `spa` is usually enough for local UI).

### Why Docker for local dev

- Matches **[package.json](./package.json)** `engines` and Lambda **Node 20** behaviour.
- Avoids npm `EBADENGINE` warnings and subtle toolchain drift when the OS ships **Node 18**.

More detail and reasoning: [README-dev.md — Node 20 via Docker](./README-dev.md#node-20-via-docker-windows-and-others).

---

For architecture, security model, Step Functions behaviour, and navigable links into source files, see **[README-dev.md](./README-dev.md)**.
