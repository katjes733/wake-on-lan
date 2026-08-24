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
  - [Status reporting and remote shutdown](#status-reporting-and-remote-shutdown)
    - [Installing the Windows agent](#installing-the-windows-agent)
    - [Zero-touch discovery](#zero-touch-discovery)
    - [Agent configuration](#agent-configuration)
    - [Security note on script references](#security-note-on-script-references)
  - [Deployment](#deployment)
    - [One-time setup](#one-time-setup)
    - [Day-to-day deploys](#day-to-day-deploys)
    - [Post-deploy verification](#post-deploy-verification)
    - [Reaching the app via a friendlier local hostname](#reaching-the-app-via-a-friendlier-local-hostname)
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
| `AGENT_STALE_THRESHOLD_SECONDS` | — | How long without a heartbeat before a target flips to "Offline" in the UI. Defaults to 90 — comfortably longer than the agent's own default 30s poll interval, so one missed tick doesn't flicker the status. |
| `DISCOVERY_ENABLED` | — | Set to `false` to turn off the agent-discovery UDP responder entirely. Defaults on. |
| `DISCOVERY_PORT` | — | UDP port the discovery responder listens on. Defaults to `41920` — change only if that conflicts with something else on your network (the agent would need the same value too, via its own `discoveryPort` config, to still find it). |

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

> **Note:** the section above documents the API contract itself, which is still accurate — but you no longer need to write that boot-time script yourself. A ready-made Windows agent (below) already implements it, plus live status reporting and remote shutdown.

## Status reporting and remote shutdown

A small background agent, installed once on a Windows target, reports whether it's currently online (shown as a chip on the Wake page) and lets you trigger a real shutdown from the same UI — the mirror image of waking it. It also absorbs the boot-time "was I just woken?" check from the section above, so you don't need a separate script for that anymore.

It runs as two separate pieces, not one, because of a real Windows constraint: a background service runs isolated from the interactive desktop (Windows' "Session 0" isolation), so it can never reliably do anything that needs the actual logged-in session — which is exactly what a CEC/display script might need. Splitting the responsibilities means neither piece has to compromise:

- **A Windows Service**, starting at boot, before anyone logs in — sends the heartbeat that drives the online/offline status, and polls for a pending shutdown. This is what makes "online" accurate even while the machine is still sitting at the lock screen.
- **A Scheduled Task, firing at logon** (any user, running with their own rights, not the service's) — the only piece with real desktop-session access, so it's the one that checks "was I just woken?" and runs whatever local script you've configured.

Both pieces talk to this app the same way the rest of it already works — pulling, never being pushed to: they poll for what to do, the server never opens a connection to the agent.

### Installing the Windows agent

1. **Create the target first** — in this app's Config page, add the machine you're about to install the agent on (name + MAC address is enough). The agent identifies itself to the server by its own MAC address, so this is the only setup step that has to happen before installing.
2. Download the installer — either build it yourself (`bun run build-agent`, then compile `installer/wake-on-lan-agent.iss` with [Inno Setup](https://jrsoftware.org/isinfo.php) on a Windows machine), or grab the latest build from the `Build Agent Installer` GitHub Actions workflow's artifacts.
3. Run the installer on the target machine. That's it — no configuration step, no server URL or ID to type in anywhere. It sets up both the service and the scheduled task, and the agent finds the server and identifies itself automatically the first time either one starts (see [Zero-touch discovery](#zero-touch-discovery) below).
4. Back in this app's Config page, open the target's **Agent Settings** (gear icon) and turn on whichever of "Allow remote shutdown" / "Detect Wake-on-LAN boots" you actually want — both start off by default.

### Zero-touch discovery

The agent needs exactly two things to talk to this app at all: the server's address, and which target row is *this* machine. Neither has to be typed in anywhere:

- **Finding the server**: the agent broadcasts a small UDP request on the LAN; this app listens for it and replies directly, so the agent learns the address it's actually reachable at (port `41920` by default — override with `DISCOVERY_PORT`/`DISCOVERY_ENABLED` env vars if that ever conflicts with something else on your network).
- **Identifying itself**: the same broadcast carries every local MAC address the agent can find, and the reply includes the matching target's ID if one of them is registered — the same MAC-uniqueness this app already relies on to reject duplicate targets.

Both results get written into a `config.json` next to the installed exe (a `config.example.json` template is also installed, purely as a reference for the fields below) — once either value is present in that file, it's treated as final and never re-discovered, so a manual override sticks permanently. To force a rediscovery (e.g. the server's address genuinely changed), just delete the relevant field — or the whole file — and restart the service.

If you'd rather skip discovery entirely (e.g. it doesn't reach across your particular network setup, or you want the agent to use a hostname with a real trusted certificate instead of the raw IP it would otherwise discover — see [Reaching the app via a friendlier local hostname](#reaching-the-app-via-a-friendlier-local-hostname)), just create `config.json` yourself with `serverBaseUrl` set; the agent then only needs to self-identify by MAC, skipping the broadcast step entirely. A raw-IP `serverBaseUrl` — discovered or manually set — always works without any certificate trust dance: the agent detects that case itself and skips certificate verification only for that specific connection.

### Agent configuration

Everything the agent needs beyond the three bootstrap values above (`serverBaseUrl`, `targetId`, poll interval/log path) lives in this app's own database, not on the machine — edited from the **Agent Settings** dialog in Config, fetched fresh by the agent on every check:

| Setting | Purpose |
| --- | --- |
| Allow remote shutdown | Whether the Shutdown button on the Wake page (and the agent's own polling for it) does anything for this target. Off by default. |
| Detect Wake-on-LAN boots | Whether the agent checks "was I just woken?" at all. Off by default. |
| Script to run on every boot | An optional local script reference, run once per logon regardless of how the machine booted. |
| Script to run when a WOL boot is detected | An optional local script reference, run only when the boot-detection check above says yes. |
| Script to run on a manual (non-WOL) boot | The counterpart to the row above — an optional local script reference, run only when the boot-detection check says this boot was *not* triggered by Wake. |
| Poll interval | Overrides the agent's own default heartbeat/shutdown-check interval. Leave blank unless you have a reason to change it. |

All three script references may point at a `.ps1`, a `.bat`/`.cmd`, or an `.exe` — the agent wraps `.ps1`/`.bat`/`.cmd` in the right interpreter (`powershell.exe`/`cmd.exe`) automatically, since Windows can't run those directly the way it runs an `.exe`.

A shutdown-side script isn't offered here — see [Reliable shutdown automation](#reliable-shutdown-automation) below for why, and what to use instead.

### Security note on script references

The three script fields above are stored in this app's database and edited through its (unauthenticated, LAN-trust) web UI — same trust model as the Wake button itself. They're never anything more than a path/reference: this app never sends script *content*, only a pointer to something that must already exist on the target machine. Anyone who can reach Config could redirect which existing local script gets run, but never inject new code that isn't already there.

### Reliable shutdown automation

There's deliberately no "script to run on shutdown" setting. A script triggered from the app's own Shutdown button could run reliably (nothing forces the agent to exit until it says so), but a script triggered by a regular OS shutdown/reboot can't be: the agent only gets a short, OS-controlled grace window to notify the server it's going offline (see [Status reporting and remote shutdown](#status-reporting-and-remote-shutdown) above) before Windows can forcibly kill it, which isn't enough time for anything beyond a near-instant script — e.g. a USB/CEC adapter command, which needs a multi-second hardware handshake before it can even send anything. Rather than offer a setting that silently doesn't work on a manual shutdown, use a Windows **Group Policy shutdown script** (`gpedit.msc` → Computer Configuration → Windows Settings → Scripts → Shutdown) — Windows explicitly waits for those to finish before powering off, which is exactly the guarantee this app can't make from inside a process the OS is actively trying to kill.

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

### Reaching the app via a friendlier local hostname

Typing an IP and port every time gets old. This app is also reachable on the LAN via a friendlier hostname, through the same shared Caddy instance `tesla-powerwall-automation` already uses — scoped to the local network only, with no public DNS record and no router changes involved. The actual hostname is intentionally left out of this public repo; see whoever manages the NAS for it.

See [docs/reverse-proxy-tls-setup.md](docs/reverse-proxy-tls-setup.md) for the full setup (Caddy site block, Pi-hole local DNS record, and the path to going fully public later) along with the gotchas specific to this app — most notably that `ALLOWED_ORIGINS` must include every hostname you serve the app under (see [Environment variables](#environment-variables) above), or the browser gets 500s on every asset/API call.

### Grafana dashboard

Import `grafana-dashboards/wake-on-lan.json` into Grafana (Dashboards → Import) — it reads from the same Loki instance the container's logs are already shipped to, so no extra wiring is needed beyond the import itself.
