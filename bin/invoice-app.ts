#!/usr/bin/env node
import "source-map-support/register";
import * as cdk from "aws-cdk-lib";
import { InvoiceProcessingStack } from "../lib/invoice-processing-stack";
import { AnalyticsStack } from "../lib/analytics-stack";
import { loadStageConfig, type InvoiceContextOverrides } from "../lib/stage-config";

const app = new cdk.App();

const stage = app.node.tryGetContext("stage") ?? "dev";
const isLocal = stage === "local";

/** LocalStack convention; avoids needing real AWS account resolution during synth/deploy-to-emulator. */
const localEnv = {
  account: "000000000000",
  region: process.env.CDK_DEFAULT_REGION ?? "us-east-1",
};

const account = isLocal ? localEnv.account : process.env.CDK_DEFAULT_ACCOUNT;
const region = isLocal ? localEnv.region : process.env.CDK_DEFAULT_REGION ?? "us-east-1";

const stackEnv = isLocal ? localEnv : { account, region };

const config = loadStageConfig(stage, {
  invoice: app.node.tryGetContext("invoice") as Record<string, InvoiceContextOverrides> | undefined,
});

const analyticsStack = new AnalyticsStack(app, `InvoiceAnalytics-${stage}`, {
  env: stackEnv,
  stage,
  config,
  description: `Invoice analytics (EventBridge + DynamoDB) — ${stage}`,
});

const invoiceStack = new InvoiceProcessingStack(app, `InvoiceProcessing-${stage}`, {
  env: stackEnv,
  stage,
  config,
  analyticsEventBus: analyticsStack.eventBus,
  description: `Invoice OCR + Step Functions approval pipeline — ${stage}`,
});

invoiceStack.addDependency(analyticsStack);
