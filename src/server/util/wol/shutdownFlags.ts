import { v4 as uuidv4 } from "uuid";
import AppDataSource, { qualifiedTable } from "~/server/database/datasource";

/**
 * Upserts the target's single shutdown_flags row: fresh triggered_at,
 * consumed_at reset to null. Uses a raw INSERT ... ON CONFLICT rather than
 * TypeORM's .upsert() for full control over exactly which columns get
 * overwritten, and because the unique index on target_id makes this a
 * single atomic round-trip — safe even if "Shutdown" is double-clicked.
 */
export async function armShutdownFlag(
  targetId: string,
): Promise<{ triggeredAt: Date }> {
  const ds = await AppDataSource.getInstance();
  const [row] = await ds.query(
    `INSERT INTO ${qualifiedTable("shutdown_flags")}
       (id, target_id, triggered_at, consumed_at, creation_time, modified_time)
     VALUES ($1, $2, now(), NULL, now(), now())
     ON CONFLICT (target_id) DO UPDATE
       SET triggered_at = EXCLUDED.triggered_at,
           consumed_at = NULL,
           modified_time = EXCLUDED.modified_time
     RETURNING triggered_at;`,
    [uuidv4(), targetId],
  );
  return { triggeredAt: row.triggered_at };
}

/**
 * Atomically checks-and-consumes the target's shutdown flag: if there's an
 * unconsumed row with triggered_at within the last withinSeconds seconds,
 * marks it consumed and returns its triggeredAt. The UPDATE ... RETURNING is
 * itself atomic under Postgres's MVCC — no transaction or explicit lock
 * needed, and no read-then-write race between two concurrent callers.
 */
export async function consumeShutdownFlag(
  targetId: string,
  withinSeconds: number,
): Promise<{ shutdown: true; triggeredAt: Date } | { shutdown: false }> {
  const ds = await AppDataSource.getInstance();
  // TypeORM's raw query() wraps UPDATE/DELETE results as [rows, rowCount]
  // (unlike SELECT/INSERT, which return the rows array directly) — the
  // affected rows are rows[0], not the top-level result.
  const [rows] = await ds.query(
    `UPDATE ${qualifiedTable("shutdown_flags")}
       SET consumed_at = now(), modified_time = now()
     WHERE target_id = $1
       AND consumed_at IS NULL
       AND triggered_at > now() - ($2 * interval '1 second')
     RETURNING triggered_at;`,
    [targetId, withinSeconds],
  );
  if (rows.length === 0) return { shutdown: false };
  return { shutdown: true, triggeredAt: rows[0].triggered_at };
}
