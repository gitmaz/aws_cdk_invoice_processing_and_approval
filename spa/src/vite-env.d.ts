/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL: string;
  readonly VITE_COGNITO_USER_POOL_ID: string;
  readonly VITE_COGNITO_CLIENT_ID: string;
  readonly VITE_PRESIGN_LOCAL_SECRET: string;
  readonly VITE_APP_STAGE: string;
  readonly VITE_AWS_REGION: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
