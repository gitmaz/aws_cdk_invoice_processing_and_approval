# Node toolchain for this CDK app. Keep in sync with the recommended host Node.
FROM node:22-bookworm-slim

WORKDIR /app

# git: optional npm deps / CDK; ca-certificates: HTTPS registry access
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NPM_CONFIG_UPDATE_NOTIFIER=false

# CDK CLI + LocalStack wrapper (used by `deploy:local` / `destroy:local` on Windows without relying on bind-mounted `node_modules` / lockfile).
RUN npm install -g aws-cdk@2.1121.0 aws-cdk-local@3.0.4

# Mount the repo at /app when running. Interactive shell by default.
CMD ["bash", "-lc", "node -v && npm -v && exec bash"]
