
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
