import { AsyncLocalStorage } from "node:async_hooks";
import { Pool, type PoolClient } from "pg";
import { getDb } from "./db";

let pool: Pool | undefined;
export function usesPostgres() { return Boolean(process.env.DATABASE_URL); }
export function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required for PostgreSQL.");
    pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 3, idleTimeoutMillis: 10000, connectionTimeoutMillis: 15000, allowExitOnIdle: true });
    // Do not log connection configuration or credentials from driver errors.
    pool.on("error", () => console.error("postgres_idle_connection_error"));
  }
  return pool;
}
export function authDatabase() {
  if (process.env.VERCEL && !usesPostgres()) throw new Error("Configure DATABASE_URL before deploying to Vercel.");
  return usesPostgres() ? getPool() : getDb();
}
const context = new AsyncLocalStorage<PoolClient | "sqlite">();
let sqliteQueue: Promise<unknown> = Promise.resolve();
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const next = sqliteQueue.then(fn, fn);
  sqliteQueue = next.catch(() => {});
  return next;
}
function pgSql(sql: string) {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`).replace(/\b(FROM|INTO|REFERENCES) user\b/g, '$1 "user"');
}
async function query(sql: string, values: unknown[], mode: "all" | "get" | "run") {
  if (usesPostgres()) {
    const active = context.getStore();
    const result = await (active && active !== "sqlite" ? active : getPool()).query(pgSql(sql), values);
    return mode === "all" ? result.rows : mode === "get" ? result.rows[0] : { changes: result.rowCount };
  }
  const run = async () => {
    const statement = getDb().prepare(sql);
    return mode === "all" ? statement.all(...values) : mode === "get" ? statement.get(...values) : statement.run(...values);
  };
  return context.getStore() === "sqlite" ? run() : serialize(run);
}
async function transaction<T>(fn: () => Promise<T>, repeatable = false): Promise<T> {
  if (context.getStore()) return fn();
  if (usesPostgres()) {
    const client = await getPool().connect();
    try {
      await client.query(repeatable ? "BEGIN ISOLATION LEVEL REPEATABLE READ" : "BEGIN");
      const value = await context.run(client, fn);
      await client.query("COMMIT");
      return value;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }
  return serialize(async () => {
    const db = getDb();
    db.exec("BEGIN IMMEDIATE");
    try {
      const value = await context.run("sqlite", fn);
      db.exec("COMMIT");
      return value;
    } catch (error) { db.exec("ROLLBACK"); throw error; }
  });
}
export function getStore() {
  return {
    prepare(sql: string) {
      return {
        all: (...values: unknown[]) => query(sql, values, "all"),
        get: (...values: unknown[]) => query(sql, values, "get"),
        run: (...values: unknown[]) => query(sql, values, "run"),
      };
    },
    async insertRows(table: string, columns: string[], rows: unknown[][]) {
      if (![table, ...columns].every(name => /^[a-z_]+$/.test(name))) throw new Error("Invalid insert identifier.");
      for (let start = 0; start < rows.length; start += 100) {
        const batch = rows.slice(start, start + 100);
        const placeholders = batch.map(() => `(${columns.map(() => "?").join(",")})`).join(",");
        await query(`INSERT INTO ${table} (${columns.join(",")}) VALUES ${placeholders}`, batch.flat(), "run");
      }
    },
    transaction<T>(fn: () => Promise<T>) {
      const run = () => transaction(fn, true);
      run.immediate = () => transaction(fn);
      return run;
    },
  };
}
export async function lockClub(clubId: string) {
  if (usesPostgres()) {
    const client = context.getStore();
    if (!client || client === "sqlite") throw new Error("Club writes require a transaction.");
    await client.query("SELECT id FROM clubs WHERE id=$1 FOR UPDATE", [clubId]);
  }
}
export async function closePostgres() { if (pool) { await pool.end(); pool = undefined; } }
