# SAMONA API image.
#
# Two build targets are published from this one Dockerfile:
#
#   runtime  — the service. Production dependencies only, no compiler, no test
#              runner, runs as a non-root user.
#   migrate  — adds the Prisma CLI and the schema/migrations so a one-off ECS
#              task can run `prisma migrate deploy` against RDS.
#
# Keeping them apart is why the migrate target exists at all: prisma is a
# devDependency, so pruning dev dependencies from `runtime` would also remove the
# only supported way to apply a migration. Folding a devDependency into the
# production image instead would ship jest and tsc to every task start.
#
# glibc, not Alpine: the Prisma CLI and its engine downloads want OpenSSL, and
# musl builds need pinned openssl packages to make that work. The extra ~30MB
# costs nothing on Fargate, which prices CPU and memory rather than image size.

# --- base --------------------------------------------------------------------
# openssl is needed wherever the Prisma CLI runs: it fetches and verifies the
# query compiler, and warns loudly without it. The runtime stage deliberately
# does not use this base — it talks to Postgres through node-postgres and needs
# no Prisma binaries at all.
FROM node:22-bookworm-slim AS base
RUN apt-get update \
 && apt-get install -y --no-install-recommends openssl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

# --- rds CA bundle -----------------------------------------------------------
# RDS instances present certificates chained to the AWS RDS trust store, which
# Node's built-in CA list does not include. Without it the driver adapter's
# TLS verification fails ("self-signed certificate in certificate chain") even
# though `sslmode=require` is set. The truststore endpoint always serves the
# current bundle, so a rebuilt image re-points at whatever CA RDS is using now.
#
# Node is used instead of curl so no extra package is installed just to fetch
# one file. Fetching succeeds only if the host is reachable and the write is
# synchronous, so a failed download fails the build loudly rather than shipping
# a starved trust store.
FROM node:22-bookworm-slim AS rds-certs
ARG RDS_CA_BUNDLE_URL=https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
RUN node -e 'const{writeFileSync}=require("node:fs");(async()=>{const r=await fetch(process.env.RDS_CA_BUNDLE_URL);if(!r.ok)throw new Error("fetch returned "+r.status);writeFileSync("/rds-ca-bundle.pem",await r.text())})().catch(e=>{console.error("failed to fetch RDS CA bundle:",e.message);process.exit(1)})' \
 && test -s /rds-ca-bundle.pem

# --- dependencies ------------------------------------------------------------
# Manifests alone, so this layer is reused until a dependency actually changes.
#
# The install is scoped to the server's workspaces. The root package.json also
# declares apps/pro and apps/customer, and an unscoped `npm ci` would pull Expo
# and the whole React Native tree into an image that ships none of it.
#
# --ignore-scripts alone is not enough here. Each workspace package declares
# `"prepare": "npm run build"` and npm runs it during `npm ci` regardless of
# that flag, so the package sources and tsconfigs are copied in below and the
# prepare hooks build the packages for real. The server's own sources are still
# copied later, so editing application code does not invalidate this layer.
FROM base AS deps
WORKDIR /app
ENV npm_config_update_notifier=false
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/types packages/types
COPY packages/config packages/config
COPY packages/validation packages/validation
COPY server/package.json server/
# prisma/ is needed before `npm ci`, because the server declares
# "postinstall": "prisma generate" and that hook runs during the install.
# Regenerating in the build stage below keeps the final client authoritative.
COPY server/prisma server/prisma
RUN npm ci \
      --workspace=@samona/types \
      --workspace=@samona/config \
      --workspace=@samona/validation \
      --workspace=@samona/server \
      --include-workspace-root

# --- build -------------------------------------------------------------------
FROM deps AS build
WORKDIR /app
COPY server server
# Order matters: generate before compiling, never after.
#
# `tsc` compiles src/generated/prisma/*.ts into dist/generated/prisma, so the
# client has to exist first. Compiling first and regenerating afterwards leaves
# dist holding whatever was generated in the deps stage, which is how a stale
# client shipped once and failed at boot with a bare MODULE_NOT_FOUND on
# ./internal/class — an error that points at Prisma rather than at the build
# order that caused it.
#
# rm -rf dist so no incremental state can carry across stages, and the require()
# at the end is the real assertion: the emitted client is loaded with plain Node
# here, so an image that would crash on startup fails at build time instead.
RUN rm -rf server/dist \
 && npm run prisma:generate --workspace @samona/server \
 && npm run build --workspace @samona/server \
 && node -e "require('./server/dist/generated/prisma/client.js'); console.log('generated Prisma client loads')"

