import { describe, expect, it, afterEach } from "vitest";
import { App, Stack } from "aws-cdk-lib";
import { resolveSpaHosting } from "./resolve-spa-hosting";

describe("resolveSpaHosting", () => {
  const orig = process.env.SPA_HOSTING;

  afterEach(() => {
    if (orig === undefined) delete process.env.SPA_HOSTING;
    else process.env.SPA_HOSTING = orig;
  });

  function mode(ctx?: string, env?: string): string {
    if (env !== undefined) process.env.SPA_HOSTING = env;
    else delete process.env.SPA_HOSTING;
    const app = new App({ context: ctx !== undefined ? { spaHosting: ctx } : {} });
    const stack = new Stack(app, "Test");
    return resolveSpaHosting(stack);
  }

  it("defaults to skip (no CDK SPA assets)", () => {
    expect(mode()).toBe("skip");
  });

  it("accepts none as deprecated alias for skip", () => {
    expect(mode(undefined, "none")).toBe("skip");
    expect(mode("none")).toBe("skip");
  });

  it("prefers SPA_HOSTING env over context", () => {
    expect(mode("ec2", "lambda")).toBe("lambda");
  });

  it("reads context spaHosting", () => {
    expect(mode("lambda")).toBe("lambda");
  });

  it("throws on invalid mode", () => {
    expect(() => mode(undefined, "cdn")).toThrow(/Invalid SPA_HOSTING/);
  });
});
