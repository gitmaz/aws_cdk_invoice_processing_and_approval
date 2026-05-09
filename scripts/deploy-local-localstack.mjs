import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Deploy `stage=local` to LocalStack using **CDK bootstrap + CDK deploy** (not raw CloudFormation templates).
 * Bundled Lambdas (`NodejsFunction`) publish assets to LocalStack S3; `BootstraplessSynthesizer` cannot be used for that.
 *
 * **Host Playwright / AWS CLI** use `http://localhost:<host-port>` (default 4566).
 *
 * Override in-container endpoint: **`DEPLOY_LOCAL_DOCKER_ENDPOINT`** or **`AWS_ENDPOINT_URL`**.
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const stage = "local";
const account = "000000000000";
const region = process.env.CDK_DEFAULT_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1";

/** Default host endpoint (LocalStack on host). */
const defaultHostEndpoint = "http://127.0.0.1:4566";

/** When unset, pick an endpoint that reaches LocalStack from the host. */
function resolvedEndpoint() {
  return process.env.AWS_ENDPOINT_URL ?? defaultHostEndpoint;
}

function resolvedS3Endpoint() {
  return process.env.AWS_ENDPOINT_URL_S3 ?? resolvedEndpoint();
}

function hostLocalstackEnv(endpoint) {
  return {
    ...process.env,
    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID ?? "test",
    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY ?? "test",
    AWS_DEFAULT_REGION: region,
    CDK_DEFAULT_ACCOUNT: account,
    CDK_DEFAULT_REGION: region,
    AWS_ENDPOINT_URL: endpoint,
    AWS_ENDPOINT_URL_S3: resolvedS3Endpoint(),
    AWS_EC2_METADATA_DISABLED: "true",
    AWS_USE_PATH_STYLE_ENDPOINT: "true",
    AWS_S3_FORCE_PATH_STYLE: "1",
  };
}

/**
 * A host `AWS_PROFILE` can make CDK ignore dummy keys.
 * `HOME` from Docker Desktop can point at an unusable Windows path — normalize before CDK runs.
 */
const ep = resolvedEndpoint();
const env = hostLocalstackEnv(ep);
const isWin = process.platform === "win32";

function run(bin, args) {
  if (!isWin) {
    execFileSync(bin, args, { stdio: "inherit", env });
    return;
  }
  const cmd = [bin, ...args].join(" ");
  execFileSync("cmd.exe", ["/d", "/s", "/c", cmd], { stdio: "inherit", env });
}

// Build first so `--app node dist/bin/...` can resolve and `NodejsFunction entry` paths remain correct.
run("npm", ["run", "build"]);
run("npx", ["-p", "aws-cdk@2.1121.0", "cdk", "bootstrap", `aws://${account}/${region}`, "-c", `stage=${stage}`]);
run("npx", [
  "-p",
  "aws-cdk@2.1121.0",
  "cdk",
  "deploy",
  "--all",
  "-c",
  `stage=${stage}`,
  "--require-approval",
  "never",
]);

console.log("LocalStack deploy finished (stage=local).");