# --- production dependencies -------------------------------------------------
# A clean install, not a prune of the build output. Pruning cannot shrink the
# image: `FROM build` would inherit every layer of the full dev install, and a
# later deletion only adds a whiteout while the bytes stay in the earlier
# layers. That is the difference between a 400MB image and a 1.4GB one.
#
# It cannot be a plain `npm ci --omit=dev` either, for the same reason `deps`
# copies sources: npm runs a workspace's `prepare` during the install even under
# --ignore-scripts, and that hook needs typescript — which --omit=dev is in the
# act of removing. The hooks are stripped for this install only. The compiled
# packages come from the build stage, so nothing is built here.
FROM base AS prod-deps
WORKDIR /app
ENV npm_config_update_notifier=false
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/types packages/types
COPY packages/config packages/config
COPY packages/validation packages/validation
COPY server/package.json server/
RUN node -e 'const fs=require("fs");for(const p of ["packages/types","packages/config","packages/validation","server"]){const f=p+"/package.json";const j=JSON.parse(fs.readFileSync(f,"utf8"));j.scripts=Object.fromEntries(Object.entries(j.scripts||{}).filter(([k])=>k!=="prepare"&&k!=="postinstall"));fs.writeFileSync(f,JSON.stringify(j,null,2)+"\n");}' \
 && npm ci --omit=dev \
      --workspace=@samona/types \
      --workspace=@samona/config \
      --workspace=@samona/validation \
      --workspace=@samona/server \
      --include-workspace-root \
 && mkdir -p server/node_modules packages/types/node_modules packages/config/node_modules packages/validation/node_modules

# --- runtime -----------------------------------------------------------------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app
# tini reaps zombies and forwards SIGTERM, which is what makes ECS's stop signal
# actually reach Node instead of waiting out the 30s kill timeout.
#
# The user is created before anything is copied in, and ownership is set with
# COPY --chown rather than a later `chown -R`. A recursive chown after the copies
# would copy every file up into a fresh overlay layer and duplicate the whole
# 400MB of node_modules for no benefit.
RUN apt-get update \
 && apt-get install -y --no-install-recommends tini \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --system --uid 10001 --create-home --home-dir /home/samona samona
ENV NODE_ENV=production \
    PORT=4000 \
    HOME=/home/samona \
    NODE_EXTRA_CA_CERTS=/etc/ssl/certs/rds-ca-bundle.pem
COPY --chown=samona:samona --from=rds-certs /rds-ca-bundle.pem /etc/ssl/certs/rds-ca-bundle.pem
COPY --chown=samona:samona --from=prod-deps /app/node_modules ./node_modules
# npm does not hoist everything: jose is an ESM-only package and the lockfile
# pins it to server/node_modules. Node resolves from the requiring file upward,
# so /app/server/dist/auth/token.js needs it there, not at the root.
COPY --chown=samona:samona --from=prod-deps /app/server/node_modules ./server/node_modules
COPY --chown=samona:samona --from=prod-deps /app/packages/types/node_modules ./packages/types/node_modules
COPY --chown=samona:samona --from=prod-deps /app/packages/config/node_modules ./packages/config/node_modules
COPY --chown=samona:samona --from=prod-deps /app/packages/validation/node_modules ./packages/validation/node_modules
COPY --chown=samona:samona --from=build /app/packages/types/dist ./packages/types/dist
COPY --chown=samona:samona --from=build /app/packages/config/dist ./packages/config/dist
COPY --chown=samona:samona --from=build /app/packages/validation/dist ./packages/validation/dist
# node_modules/@samona/* are symlinks into ../packages/*, so the package
# directories must exist with their manifests for Node to resolve them.
COPY --chown=samona:samona packages/types/package.json ./packages/types/
COPY --chown=samona:samona packages/config/package.json ./packages/config/
COPY --chown=samona:samona packages/validation/package.json ./packages/validation/
COPY --chown=samona:samona --from=build /app/server/dist ./server/dist
COPY --chown=samona:samona --from=build /app/server/src/generated ./server/src/generated
COPY --chown=samona:samona --from=build /app/server/prisma ./server/prisma
COPY --chown=samona:samona server/package.json ./server/
COPY --chown=samona:samona server/docker-entrypoint.mjs ./server/
USER samona
EXPOSE 4000
# Unauthenticated and reveals nothing about versions or dependencies, so it is
# safe to expose to the load balancer.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
ENTRYPOINT ["/usr/bin/tini", "--"]
# The entrypoint assembles DATABASE_URL and REDIS_URL from the task's environment
# and injected secrets, then imports the server in-process — so SIGTERM still
# reaches Node directly and no second process sits between tini and the app.
CMD ["node", "server/docker-entrypoint.mjs"]

# --- migrate -----------------------------------------------------------------
# The same application code, plus the Prisma CLI and everything needed to apply
# migrations. It boots the shared entrypoint in migrate mode, so DATABASE_URL is
# assembled from DB_SECRET exactly the way the runtime does it — one composition
# path, one set of migration history to keep in sync. The entrypoint runs Prisma
# with cwd /app/server, where prisma.config.ts and prisma/ live.
FROM build AS migrate
WORKDIR /app
ENV NODE_ENV=production \
    SAMONA_START=migrate \
    NODE_EXTRA_CA_CERTS=/etc/ssl/certs/rds-ca-bundle.pem
COPY --from=rds-certs /rds-ca-bundle.pem /etc/ssl/certs/rds-ca-bundle.pem
COPY server/prisma.config.ts ./server/
# No tini here: migrate is a one-off task, not a process supervisor, and this
# image is not built on the runtime stage.
CMD ["node", "server/docker-entrypoint.mjs"]