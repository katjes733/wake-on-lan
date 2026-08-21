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

Unlike `tesla-powerwall-automation`, this app has no per-site/per-tenant concept, so there is no equivalent of the `$site` variable to add after import — every query scopes itself with the `{container_name="wake-on-lan"}` stream selector alone, which is already sufficient.

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
| **System Health**   | Error Rate by Service, Database Errors, All Logs, Error Logs      | Mirrors the `tesla-powerwall-automation` "Error Rate by Service" panel pattern; Database Errors specifically surfaces `service="db"` |

---

## Notes

- **Datasource name:** all queries reference the datasource by name `loki`, same as `tesla-powerwall-automation` — same physical Loki instance on the NAS. If yours has a different name, update it after import in Dashboard settings → Data sources.
- **Timezone:** defaults to `America/Phoenix`, matching the sibling dashboard's deployment location. Change in Dashboard settings → Time options.
- **No site/tenant variable.** `wake-on-lan` only extracts `service` as a Loki label (see `deploy.yml`'s `LOKI_PIPELINE`); there is no `siteName`-equivalent field, so — unlike `tesla-powerwall-automation` — no manual variable needs to be added after import.
- **Magic Packet Send Outcome** assumes `WOL_SEND_METHOD=auto` (or explicit `dgram`/`wakeonlan`) is set so the `method` field is populated on every `"Magic packet sent"` line; see `src/server/util/wol/sendMagicPacket.ts`.

> **Renaming a `msg` or field breaks a panel silently.** Every query above matches an exact `msg` string or field name emitted by the app (e.g. `"Wake requested"`, `targetName`, `result`). Grafana does not validate LogQL against the app's source at import time — if a `msg` string or field name is renamed in the app (e.g. during a refactor of `src/server/routes/targets.ts`), the matching panel will quietly start returning **No data** instead of erroring. Update this dashboard's queries in the **same PR** as any log message or field rename.
