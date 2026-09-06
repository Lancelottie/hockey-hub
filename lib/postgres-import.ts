import { createHash } from "node:crypto";
import type Database from "better-sqlite3";
import type { Pool } from "pg";

export const TRANSFER_TABLES = ["user", "account", "app_accounts", "clubs", "club_memberships", "teams", "team_formation_presets", "players", "fixtures", "fixture_documents", "assessments", "audit_events", "team_fixture_sources"] as const;
const orderedTables = new Set<string>(["teams", "players", "fixtures"]);
const quote = (name: string) => '"' + name.replaceAll('"', '""') + '"';
export type TransferResult = { alreadyImported: boolean; counts: Record<string, number>; digest: string };

/** Source is a consistent SQLite backup. Refuse nonempty destinations; never overwrite production. */
export async function importSqlite(source: Database.Database, target: Pool): Promise<TransferResult> {
  const rows = Object.fromEntries(TRANSFER_TABLES.map(table => [table, source.prepare(`SELECT ${orderedTables.has(table) ? "rowid, " : ""}* FROM ${quote(table)} ORDER BY rowid`).all() as Record<string, unknown>[]]));
  const digest = createHash("sha256").update(JSON.stringify(rows)).digest("hex");
  const counts = Object.fromEntries(TRANSFER_TABLES.map(table => [table, rows[table].length]));
  const client = await target.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(724961102)");
    const prior = await client.query("SELECT source_digest FROM data_migrations WHERE id='sqlite-initial'");
    if (prior.rows.length) {
      if (prior.rows[0].source_digest !== digest) throw new Error("The destination already contains a different import. No data was changed.");
      await client.query("ROLLBACK");
      return { alreadyImported: true, counts, digest };
    }
    // Lock tables to prevent app writes while checking and importing.
    await client.query(`LOCK TABLE ${TRANSFER_TABLES.map(quote).join(",")} IN ACCESS EXCLUSIVE MODE`);
    for (const table of TRANSFER_TABLES) {
      const result = await client.query(`SELECT count(*) AS n FROM ${quote(table)}`);
      if (Number(result.rows[0].n)) throw new Error("The destination is not empty. No data was changed.");
      const metadata = await client.query("SELECT column_name,data_type FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=$1", [table]);
      const types = new Map(metadata.rows.map(c => [c.column_name, c.data_type]));
      for (const row of rows[table]) {
        const columns = Object.keys(row);
        const values = columns.map(column => {
          const value = row[column];
          if (value === null) return null;
          const type = types.get(column);
          if (!type) throw new Error(`Destination column missing in ${table}.`);
          if (type === "boolean") return Boolean(value);
          if (String(type).startsWith("timestamp")) {
            const date = new Date(typeof value === "number" ? value : String(value));
            if (!Number.isFinite(date.getTime())) throw new Error(`Invalid timestamp in ${table}.`);
            return date;
          }
          return value;
        });
        const placeholders = columns.map((_, i) => `$${i + 1}`).join(",");
        const result = await client.query(`INSERT INTO ${quote(table)} (${columns.map(quote).join(",")}) VALUES (${placeholders}) RETURNING *`, values);
        // Check every returned field, including password hashes and JSON documents, without logging values.
        for (const [i, column] of columns.entries()) {
          const actual = result.rows[0][column];
          const expected = values[i];
          const normalized = actual instanceof Date ? actual.toISOString() : actual;
          const wanted = expected instanceof Date ? expected.toISOString() : expected;
          if (String(normalized) !== String(wanted)) throw new Error(`Row verification failed in ${table}.`);
        }
      }
      const copied = await client.query(`SELECT count(*) AS n FROM ${quote(table)}`);
      if (Number(copied.rows[0].n) !== counts[table]) throw new Error(`Count verification failed in ${table}.`);
    }
    for (const [table, column] of [["teams", "rowid"], ["players", "rowid"], ["fixtures", "rowid"], ["audit_events", "id"]]) {
      await client.query(`SELECT setval(pg_get_serial_sequence($1,$2), COALESCE((SELECT max(${quote(column)}) FROM ${quote(table)}),1), EXISTS(SELECT 1 FROM ${quote(table)}))`, [table, column]);
    }
    await client.query("INSERT INTO data_migrations(id,source_digest,counts) VALUES('sqlite-initial',$1,$2)", [digest, JSON.stringify(counts)]);
    await client.query("COMMIT");
    return { alreadyImported: false, counts, digest };
  } catch (error) { await client.query("ROLLBACK"); throw error; }
  finally { client.release(); }
}
