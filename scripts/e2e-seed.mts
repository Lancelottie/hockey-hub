import { rmSync } from "node:fs";
import { getMigrations } from "better-auth/db/migration";
import { createAuth } from "../lib/auth";
import { getDb, migrateApp } from "../lib/db";
import { writeClub } from "../lib/repository";
import { emptySnapshot } from "../lib/validation";
if (process.env.DATABASE_PATH !== ".test-data/e2e.sqlite")
  throw new Error("E2E seeding requires the isolated test database.");
for (const suffix of ["", "-wal", "-shm"])
  rmSync(process.env.DATABASE_PATH + suffix, { force: true });
const auth = createAuth(true);
await (await getMigrations(auth.options)).runMigrations();
migrateApp();
const user = await auth.api.signUpEmail({
  body: {
    email: "captain@example.test",
    name: "Test Captain",
    password: process.env.E2E_PASSWORD!,
  },
});
const db = getDb();
db.prepare("INSERT INTO app_accounts(user_id) VALUES(?)").run(user.user.id);
db.prepare(
  "INSERT INTO clubs(id,name) VALUES('test-club','Northbank Hockey Club')",
).run();
db.prepare("INSERT INTO club_memberships VALUES(?,?,?)").run(
  user.user.id,
  "test-club",
  "club_admin",
);
const data = emptySnapshot();
data.teams = [
  { id: "firsts", name: "Ladies 1s" },
  { id: "seconds", name: "Ladies 2s" },
];
data.players = [
  {
    id: "alex",
    teamId: "firsts",
    name: "Alex Morgan",
    number: 7,
    position: "Forward",
  },
  {
    id: "sam",
    teamId: "firsts",
    name: "Sam Taylor",
    number: 1,
    position: "Goalkeeper",
    goalkeeperKit: "yellow",
  },
  {
    id: "jo",
    teamId: "firsts",
    name: "Jo Ellis",
    number: 4,
    position: "Defender",
  },
  {
    id: "riley",
    teamId: "firsts",
    name: "Riley James",
    number: 8,
    position: "Midfielder",
  },
];
data.matches = [
  {
    id: "opening-match",
    teamId: "firsts",
    opponent: "Riverside HC",
    date: "2099-10-10T12:00",
    isHome: true,
  },
];
writeClub(user.user.id, "test-club", 0, data);
db.close();
