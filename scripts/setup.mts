import { existsSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
if (!existsSync(".env.local")) {
  writeFileSync(
    ".env.local",
    `BETTER_AUTH_SECRET=${randomBytes(48).toString("base64url")}\nBETTER_AUTH_URL=http://localhost:3000\nDATABASE_PATH=./data/hockey-hub.sqlite\n`,
    { mode: 0o600 },
  );
}
process.loadEnvFile(".env.local");
const { getAuth } = await import("../lib/auth");
const { migrateApp } = await import("../lib/db");
const { getMigrations } = await import("better-auth/db/migration");
await (await getMigrations(getAuth().options)).runMigrations();
if (process.env.DATABASE_URL) {
  const { getPool, closePostgres } = await import("../lib/database");
  const { postgresSchema } = await import("../lib/postgres-schema");
  await getPool().query(postgresSchema);
  await closePostgres();
} else migrateApp();
console.log(
  "Database ready. Run npm run user:add to provision an account. No default account was created.",
);
