
For building frontend (SPA uses prebuilt `spa/dist` only — no Docker):

$env:SPA_HOSTING = "skip"
npm run deploy:dev
# spa/.env.dev → VITE_API_BASE_URL = HttpApiUrl from stack output
npm run spa:build:dev
$env:SPA_HOSTING = "lambda"
npm run deploy:dev -- --require-approval never
# Open SpaLambdaFunctionUrl; review links in email use that URL


@@smoke test testrack on dev:

aws textract list-adapters --profile my-dev --region ap-southeast-2
# → { "Adapters": [] }


Permission the app actually needs (AnalyzeExpense)
The validate Lambda uses textract:AnalyzeExpense. Optional smoke test with a small PDF/image:

@@Permission the app actually needs (AnalyzeExpense)
The validate Lambda uses textract:AnalyzeExpense. Optional smoke test with a small PDF/image:

aws textract analyze-expense `
  --document "Bytes=fileb://path\to\small-invoice.pdf" `
  --profile my-dev `
  --region ap-southeast-2

@@if above fails check if IAM role has a problem:

aws iam simulate-principal-policy `
  --policy-source-arn "arn:aws:iam::154501673607:user/cdk-deploy" `
  --action-names "textract:AnalyzeExpense" `
  --profile my-dev


@@For building for dev:
$env:CDK_DEFAULT_ACCOUNT = "154501673607"
$env:CDK_DEFAULT_REGION = "ap-southeast-2"
$env:AWS_PROFILE = "my-dev"
$env:SPA_HOSTING = "lambda"
npm run build

@@For synthing for dev:
npm run synth -- -c stage=dev --profile my-dev


Note: with SPA_HOSTING=lambda, synth/deploy fails until spa/dist exists (run npm run spa:build:dev first).

@@then deploy:
npm run deploy:dev -- --profile my-dev --require-approval never

@@passing HttpApiUrl:
npm run playwright:print-env:dev

HttpApiUrl → PLAYWRIGHT_API_BASE_URL / spa/.env.dev → VITE_API_BASE_URL

@@e2e Testing on dev
$env:AWS_PROFILE = "my-dev"
$env:AWS_REGION = "ap-southeast-2"
npm run playwright:print-env:dev       # paste output
npm run test:e2e:dev


@@@preparing to run e2e test on dev
What should be prepared:
Confirmed stack InvoiceProcessing-dev is UPDATE_COMPLETE in ap-southeast-2.
Loaded env from CloudFormation via npm run playwright:print-env:dev:
API: https://i6ppexbkw3.execute-api.ap-southeast-2.amazonaws.com
Pool: ap-southeast-2_xCUzgI64w, client: 5bkf65rg8scrh43ceegmhpb10t
Table: invoice-records-dev
Cognito test user was created automatically (e2e-invoice-dev@example.invalid).


@@FINAL e2e dev test: (it will set the required env variables by itself)
npm run test:e2e:dev:headed

@manual testing:
spa base url
https://4zpmth3ymohrjhvv2rkka7kriq0qdiol.lambda-url.ap-southeast-2.on.aws

review page: (does not need login, sesion id takes care of authorisation)
https://4zpmth3ymohrjhvv2rkka7kriq0qdiol.lambda-url.ap-southeast-2.on.aws/?invoiceId=<INVOICE_ID>&session=<REVIEW_SESSION_ID>&apiBase=https://i6ppexbkw3.execute-api.ap-southeast-2.amazonaws.com


@@checking if stack is completed deploy:

Set-Location "c:\worklab\wp\maz1stwp\maz\aws\serverless\aws_cdk_invoice_processing_and_approval"; $env:AWS_PROFILE = "my-dev"; $env:AWS_REGION = "ap-southeast-2"; Remove-Item Env:AWS_ENDPOINT_URL -ErrorAction SilentlyContinue; aws cloudformation describe-stacks --stack-name InvoiceProcessing-dev --region ap-southeast-2 --query "Stacks[0].StackStatus" --output text 2>&1
UPDATE_COMPLETE


Successful run
Used the deployed Lambda SPA so the test didn’t depend on local Vite:


cd maz\aws\serverless\aws_cdk_invoice_processing_and_approval
$env:AWS_PROFILE = "my-dev"
$env:AWS_REGION = "ap-southeast-2"
Remove-Item Env:AWS_ENDPOINT_URL -ErrorAction SilentlyContinue
$env:PLAYWRIGHT_API_BASE_URL = "https://i6ppexbkw3.execute-api.ap-southeast-2.amazonaws.com"
$env:PLAYWRIGHT_COGNITO_POOL_ID = "ap-southeast-2_xCUzgI64w"
$env:PLAYWRIGHT_COGNITO_CLIENT_ID = "5bkf65rg8scrh43ceegmhpb10t"
$env:PLAYWRIGHT_INVOICES_TABLE = "invoice-records-dev"
$env:PLAYWRIGHT_REVIEW_TIMEOUT_MS = "300000"
$env:PLAYWRIGHT_TEST_EMAIL = "e2e-invoice-dev@example.invalid"
$env:PLAYWRIGHT_TEST_PASSWORD = "TestPass123!"
$env:PLAYWRIGHT_SKIP_WEBSERVER = "1"
$env:PLAYWRIGHT_SPA_BASE_URL = "https://4zpmth3ymohrjhvv2rkka7kriq0qdiol.lambda-url.ap-southeast-2.on.aws"
npm run test:e2e:dev

@@running e2e test on dev headed:

$env:AWS_PROFILE = "my-dev"
$env:AWS_REGION = "ap-southeast-2"
npm run test:e2e:dev:headed

# Loads API/Cognito/SPA from stack; uses Lambda SPA by default (no port 5173).
# Raw playwright (must set env yourself): npm run playwright:print-env:dev

@@running e2e test on dev
Set-Location "c:\worklab\wp\maz1stwp\maz\aws\serverless\aws_cdk_invoice_processing_and_approval"; $env:AWS_PROFILE = "my-dev"; $env:AWS_REGION = "ap-southeast-2"; Remove-Item Env:AWS_ENDPOINT_URL -ErrorAction SilentlyContinue; $env:PLAYWRIGHT_API_BASE_URL = "https://i6ppexbkw3.execute-api.ap-southeast-2.amazonaws.com"; $env:PLAYWRIGHT_COGNITO_POOL_ID = "ap-southeast-2_xCUzgI64w"; $env:PLAYWRIGHT_COGNITO_CLIENT_ID = "5bkf65rg8scrh43ceegmhpb10t"; $env:PLAYWRIGHT_INVOICES_TABLE = "invoice-records-dev"; $env:PLAYWRIGHT_REVIEW_TIMEOUT_MS = "300000"; $env:PLAYWRIGHT_TEST_EMAIL = "e2e-invoice-dev@example.invalid"; $env:PLAYWRIGHT_TEST_PASSWORD = "TestPass123!"; npm run test:e2e:dev


@@tear down after experimenting:

cdk destroy --all -c stage=dev --profile my-dev
