import { existsSync } from "node:fs";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");
const [clubId, teamId, ...extra] = process.argv.slice(2);
if (!clubId || !teamId || extra.length) {
  console.error("Usage: npm run fixtures:sync -- <club-id> <team-id>");
  process.exitCode = 1;
} else {
  const { syncEnglandHockeyFixtures } =
    await import("../lib/england-hockey/sync");
  try {
    const result = await syncEnglandHockeyFixtures(teamId, {
      clubId,
      actor: { system: true },
    });
    console.log(
      `${result.checked} checked · ${result.added} added · ${result.updated} updated · ${result.unchanged} unchanged · ${result.skipped} byes skipped`,
    );
  } catch (error) {
    const { EnglandHockeyError } = await import("../lib/england-hockey/source");
    const { AccessError } = await import("../lib/repository");
    console.error(
      error instanceof EnglandHockeyError || error instanceof AccessError
        ? error.message
        : "Fixture sync failed. Check the application database and configuration.",
    );
    process.exitCode = 1;
  }
}
