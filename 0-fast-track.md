
For building frontend:

Manual (unchanged):

$env:SPA_HOSTING = "none"   # or omit — default
npm run deploy:dev
Lambda function URL:


# 1) spa/.env.dev → VITE_API_BASE_URL = HttpApiUrl from last deploy
npm run spa:build:dev
$env:SPA_HOSTING = "lambda"
$env:SPA_USE_PREBUILT_DIST = "1"
npm run deploy:dev -- --require-approval never
# Open SpaLambdaFunctionUrl; review links in email use that URL


--smoke test testrack on dev:

aws textract list-adapters --profile my-dev --region ap-southeast-2
# → { "Adapters": [] }


Permission the app actually needs (AnalyzeExpense)
The validate Lambda uses textract:AnalyzeExpense. Optional smoke test with a small PDF/image:

--Permission the app actually needs (AnalyzeExpense)
The validate Lambda uses textract:AnalyzeExpense. Optional smoke test with a small PDF/image:

aws textract analyze-expense `
  --document "Bytes=fileb://path\to\small-invoice.pdf" `
  --profile my-dev `
  --region ap-southeast-2

--if above fails check if IAM role has a problem:

aws iam simulate-principal-policy `
  --policy-source-arn "arn:aws:iam::154501673607:user/cdk-deploy" `
  --action-names "textract:AnalyzeExpense" `
  --profile my-dev


--For building for dev:
$env:CDK_DEFAULT_ACCOUNT = "154501673607"
$env:CDK_DEFAULT_REGION = "ap-southeast-2"
$env:AWS_PROFILE = "my-dev"
$env:SPA_HOSTING = "lambda"
npm run build

--For synthing for dev:
npm run synth -- -c stage=dev --profile my-dev


Note:
first do a deployment of API only to get the ape base url
API-only deploy (SPA_HOSTING=none)
(otherwise docker based hosting is failing for some reason)

then update .env.dev, do spa:build:dev and then use
SPA_USE_PREBUILT_DIST=1 and do
npm run deploy:dev again


$env:SPA_HOSTING = "lambda"
$env:SPA_USE_PREBUILT_DIST = "1"
npm run synth -- -c stage=dev --profile my-dev

(after synthing once and deploying, get the api base url then do update api base url in .env.dev (for example:)

VITE_API_BASE_URL=https://i6ppexbkw3.execute-api.ap-southeast-2.amazonaws.com

then do:

npm ci --prefix spa
npm run spa:build:dev
)

--then deploy:
npm run deploy:dev -- --profile my-dev --require-approval never
