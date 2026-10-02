// Add only the facility workflow tables to an existing CoCaptain database.
import { existsSync } from "node:fs";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const { facilitySecuritySchema } = await import("../lib/facility-security-schema");
const { usesPostgres, getPool, closePostgres } = await import("../lib/database");
const { getDb } = await import("../lib/db");
try {
  if (usesPostgres()) await getPool().query(facilitySecuritySchema);
  else getDb().exec(facilitySecuritySchema);
  console.log("Facility security tables are ready; existing records are unchanged.");
} finally {
  if (usesPostgres()) await closePostgres();
  else getDb().close();
}
