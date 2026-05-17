import type { Construct } from "constructs";

function envTruthy(name: string): boolean {
  const v = process.env[name];
  if (!v?.trim()) return false;
  return ["1", "true", "yes", "on"].includes(v.trim().toLowerCase());
}

function contextTruthy(scope: Construct, key: string): boolean {
  const v = scope.node.tryGetContext(key);
  if (v === true) return true;
  if (typeof v === "string") return ["1", "true", "yes", "on"].includes(v.trim().toLowerCase());
  return false;
}

/**
 * When true, Lambda asset bundling runs inside the CDK Node 20 bundling image (recommended on Windows).
 *
 * Enable with **`CDK_FORCE_DOCKER_BUNDLING=1`** or **`-c useDockerBundling=true`**.
 */
export function useDockerLambdaBundling(scope: Construct): boolean {
  return envTruthy("CDK_FORCE_DOCKER_BUNDLING") || contextTruthy(scope, "useDockerBundling");
}
