import * as cdk from "aws-cdk-lib";
import * as apigwv2 from "aws-cdk-lib/aws-apigatewayv2";
import * as apigwIntegrations from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as authorizers from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as events from "aws-cdk-lib/aws-events";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3n from "aws-cdk-lib/aws-s3-notifications";
import * as sqs from "aws-cdk-lib/aws-sqs";
import * as sfn from "aws-cdk-lib/aws-stepfunctions";
import * as tasks from "aws-cdk-lib/aws-stepfunctions-tasks";
import { Construct } from "constructs";
import * as path from "path";
import type { StageConfig } from "./stage-config";

export interface InvoiceProcessingStackProps extends cdk.StackProps {
  stage: string;
  config: StageConfig;
  analyticsEventBus: events.IEventBus;
}

export class InvoiceProcessingStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: InvoiceProcessingStackProps) {
    super(scope, id, props);
    const { stage, config } = props;
    const region = cdk.Stack.of(this).region;

    const invoicesBucket = new s3.Bucket(this, "InvoicesBucket", {
      bucketName: undefined,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: stage === "prod" ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: stage !== "prod",
    });

    const ingestionDlq = new sqs.Queue(this, "IngestionDlq", {
      retentionPeriod: cdk.Duration.days(14),
    });

    const ingestionQueue = new sqs.Queue(this, "IngestionQueue", {
      visibilityTimeout: cdk.Duration.seconds(300),
      deadLetterQueue: { queue: ingestionDlq, maxReceiveCount: 5 },
    });

    invoicesBucket.addEventNotification(s3.EventType.OBJECT_CREATED, new s3n.SqsDestination(ingestionQueue));

