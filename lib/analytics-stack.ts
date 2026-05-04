import * as cdk from "aws-cdk-lib";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";
import * as path from "path";
import type { StageConfig } from "./stage-config";

export interface AnalyticsStackProps extends cdk.StackProps {
  stage: string;
  config: StageConfig;
}

export class AnalyticsStack extends cdk.Stack {
  public readonly eventBus: events.EventBus;
  public readonly analyticsTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: AnalyticsStackProps) {
    super(scope, id, props);
    const { stage, config } = props;

    this.eventBus = new events.EventBus(this, "InvoiceEventBus", {
      eventBusName: `invoice-events-${stage}`,
    });

    this.analyticsTable = new dynamodb.Table(this, "InvoiceAnalyticsTable", {
      tableName: `invoice-analytics-${stage}`,
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: stage === "prod" ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      pointInTimeRecoverySpecification:
        stage === "prod" ? { pointInTimeRecoveryEnabled: true } : undefined,
    });

    const handler = new NodejsFunction(this, "AnalyticsIngestFunction", {
      functionName: `invoice-analytics-ingest-${stage}`,
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, "..", "lambda", "analytics-ingest", "index.ts"),
      handler: "handler",
      timeout: cdk.Duration.seconds(30),
      memorySize: 256,
      environment: {
        ANALYTICS_TABLE_NAME: this.analyticsTable.tableName,
        STAGE: stage,
      },
      logRetention: logs.RetentionDays.TWO_WEEKS,
      retryAttempts: 2,
    });

    this.analyticsTable.grantReadWriteData(handler);

    new events.Rule(this, "InvoiceDecisionRule", {
      eventBus: this.eventBus,
      description: "Persist invoice outcomes for dashboards / KPIs",
      eventPattern: {
        source: ["invoice.processing"],
        detailType: ["InvoiceOutcome"],
      },
      targets: [
        new targets.LambdaFunction(handler, {
          retryAttempts: 2,
          maxEventAge: cdk.Duration.hours(2),
        }),
      ],
    });

    new cdk.CfnOutput(this, "AnalyticsEventBusName", {
      value: this.eventBus.eventBusName,
      description: "EventBridge bus for invoice outcomes",
    });

    new cdk.CfnOutput(this, "AnalyticsTableName", {
      value: this.analyticsTable.tableName,
    });

    new cdk.CfnOutput(this, "SsmParameterPrefix", {
      value: config.ssmParameterPrefix,
      description: "Suggested SSM namespace for runtime configuration",
    });
  }
}
