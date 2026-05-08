# LocalStack (`stage=local`)

Use CDK context **`local`** to target **LocalStack** on your machine. This stage uses the same dummy account CDK uses elsewhere (`000000000000`) and turns off X-Ray tracing on the state machine. The **validate** Lambda sets **`MOCK_TEXTRACT=1`** because LocalStack Community does not implement **Textract AnalyzeExpense**; OCR fields are filled from a small synthetic `AnalyzeExpense`-shaped payload (override confidence with **`MOCK_TEXTRACT_MIN_CONFIDENCE`** for manual-verification scenarios).

## Prerequisites

| Requirement | Notes |
| ----------- | ----- |
| **LocalStack** (e.g. 4.12.x Community) | Services API at **`http://localhost:4566`** unless you override |
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

- **Windows:** script runs **`cdk bootstrap`** then **`cdk deploy --all -c stage=local`** inside **`docker compose run node20`**, with **`AWS_ENDPOINT_URL=http://host.docker.internal:4566`** so the container reaches LocalStack on the host.
- **Linux / macOS (host Node 20):** script runs **`cdk bootstrap`** and **`cdk deploy`** on the host with **`AWS_ENDPOINT_URL=http://localhost:4566`**.

Bundled Lambdas require **CDK asset publishing** to LocalStack S3; raw `awslocal cloudformation deploy` of a single template is not sufficient for `NodejsFunction` assets.

## Synth only

```bash
npm run synth:local
```

On **Windows**, if `esbuild` was installed for Windows but you synth inside Docker, use **`npm run docker:synth`** (it runs **`npm rebuild esbuild`** first), then override the synth stage if needed:

```bash
docker compose run --rm node20 sh -lc "npm rebuild esbuild && npx cdk synth -c stage=local"
```

## Related

- Stage list and URLs: [README.md](./README.md), [README-dev.md](./README-dev.md)
- Unit tests (including Textract mock helpers): [README-test.md](./README-test.md)
