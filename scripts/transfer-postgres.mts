import { existsSync, mkdirSync, chmodSync } from "node:fs";
import { resolve } from "node:path";
import Database from "better-sqlite3";
import { importSqlite } from "../lib/postgres-import";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL for the empty PostgreSQL destination.");
const sourcePath = resolve(process.env.DATABASE_PATH ?? "data/hockey-hub.sqlite");
if (!existsSync(sourcePath)) throw new Error("The source SQLite database does not exist.");
mkdirSync(".vercel/backups", { recursive: true, mode: 0o700 });
const backupPath = resolve(`.vercel/backups/pre-postgres-${Date.now()}.sqlite`);
const source = new Database(sourcePath, { readonly: true });
await source.backup(backupPath);
source.close();
chmodSync(backupPath, 0o600);
const backup = new Database(backupPath, { readonly: true });
const { getPool, closePostgres } = await import("../lib/database");
try {
  const result = await importSqlite(backup, getPool());
  console.log(result.alreadyImported ? "This source was already imported; nothing was overwritten." : "Transfer committed. Every copied field and table count was verified.");
  console.log(JSON.stringify(result.counts));
  console.log(`Local recovery backup: ${backupPath}`);
  console.log("Existing passwords are preserved. Sign in again; local sessions were not transferred.");
} catch (error) {
  // Driver errors can include row data and connection details. Only print known migration messages.
  const message = error instanceof Error ? error.message : "";
  console.error(/^(The destination|Destination column|Invalid timestamp|Row verification|Count verification)/.test(message) ? message : "Transfer failed and was rolled back. The source and recovery backup are unchanged.");
  process.exitCode = 1;
} finally { backup.close(); await closePostgres(); }
