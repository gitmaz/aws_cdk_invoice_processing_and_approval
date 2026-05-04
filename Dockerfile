# Node 20 toolchain for this CDK app (use when host is older Node, e.g. Windows with Node 18).
FROM node:20-bookworm-slim

WORKDIR /app

# git: optional npm deps / CDK; ca-certificates: HTTPS registry access
RUN apt-get update \
  && apt-get install -y --no-install-recommends git ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NPM_CONFIG_UPDATE_NOTIFIER=false

# Mount the repo at /app when running. Interactive shell by default.
CMD ["bash", "-lc", "node -v && npm -v && exec bash"]