    const invoicesTable = new dynamodb.Table(this, "InvoicesTable", {
      tableName: `invoice-records-${stage}`,
      partitionKey: { name: "invoiceId", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: stage === "prod" ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      pointInTimeRecoverySpecification:
        stage === "prod" ? { pointInTimeRecoveryEnabled: true } : undefined,
    });

    const commonLambdaEnv = {
      INVOICES_TABLE_NAME: invoicesTable.tableName,
      STAGE: stage,
      OCR_CONFIDENCE_THRESHOLD: String(config.ocrConfidenceThreshold),
      SES_FROM_ADDRESS: config.sesFromAddress,
      SPA_BASE_URL: config.spaBaseUrl,
      HUMAN_REVIEW_EMAILS: config.humanReviewNotifyEmails.join(","),
      REJECTION_NOTIFY_EMAILS: config.rejectionNotifyEmails.join(","),
      EVENT_BUS_NAME: props.analyticsEventBus.eventBusName,
    };

    const lambdaDefaults = {
      runtime: lambda.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(60),
      memorySize: 512,
      logRetention: logs.RetentionDays.TWO_WEEKS,
      retryAttempts: 2,
    };

    const validateFn = new NodejsFunction(this, "ValidateInvoiceFn", {
      ...lambdaDefaults,
      entry: path.join(__dirname, "..", "lambda", "validate", "index.ts"),
      handler: "handler",
      environment: { ...commonLambdaEnv },
    });

    const notifyFn = new NodejsFunction(this, "NotifyHumanFn", {
      ...lambdaDefaults,
      entry: path.join(__dirname, "..", "lambda", "notify-human", "index.ts"),
      handler: "handler",
      timeout: cdk.Duration.seconds(30),
      environment: { ...commonLambdaEnv },
    });

    const finalizeAutoFn = new NodejsFunction(this, "FinalizeAutoFn", {
      ...lambdaDefaults,
      entry: path.join(__dirname, "..", "lambda", "finalize-auto", "index.ts"),
      handler: "handler",
      timeout: cdk.Duration.seconds(30),
      environment: { ...commonLambdaEnv },
    });

    const finalizeApproveFn = new NodejsFunction(this, "FinalizeHumanApproveFn", {
      ...lambdaDefaults,
      entry: path.join(__dirname, "..", "lambda", "finalize-human-approve", "index.ts"),
      handler: "handler",
      timeout: cdk.Duration.seconds(30),
      environment: { ...commonLambdaEnv },
    });

    const finalizeRejectFn = new NodejsFunction(this, "FinalizeHumanRejectFn", {
      ...lambdaDefaults,
      entry: path.join(__dirname, "..", "lambda", "finalize-human-reject", "index.ts"),
      handler: "handler",
      timeout: cdk.Duration.seconds(30),
      environment: { ...commonLambdaEnv },
    });

    invoicesTable.grantReadWriteData(validateFn);
    invoicesTable.grantReadWriteData(notifyFn);
    invoicesTable.grantReadWriteData(finalizeAutoFn);
    invoicesTable.grantReadWriteData(finalizeApproveFn);
    invoicesTable.grantReadWriteData(finalizeRejectFn);

    validateFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["textract:AnalyzeExpense"],
        resources: ["*"],
      }),
    );
    invoicesBucket.grantRead(validateFn);

    notifyFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["ses:SendEmail", "ses:SendRawEmail"],
        resources: ["*"],
      }),
    );
    finalizeRejectFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["ses:SendEmail", "ses:SendRawEmail"],
        resources: ["*"],
      }),
    );

    props.analyticsEventBus.grantPutEventsTo(finalizeAutoFn);
    props.analyticsEventBus.grantPutEventsTo(finalizeApproveFn);
    props.analyticsEventBus.grantPutEventsTo(finalizeRejectFn);

    const validateTask = new tasks.LambdaInvoke(this, "ValidateInvoiceTask", {
      lambdaFunction: validateFn,
      payload: sfn.TaskInput.fromJsonPathAt("$"),
      resultPath: "$.validated",
      retryOnServiceExceptions: true,
    }).addRetry({
      errors: ["Lambda.ServiceException", "Lambda.AWSLambdaException"],
      interval: cdk.Duration.seconds(2),
      maxAttempts: 4,
      backoffRate: 2,
    });

    const finalizeAutoTask = new tasks.LambdaInvoke(this, "FinalizeAutoTask", {
      lambdaFunction: finalizeAutoFn,
      payload: sfn.TaskInput.fromJsonPathAt("$"),
      resultPath: "$.finalizeAuto",
    }).addCatch(new sfn.Fail(this, "AutoFinalizeFailed", { error: "AutoFinalizeFailed" }), {
      resultPath: "$.error",
    });

    const notifyTask = new tasks.LambdaInvoke(this, "NotifyHumanTask", {
      lambdaFunction: notifyFn,
      integrationPattern: sfn.IntegrationPattern.WAIT_FOR_TASK_TOKEN,
      payload: sfn.TaskInput.fromObject({
        "bucket.$": "$.validated.bucket",
        "key.$": "$.validated.key",
        "invoiceId.$": "$.validated.invoiceId",
        "stage.$": "$.validated.stage",
        "minConfidence.$": "$.validated.minConfidence",
        "needsHumanReview.$": "$.validated.needsHumanReview",
        "taskToken.$": "$$.Task.Token",
      }),
      taskTimeout: sfn.Timeout.duration(cdk.Duration.days(7)),
    }).addCatch(new sfn.Fail(this, "HumanReviewTimeout", { error: "HumanReviewTimeout" }), {
      errors: ["States.Timeout"],
      resultPath: "$.timeout",
    });

    const approveHumanTask = new tasks.LambdaInvoke(this, "FinalizeHumanApproveTask", {
      lambdaFunction: finalizeApproveFn,
      payload: sfn.TaskInput.fromJsonPathAt("$"),
      resultPath: "$.finalizeHumanApprove",
    });

    const rejectHumanTask = new tasks.LambdaInvoke(this, "FinalizeHumanRejectTask", {
      lambdaFunction: finalizeRejectFn,
      payload: sfn.TaskInput.fromJsonPathAt("$"),
      resultPath: "$.finalizeHumanReject",
    });

    const humanChoice = new sfn.Choice(this, "HumanApproveOrReject")
      .when(sfn.Condition.stringEquals("$.action", "APPROVE"), approveHumanTask)
      .when(sfn.Condition.stringEquals("$.action", "REJECT"), rejectHumanTask)
      .otherwise(
        new sfn.Fail(this, "BadHumanPayload", {
          error: "BadHumanPayload",
          cause: "Expected action APPROVE or REJECT",
        }),
      );

    notifyTask.next(humanChoice);

    const needsHuman = new sfn.Choice(this, "NeedsHumanReview")
      .when(sfn.Condition.booleanEquals("$.validated.needsHumanReview", true), notifyTask)
      .otherwise(finalizeAutoTask);

    const definition = validateTask.next(needsHuman);

    const stateMachine = new sfn.StateMachine(this, "InvoiceStateMachine", {
      stateMachineName: `invoice-processing-${stage}`,
      definitionBody: sfn.DefinitionBody.fromChainable(definition),
      timeout: cdk.Duration.days(14),
      tracingEnabled: true,
      logs: {
        destination: new logs.LogGroup(this, "InvoiceSfnLogs", {
          retention: logs.RetentionDays.TWO_WEEKS,
        }),
        level: sfn.LogLevel.ALL,
      },
    });

    const ingestFn = new NodejsFunction(this, "IngestFromQueueFn", {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, "..", "lambda", "ingest", "index.ts"),
      handler: "handler",
      timeout: cdk.Duration.seconds(30),
      environment: {
        STATE_MACHINE_ARN: stateMachine.stateMachineArn,
        STAGE: stage,
      },
      logRetention: logs.RetentionDays.TWO_WEEKS,
      retryAttempts: 2,
    });

    stateMachine.grantStartExecution(ingestFn);
    ingestFn.addEventSource(
      new SqsEventSource(ingestionQueue, {
        batchSize: 5,
        reportBatchItemFailures: true,
      }),
    );

    const publicApiFn = new NodejsFunction(this, "PublicInvoiceApiFn", {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, "..", "lambda", "public-api", "index.ts"),
      handler: "handler",
      timeout: cdk.Duration.seconds(15),
      environment: { INVOICES_TABLE_NAME: invoicesTable.tableName },
      logRetention: logs.RetentionDays.TWO_WEEKS,
    });

    invoicesTable.grantReadData(publicApiFn);
    publicApiFn.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["states:SendTaskSuccess", "states:SendTaskFailure"],
        resources: ["*"],
      }),
    );

    const userPool = new cognito.UserPool(this, "InvoiceUserPool", {
      userPoolName: `invoice-users-${stage}`,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      removalPolicy: stage === "prod" ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    const userPoolClient = userPool.addClient("SpaClient", {
      authFlows: { userPassword: true, userSrp: true },
      generateSecret: false,
    });

    const issuer = `https://cognito-idp.${region}.amazonaws.com/${userPool.userPoolId}`;
    const jwtAuthorizer = new authorizers.HttpJwtAuthorizer("InvoiceJwtAuthorizer", issuer, {
      jwtAudience: [userPoolClient.userPoolClientId],
    });

    const presignFn = new NodejsFunction(this, "PresignUploadFn", {
      runtime: lambda.Runtime.NODEJS_20_X,
      entry: path.join(__dirname, "..", "lambda", "presign-upload", "index.ts"),
      handler: "handler",
      timeout: cdk.Duration.seconds(10),
      environment: {
        INVOICES_BUCKET_NAME: invoicesBucket.bucketName,
        STAGE: stage,
      },
      logRetention: logs.RetentionDays.TWO_WEEKS,
    });
    invoicesBucket.grantReadWrite(presignFn);

    const httpApi = new apigwv2.HttpApi(this, "InvoiceHttpApi", {
      apiName: `invoice-api-${stage}`,
      corsPreflight: {
        allowHeaders: ["authorization", "content-type"],
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.OPTIONS,
        ],
        allowOrigins: ["*"],
      },
    });

    httpApi.addRoutes({
      path: "/public/invoice/{invoiceId}",
      methods: [apigwv2.HttpMethod.GET],
      integration: new apigwIntegrations.HttpLambdaIntegration("GetInvoice", publicApiFn),
    });

    httpApi.addRoutes({
      path: "/public/decision",
      methods: [apigwv2.HttpMethod.POST],
      integration: new apigwIntegrations.HttpLambdaIntegration("PostDecision", publicApiFn),
    });

    httpApi.addRoutes({
      path: "/upload/presign",
      methods: [apigwv2.HttpMethod.POST],
      integration: new apigwIntegrations.HttpLambdaIntegration("PresignUpload", presignFn),
      authorizer: jwtAuthorizer,
    });

    new cdk.CfnOutput(this, "HttpApiUrl", { value: httpApi.apiEndpoint });
    new cdk.CfnOutput(this, "InvoicesBucketName", { value: invoicesBucket.bucketName });
    new cdk.CfnOutput(this, "StateMachineArn", { value: stateMachine.stateMachineArn });
    new cdk.CfnOutput(this, "CognitoUserPoolId", { value: userPool.userPoolId });
    new cdk.CfnOutput(this, "CognitoClientId", { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, "CognitoIssuer", { value: issuer });
  }
}
