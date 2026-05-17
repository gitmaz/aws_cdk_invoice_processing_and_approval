import { CfnOutput, Duration, RemovalPolicy, Stack } from "aws-cdk-lib";
import * as iam from "aws-cdk-lib/aws-iam";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import { Construct } from "constructs";

import { useDockerLambdaBundling } from "./bundling-flags";
import { spaPrebuiltLocalBundling } from "./spa-local-bundle";
import { envTruthySpa, type SpaHostingMode } from "./resolve-spa-hosting";
import { projectRoot } from "./stage-config";

export interface SpaHostingConstructProps {
  readonly stage: string;
  readonly mode: SpaHostingMode;
}

/**
 * Publishes the Vite approval SPA from **`spa/`** at deploy time.
 *
 * - **`lambda`**: Lambda + function URL serves `spa/dist` (SPA fallback to `index.html`).
 * - **`ec2`**: S3 bucket + deployment for sync to nginx on EC2.
 *
 * Env: **`SPA_HOSTING`**, **`SPA_USE_PREBUILT_DIST`**, **`SPA_EC2_*`** — see README-dev.md.
 */
export class SpaHostingConstruct extends Construct {
  /** Set when `mode === "lambda"` (no trailing slash). */
  readonly lambdaFunctionUrl?: string;

  constructor(scope: Construct, id: string, props: SpaHostingConstructProps) {
    super(scope, id);
    const { stage, mode } = props;
    const stack = Stack.of(this);
    const root = projectRoot();
    const forceDocker = useDockerLambdaBundling(this);
    const usePrebuilt = envTruthySpa("SPA_USE_PREBUILT_DIST");

    const spaBundlingCommand = usePrebuilt
      ? [
          "bash",
          "-c",
          [
            "set -e",
            'test -d spa/dist || { echo "spa/dist missing. Run npm run spa:build or unset SPA_USE_PREBUILT_DIST." >&2; exit 1; }',
            "mkdir -p /asset-output/dist",
            "cp -r spa/dist/. /asset-output/dist/",
            "cp lambda/spa-static-host/handler.cjs /asset-output/index.js",
          ].join(" && "),
        ]
      : [
          "bash",
          "-c",
          [
            "set -e",
            "cd spa",
            'if [ -f package-lock.json ]; then npm ci; else npm install; fi',
            "npm run build",
            "mkdir -p /asset-output/dist",
            "cp -r dist/. /asset-output/dist/",
            "cp ../lambda/spa-static-host/handler.cjs /asset-output/index.js",
          ].join(" && "),
        ];

    const spaBundlingForS3 = usePrebuilt
      ? [
          "bash",
          "-c",
          [
            "set -e",
            'test -d spa/dist || { echo "spa/dist missing. Run npm run spa:build or unset SPA_USE_PREBUILT_DIST." >&2; exit 1; }',
            "cp -r spa/dist/. /asset-output/",
          ].join(" && "),
        ]
      : [
          "bash",
          "-c",
          ["set -e", "cd spa", 'if [ -f package-lock.json ]; then npm ci; else npm install; fi', "npm run build", "cp -r dist/. /asset-output/"].join(
            " && ",
          ),
        ];

    const commonBundling = {
      image: lambda.Runtime.NODEJS_20_X.bundlingImage,
      forceDockerBundling: forceDocker,
      user: "root",
      ...(usePrebuilt ? { local: spaPrebuiltLocalBundling(root, mode === "ec2" ? "s3" : "lambda") } : {}),
    };

    if (mode === "lambda") {
      const fn = new lambda.Function(this, "SpaStaticFn", {
        runtime: lambda.Runtime.NODEJS_20_X,
        handler: "index.handler",
        code: lambda.Code.fromAsset(root, {
          bundling: {
            ...commonBundling,
            command: spaBundlingCommand,
          },
        }),
        timeout: Duration.seconds(10),
        memorySize: 256,
        tracing: lambda.Tracing.DISABLED,
        description: `Static host for invoice approval SPA (${stage})`,
      });

      const fnUrl = fn.addFunctionUrl({
        authType: lambda.FunctionUrlAuthType.NONE,
        cors: {
          allowedOrigins: ["*"],
          allowedMethods: [lambda.HttpMethod.GET, lambda.HttpMethod.HEAD],
          allowedHeaders: ["*"],
        },
      });

      this.lambdaFunctionUrl = fnUrl.url.replace(/\/$/, "");

      new CfnOutput(stack, "SpaLambdaFunctionUrl", {
        value: fnUrl.url,
        description:
          "Review SPA (Lambda function URL). Set spaBaseUrl to this for emails, or rely on auto wiring when SPA_HOSTING=lambda.",
      });
    } else if (mode === "ec2") {
      const prefix = process.env.SPA_EC2_KEY_PREFIX?.trim() || `spa/${stage}`;
      const existingName = process.env.SPA_EC2_ARTIFACT_BUCKET?.trim();
      const ec2RoleArn = process.env.SPA_EC2_INSTANCE_ROLE_ARN?.trim();

      const bucket = existingName
        ? s3.Bucket.fromBucketName(this, "SpaEc2ArtifactImported", existingName)
        : new s3.Bucket(this, "SpaEc2Artifact", {
            encryption: s3.BucketEncryption.S3_MANAGED,
            blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
            autoDeleteObjects: stage !== "prod",
            removalPolicy: stage === "prod" ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
          });

      new s3deploy.BucketDeployment(this, "SpaEc2Deploy", {
        sources: [
          s3deploy.Source.asset(root, {
            bundling: {
              ...commonBundling,
              command: spaBundlingForS3,
            },
          }),
        ],
        destinationBucket: bucket,
        destinationKeyPrefix: prefix,
        memoryLimit: 4096,
      });

      if (ec2RoleArn) {
        const role = iam.Role.fromRoleArn(this, "SpaEc2ReaderRole", ec2RoleArn, { mutable: false });
        bucket.grantRead(role);
      }

      const bucketName = bucket.bucketName;
      new CfnOutput(stack, "SpaEc2ArtifactBucket", {
        value: bucketName,
        description: "S3 bucket with built SPA objects for EC2/nginx (sync to instance).",
      });
      new CfnOutput(stack, "SpaEc2ObjectPrefix", {
        value: prefix,
        description: "Key prefix under the artifact bucket.",
      });
      new CfnOutput(stack, "SpaEc2SyncExample", {
        value: `aws s3 sync s3://${bucketName}/${prefix}/ /var/www/html/`,
        description: "Example: sync artifacts onto EC2 (adjust target path for your web root).",
      });
      if (!ec2RoleArn) {
        new CfnOutput(stack, "SpaEc2RoleHint", {
          value: "Set SPA_EC2_INSTANCE_ROLE_ARN before deploy to grant the EC2 instance profile s3:GetObject on this bucket.",
          description: "EC2 IAM hint (no role ARN was set at deploy time).",
        });
      }
    }
  }
}
