# wake-on-lan

- [wake-on-lan](#wake-on-lan)
  - [Overview](#overview)
  - [Quick Setup](#quick-setup)
    - [Prerequisites](#prerequisites)
    - [Running the app (local mode)](#running-the-app-local-mode)
    - [Running the app (remote mode)](#running-the-app-remote-mode)
  - [Environment variables](#environment-variables)
  - [HTTPS / Self-Signed Certificate](#https--self-signed-certificate)
  - [API contract for the boot-time consumer](#api-contract-for-the-boot-time-consumer)
  - [Known limitation](#known-limitation)
  - [Deployment](#deployment)
    - [One-time setup](#one-time-setup)
    - [Day-to-day deploys](#day-to-day-deploys)
    - [Post-deploy verification](#post-deploy-verification)
    - [Grafana dashboard](#grafana-dashboard)

## Overview

This is a small web app for waking devices on your home network with [Wake-on-LAN](https://en.wikipedia.org/wiki/Wake-on-LAN) (WOL) — the standard where a device's network card, even while the device itself is fully powered off, listens for a special "magic packet" and powers the machine on when it arrives. You register a device by its name and MAC address, and click a button to wake it from anywhere on your LAN.

There's one extra piece beyond that basic idea: this app also remembers, briefly, "I just told this device to wake up." A script running on the target machine can ask, right after it boots, "was that you?" — and get a reliable yes or no. That matters for setups where a device needs to behave differently depending on *how* it was turned on. The motivating case here: an HTPC behind a CEC-capable receiver should stay silent (no TV/receiver power-on) when it's woken remotely over WOL, but should power the TV on as usual when someone presses its physical power button. Windows has no built-in way to tell those two cases apart on its own — so this app tells it, out of band. That "was I just woken by this app?" check is the API contract section below is really about.

Built with Bun, Express, TypeORM + PostgreSQL on the backend; React 19, Vite, and Material-UI on the frontend.

## Quick Setup

### Prerequisites

- [Bun](https://bun.sh/) — runtime and package manager
- Docker and Docker Compose — only needed for **local mode** below (a throwaway local database)

### Running the app (local mode)

Use this when you don't have access to the home LAN — it spins up its own throwaway database and cache locally, so it works from anywhere.

1. Clone the repository and install dependencies:

   ```sh
   bun install
   ```

2. Copy the local-mode environment template:

   ```sh
   cp env/sample.env .env
   ```

3. Generate a local TLS certificate for the database connection (one time):

   ```sh
   bun run generate-certs
   ```

4. Start the local database and cache:

   ```sh
   bun run docker:up
   ```

5. Start the app:

   ```sh
   bun run dev
   ```

6. Open `http://localhost:5173` in your browser. You should see the Wake page (empty until you add a target from the Targets menu).

### Running the app (remote mode)

Use this instead when you're on the same home network as the NAS — it connects straight to the real shared database and cache, so there's no local container to manage.

1. Steps 1 from above (`bun install`).
2. Copy the remote-mode template instead:

   ```sh
   cp env/sample.remote.env .env
   ```

3. Fill in the real connection details in `.env` (ask whoever manages the NAS for these — they're intentionally left blank in the template) and copy the matching TLS certificate into `postgres/certs/` in this project (not referenced from another project's folder).
4. Start the app — no `docker:up` step needed this time:

   ```sh
   bun run dev
   ```

> **Note:** whichever mode you pick, `.env` itself is gitignored and never committed — it's local to your machine only.

## Environment variables

The full list is in `env/sample.env` / `env/sample.remote.env`. The essentials:

| Variable | Required | Description |
| --- | --- | --- |
| `DB_HOST` / `DB_PORT` / `DB_USERNAME` / `DB_PASSWORD` | ✅ | PostgreSQL connection |
| `DB_NAME` | ✅ | Always `postgres` — see the templates for why |
| `DB_SCHEMA` | ✅ | Always `wake_on_lan` |
| `DB_SSL` / `DB_SSL_CA_PATH` | ✅ | Database connection encryption — required in both dev modes |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` | ✅ | Used only to throttle repeated requests, nothing else |
| `ALLOWED_ORIGINS` | — | Which browser origins are allowed to call the API (default covers local dev) |
| `SSL_ENABLED` | — | Set to `true` to run the server over HTTPS instead of plain HTTP — see [HTTPS / Self-Signed Certificate](#https--self-signed-certificate) below |
| `SSL_KEY_PATH` / `SSL_CERT_PATH` | — | Paths to the TLS private key/certificate, relative to the project root. Required if `SSL_ENABLED=true` |
| `WOL_DEFAULT_BROADCAST_ADDRESS` | — | Fallback broadcast address used when a target doesn't have one set |
| `WOL_SEND_METHOD` | — | Leave as `auto` unless debugging — picks the best way to send the magic packet automatically |

## HTTPS / Self-Signed Certificate

Running the server over HTTPS encrypts everything between the browser (or the HTPC's boot-time script) and this app — worth turning on for anything beyond a quick local test.

1. Generate a self-signed certificate (one time — valid for 10 years, matching the same long-lived convention this project already uses for its local Postgres TLS cert; there's no external CA policy forcing a shorter validity on a self-signed cert, so there's little reason to make yourself regenerate and redeploy it annually):

   ```sh
   mkdir -p ssl
   openssl req -x509 -newkey rsa:4096 -keyout ssl/key.pem -out ssl/cert.pem \
     -days 3650 -nodes \
     -subj "/CN=localhost" \
     -addext "subjectAltName=IP:127.0.0.1,DNS:localhost"
   ```

   > **Note:** the `ssl/` directory is gitignored — never commit private keys.

2. Set in `.env`:

   ```dotenv
   SSL_ENABLED=true
   SSL_KEY_PATH=ssl/key.pem
   SSL_CERT_PATH=ssl/cert.pem
   ```

3. Restart the app. Since the certificate is self-signed, your browser will show a security warning the first time you visit — click through it (e.g. "Advanced" → "Proceed" in Chrome/Edge, "Advanced" → "Accept the Risk and Continue" in Firefox). This is expected and only needs doing once per browser.

## API contract for the boot-time consumer

This section is for whoever writes the script that runs *on* the target machine right after it boots (that script itself lives outside this repository — it's specific to the target device, e.g. a Windows Task Scheduler script on an HTPC).

**Endpoint**: `POST /api/v1/targets/:id/wol-flag/consume`

**Request body**:

```json
{ "withinSeconds": 120 }
```

`withinSeconds` is how far back to look for a wake that hasn't been checked yet — pick a value comfortably larger than how long the machine takes to boot and reach the point where it can make this call (2 minutes is a reasonable starting point).

**Response, if this device was woken by this app within that window**:

```json
{ "woken": true, "triggeredAt": "2026-08-20T12:34:56.000Z" }
```

**Response otherwise** (never woken, woken too long ago, or already asked-and-answered once):

```json
{ "woken": false }
```

Key behavior to design your script around: **each wake can only ever produce one `woken: true` answer.** The moment a device asks and gets `true`, that's recorded as used up — asking again immediately after gets `false`, even a second later. So call this once per boot, act on the answer, and don't expect a second call to still say `true`. You also don't need to retry-and-wait for the answer to "become" true — by the time the magic packet even reaches the device's network card, the app has already recorded the wake, so the answer is ready before the device has even finished booting. The only reason to retry at all is if the device's own network isn't ready yet when it first tries to call this — that's a timing issue on the device's side, unrelated to whether the wake actually happened.

## Known limitation

If the `woken: true` response above is lost in transit — say, the device's network drops right as it receives the answer — a retry will incorrectly see `woken: false`, because the app already marked that wake as used up on its end. This is a known, accepted gap for now (fixing it would mean adding a way for a retry to say "I mean the same attempt as last time," which adds real complexity for a home-network app where this kind of network hiccup is rare). If it turns out to matter in practice, that's worth revisiting.

## Deployment

### One-time setup

1. **Allocate a static LAN IP** for the container — this app is deployed on the same `tesla-macvlan` Docker network as `tesla-powerwall-automation`, at a dedicated address (`192.168.2.110`) so it's reachable directly on the LAN like any other device.
2. **Set the GitHub Secrets** the deploy workflow needs: `DB_HOST`, `DB_PORT`, `DB_USERNAME`, `DB_PASSWORD`, `DB_NAME`, `DB_SCHEMA`, `REDIS_HOST`, `REDIS_PORT`, `REDIS_PASSWORD`, `ALLOWED_ORIGINS`, `WOL_DEFAULT_BROADCAST_ADDRESS`, `WOL_SEND_METHOD` — `DB_HOST`/`DB_PORT`/`DB_USERNAME`/`DB_PASSWORD`/`REDIS_*` mirror the secret set `tesla-powerwall-automation` already has configured, since both apps talk to the same underlying database and cache; `DB_NAME` should be `postgres` and `DB_SCHEMA` should be `wake_on_lan` (see [Environment variables](#environment-variables)); `WOL_DEFAULT_BROADCAST_ADDRESS` is your LAN's broadcast address (e.g. `192.168.2.255`) and `WOL_SEND_METHOD` should normally be `auto`. Once HTTPS is enabled in production (see below), `ALLOWED_ORIGINS` should use `https://` instead of `http://`.
3. **Generate a production TLS certificate** and place it where the deploy workflow expects it — mounted from the NAS host into the container at `/app/ssl` (see [HTTPS / Self-Signed Certificate](#https--self-signed-certificate) for how to generate one; the same steps apply, just run on the NAS rather than your dev machine).
4. **Nothing to run for the database schema** — the app creates its own `wake_on_lan` schema and tables automatically the first time it starts, via `synchronize()`. There's no separate migration step to run.

### Day-to-day deploys

Deployment is automatic: merging to `main` triggers `.github/workflows/deploy.yml`, which builds a new image, pushes it to the local Docker registry, and replaces the running container — no one runs a deploy command by hand. The equivalent manual command, useful for local debugging or a one-off redeploy, is:

```sh
docker run -d --name wake-on-lan --network tesla-macvlan --ip 192.168.2.110 \
  -v /share/Container/container-data/postgres-certs:/app/db-certs:ro \
  -v /share/Container/container-data/wake-on-lan/certs:/app/ssl:ro \
  -e NODE_ENV=production -e PORT=3001 \
  -e DB_HOST=<host> -e DB_PORT=<port> -e DB_USERNAME=<user> -e DB_PASSWORD=<password> \
  -e DB_NAME=postgres -e DB_SCHEMA=wake_on_lan -e DB_SSL=true -e DB_SSL_CA_PATH=/app/db-certs/ca.crt \
  -e REDIS_HOST=<host> -e REDIS_PORT=<port> -e REDIS_PASSWORD=<password> \
  -e ALLOWED_ORIGINS=<origins> \
  -e SSL_ENABLED=true -e SSL_KEY_PATH=ssl/key.pem -e SSL_CERT_PATH=ssl/cert.pem \
  -e WOL_DEFAULT_BROADCAST_ADDRESS=192.168.2.255 -e WOL_SEND_METHOD=auto \
  192.168.2.106:5000/wake-on-lan:latest
```

### Post-deploy verification

1. Confirm the container is healthy: `curl -k https://192.168.2.110:3001/api/v1/health/status-server` and `.../status-db` should both return `{"status":"ok", ...}` (`-k` skips the self-signed certificate check — expected for `curl`, but your browser will need the one-time click-through described in [HTTPS / Self-Signed Certificate](#https--self-signed-certificate)).
2. Run through the real wake→consume flow once against a real device to confirm the deployed container (not just your local dev setup) can actually send a magic packet and record/consume the flag correctly.

### Grafana dashboard

Import `grafana-dashboards/wake-on-lan.json` into Grafana (Dashboards → Import) — it reads from the same Loki instance the container's logs are already shipped to, so no extra wiring is needed beyond the import itself.
