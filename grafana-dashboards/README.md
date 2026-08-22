# Grafana Dashboard — Wake-on-LAN

- [Grafana Dashboard — Wake-on-LAN](#grafana-dashboard--wake-on-lan)
  - [Prerequisites](#prerequisites)
  - [Import](#import)
  - [Panel-to-field mapping](#panel-to-field-mapping)
  - [Panel overview](#panel-overview)
  - [Notes](#notes)

---

## Prerequisites

Before importing, the app must already be deployed with structured JSON (Pino) logging and the Loki Docker logging driver configured. `.github/workflows/deploy.yml` runs the container with `--name wake-on-lan` and a `LOKI_PIPELINE` that extracts `service` as a native Loki stream label:

```yaml
LOKI_PIPELINE='- json:
    expressions:
      service: service
- labels:
    service:'
```

Unlike `tesla-powerwall-automation`, this app has no per-site/per-tenant concept, so there is no equivalent of the `$site` variable to add after import.

**Two different stream selectors are in play**, not just one:

- Every panel under **Wakes**, **Magic Packet**, **Consume Outcomes**, **Shutdown**, and **System Health** scopes itself with `{container_name="wake-on-lan"}` — these come from the containerized server's own Docker logs, shipped via the Loki logging driver above.
- Every panel under **Agent** scopes itself with `{service="agent"}` instead, **no `container_name` at all** — the Windows agent isn't a Docker container; it pushes its own logs directly to Loki's HTTP push API (`src/agent/log.ts`), setting `service` and `target_id` as real Loki labels on the push itself, not extracted via a pipeline. If a panel under Agent shows "No data" while everything else works, check that assumption first — it's a different ingestion path entirely, not just a different filter.

---

## Import

1. Open Grafana → **Dashboards** → **Import**
2. Click **Upload dashboard JSON file** and select `wake-on-lan.json`
3. Confirm the Loki datasource is mapped to the same instance used by `tesla-powerwall-automation` (queries reference it by name, `loki`)
4. Click **Import**

The dashboard loads with all panels present, including **Rate Limit Hits** — `middleware/rateLimiter.ts` logs `"Rate limit exceeded"` via a custom `handler` on both limiters.

---

## Panel-to-field mapping

| Panel                     | `msg` filter(s)                                     | Fields used                                     | Loki service label |
| -------------------------- | ---------------------------------------------------- | ------------------------------------------------ | ------------------- |
| Wakes Triggered Over Time  | `"Wake requested"`, `"Wake flag armed"`              | `targetName` (requested), `targetId` (armed)     | `api`, `wol`        |
| Magic Packet Send Outcome  | `"Magic packet sent"`, `"Magic packet send failed"`  | `method` (`dgram` \| `wakeonlan`, sent-only)     | `wol`               |
| Magic Packet Failures      | `"Magic packet send failed"`                         | `targetId`, `mac`, `err`                         | `wol`               |
| Consume Outcomes Over Time | `"Wake flag consume checked"`                        | `targetId`, `result` (`woken` \| `not_woken`)    | `wol`               |
| Wakes Triggered (stat)     | `"Wake requested"`                                   | —                                                 | `api`               |
| Rate Limit Hits            | `"Rate limit exceeded"`                              | `route`, `ip`                                     | `api`                |
| Shutdown Triggered / Armed | `"Shutdown requested"`, `"Shutdown flag armed"`      | `targetName` (requested), `targetId` (armed)     | `api`, `wol`        |
| Shutdown Consume Outcomes  | `"Shutdown flag consume checked"`                    | `targetId`, `result` (`shutdown` \| `not_shutdown`) | `wol`            |
| Shutdowns Triggered (stat) | `"Shutdown requested"`                               | —                                                 | `api`               |
| Agent Heartbeat Rate       | `"Agent heartbeat received"` (server), `"Heartbeat sent"` (agent) | `targetId` (server), `target_id` (agent, a Loki label) | `wol`, `agent` |
| Agent Errors               | *(none — filters on `service="agent"`+`level`)*, commonly `"Script execution failed"` | `script`, `err` | `agent`      |
| Error Rate by Service      | *(none — filters on `level`)*                        | `level`, `service`                               | any                 |
| Database Errors            | *(none — filters on `service`+`level`)*, commonly `"Database initialization failed"` | `err`             | `db`                |
| All Logs / Error Logs      | *(none)*                                             | all fields                                       | any                 |

---

## Panel overview

| Section            | Panels                                                          | Notes                                                                                                    |
| ------------------- | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| **Wakes**           | Wakes Triggered Over Time                                        | Two series per interval — `targetName` from `Wake requested` (api) and `targetId` from `Wake flag armed` (wol); both fire on every wake click, so they should track together |
| **Magic Packet**    | Magic Packet Send Outcome (donut), Magic Packet Failures (logs)  | Donut splits successful sends by `method`; failures have no `method` since the send never completed       |
| **Consume Outcomes** | Consume Outcomes Over Time, Wakes Triggered (stat), Rate Limit Hits (stat) | Consume panel groups by `targetId` **and** `result` together, one series per combination         |
| **Shutdown**        | Shutdown Triggered / Armed, Shutdown Consume Outcomes, Shutdowns Triggered (stat) | Mirrors the Wakes/Consume Outcomes sections exactly, one action later in the target's lifecycle. "Shutdown requested" only fires if `AgentConfig.shutdownEnabled` is true for that target — the route 400s (no log line) otherwise, so a target with shutdown disabled never appears here. |
| **Agent**           | Agent Heartbeat Rate, Agent Errors                                | The only section reading `{service="agent"}` instead of `{container_name="wake-on-lan"}` — see the stream-selector note in Prerequisites above. Heartbeat Rate overlays both the server's and the agent's own perspective on the same event; a gap between the two is itself diagnostic. |
| **System Health**   | Error Rate by Service, Database Errors, All Logs, Error Logs      | Mirrors the `tesla-powerwall-automation` "Error Rate by Service" panel pattern; Database Errors specifically surfaces `service="db"`. Scoped to the server's own container logs only — Agent Errors (above) is the equivalent panel for the agent's logs. |

---

## Notes

- **Datasource name:** all queries reference the datasource by name `loki`, same as `tesla-powerwall-automation` — same physical Loki instance on the NAS. If yours has a different name, update it after import in Dashboard settings → Data sources.
- **Timezone:** defaults to `America/Phoenix`, matching the sibling dashboard's deployment location. Change in Dashboard settings → Time options.
- **No site/tenant variable.** `wake-on-lan` only extracts `service` as a Loki label (see `deploy.yml`'s `LOKI_PIPELINE`); there is no `siteName`-equivalent field, so — unlike `tesla-powerwall-automation` — no manual variable needs to be added after import.
- **Magic Packet Send Outcome** assumes `WOL_SEND_METHOD=auto` (or explicit `dgram`/`wakeonlan`) is set so the `method` field is populated on every `"Magic packet sent"` line; see `src/server/util/wol/sendMagicPacket.ts`.
- **Agent panels need the agent's `AgentConfig.lokiPushUrl` set.** The Windows agent only pushes to Loki when that field is populated (see `src/shared/schemas/agentConfig.ts`) — it always logs locally regardless, but the Agent Heartbeat Rate / Agent Errors panels here will show "No data" for any target where it's left unset, even if that target's agent is running fine.

> **Renaming a `msg` or field breaks a panel silently.** Every query above matches an exact `msg` string or field name emitted by the app (e.g. `"Wake requested"`, `targetName`, `result`). Grafana does not validate LogQL against the app's source at import time — if a `msg` string or field name is renamed in the app (e.g. during a refactor of `src/server/routes/targets.ts`), the matching panel will quietly start returning **No data** instead of erroring. Update this dashboard's queries in the **same PR** as any log message or field rename.
