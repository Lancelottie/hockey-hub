import { existsSync } from "node:fs";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL to the target PostgreSQL database.");
const { getMigrations } = await import("better-auth/db/migration");
const { getAuth } = await import("../lib/auth");
const { getPool, closePostgres } = await import("../lib/database");
const { postgresSchema } = await import("../lib/postgres-schema");
try {
  await (await getMigrations(getAuth().options)).runMigrations();
  await getPool().query(postgresSchema);
  console.log("PostgreSQL authentication and application tables are ready.");
} catch {
  console.error("PostgreSQL migration failed. Check database access and schema permissions.");
  process.exitCode = 1;
} finally { await closePostgres(); }
