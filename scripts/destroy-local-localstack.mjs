import { execFileSync } from "node:child_process";

const stage = "local";
const account = "000000000000";
const region = process.env.CDK_DEFAULT_REGION ?? process.env.AWS_DEFAULT_REGION ?? "us-east-1";

function resolvedEndpoint(forDockerComposeRun) {
  if (process.env.AWS_ENDPOINT_URL) return process.env.AWS_ENDPOINT_URL;
  if (forDockerComposeRun) return "http://host.docker.internal:4566";
  return "http://localhost:4566";
}

function dockerComposeRunEnv(endpoint) {
  return [
    "-e",
    `AWS_ENDPOINT_URL=${endpoint}`,
    "-e",
    "AWS_ACCESS_KEY_ID=test",
    "-e",
    "AWS_SECRET_ACCESS_KEY=test",
    "-e",
    `AWS_DEFAULT_REGION=${region}`,
    "-e",
    `CDK_DEFAULT_ACCOUNT=${account}`,
    "-e",
    `CDK_DEFAULT_REGION=${region}`,
    "-e",
    "AWS_EC2_METADATA_DISABLED=true",
  ];
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
    AWS_EC2_METADATA_DISABLED: "true",
  };
}

const inner = ["npm rebuild esbuild", `npx cdk destroy --all -c stage=${stage} --force`].join(" && ");

if (process.platform === "win32") {
  const ep = resolvedEndpoint(true);
  execFileSync(
    "docker",
    ["compose", "run", "--rm", ...dockerComposeRunEnv(ep), "node20", "sh", "-lc", inner],
    { stdio: "inherit" },
  );
} else {
  const ep = resolvedEndpoint(false);
  execFileSync("npx", ["cdk", "destroy", "--all", "-c", `stage=${stage}`, "--force"], {
    stdio: "inherit",
    env: hostLocalstackEnv(ep),
  });
}

console.log("LocalStack destroy initiated/completed (stage=local).");
