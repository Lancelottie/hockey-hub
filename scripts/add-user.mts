import { createInterface } from "node:readline/promises";
import { randomUUID } from "node:crypto";
import { ROLES, type Role } from "../lib/users";
process.loadEnvFile(".env.local");
const { createAuth } = await import("../lib/auth");
const { getStore } = await import("../lib/database");
const prompt = createInterface({
  input: process.stdin,
  output: process.stdout,
});
const email = await prompt.question("Email: ");
const name = await prompt.question("Name: ");
const clubName = await prompt.question(
  "Club name (exact existing name to join): ",
);
const role = (await prompt.question(`Role (${ROLES.join(", ")}): `)) as Role;
const teamName = await prompt.question("Team name (exact existing name; leave blank for all teams): ");
if (teamName.trim() && ["administrator", "club_admin"].includes(role))
  throw new Error("Use manager, coach, player or read_only for team-only access.");
if (!ROLES.includes(role) || !clubName.trim() || !name.trim())
  throw new Error("Valid name, club and role required.");
// Let the terminal collect a hidden password. Never pass credentials as CLI arguments.
prompt.close();
const { spawnSync } = await import("node:child_process");
const password = spawnSync(
  "/bin/sh",
  [
    "-c",
    'stty -echo < /dev/tty; trap "stty echo < /dev/tty" EXIT; printf "Password (12+ characters): " > /dev/tty; IFS= read -r password < /dev/tty; printf "\\n" > /dev/tty; printf "%s" "$password"',
  ],
  { encoding: "utf8" },
);
if (password.status !== 0 || password.stdout.length < 12)
  throw new Error("A password of at least 12 characters is required.");
const auth = createAuth(true);
const db = getStore();
const existing = (await db
  .prepare("SELECT id FROM user WHERE email = ?")
  .get(email.trim().toLowerCase())) as { id: string } | undefined;
if (existing)
  throw new Error(
    "User exists. Use the documented membership SQL to grant access; password was not changed.",
  );
const scopedTeam = teamName.trim() ? (await db.prepare(
  "SELECT t.id,t.club_id FROM teams t JOIN clubs c ON c.id=t.club_id WHERE c.name=? AND t.name=?",
).all(clubName.trim(), teamName.trim())) as { id: string; club_id: string }[] : null;
if (scopedTeam && scopedTeam.length !== 1)
  throw new Error("Choose an unambiguous existing club and team name.");
const result = await auth.api.signUpEmail({
  body: { email: email.trim(), name: name.trim(), password: password.stdout },
});
(await db.transaction(async () => {
  let club = (await db
    .prepare("SELECT id FROM clubs WHERE name = ?")
    .get(clubName.trim())) as { id: string } | undefined;
  if (!club) {
    club = { id: randomUUID() };
    (await db.prepare("INSERT INTO clubs(id,name) VALUES(?,?)").run(
      club.id,
      clubName.trim(),
    ));
  }
  (await db.prepare("INSERT INTO app_accounts(user_id) VALUES(?)").run(result.user.id));
  (await db.prepare(
    "INSERT INTO club_memberships(user_id,club_id,role) VALUES(?,?,?)",
  ).run(result.user.id, club.id, role));
  if (scopedTeam) {
    if (scopedTeam[0].club_id !== club.id) throw new Error("Club and team do not match.");
    await db.prepare("INSERT INTO membership_team_access(user_id,club_id,team_ids) VALUES(?,?,?)")
      .run(result.user.id, club.id, JSON.stringify([scopedTeam[0].id]));
  }
})());
console.log(
  "Account provisioned. Sign in with the email and password you supplied.",
);
