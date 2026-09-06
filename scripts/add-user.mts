import { createInterface } from "node:readline/promises";
import { randomUUID } from "node:crypto";
import { ROLES, type Role } from "../lib/users";
process.loadEnvFile(".env.local");
const { createAuth } = await import("../lib/auth");
const { getDb } = await import("../lib/db");
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
const db = getDb();
const existing = db
  .prepare("SELECT id FROM user WHERE email = ?")
  .get(email.trim().toLowerCase()) as { id: string } | undefined;
if (existing)
  throw new Error(
    "User exists. Use the documented membership SQL to grant access; password was not changed.",
  );
const result = await auth.api.signUpEmail({
  body: { email: email.trim(), name: name.trim(), password: password.stdout },
});
db.transaction(() => {
  let club = db
    .prepare("SELECT id FROM clubs WHERE name = ?")
    .get(clubName.trim()) as { id: string } | undefined;
  if (!club) {
    club = { id: randomUUID() };
    db.prepare("INSERT INTO clubs(id,name) VALUES(?,?)").run(
      club.id,
      clubName.trim(),
    );
  }
  db.prepare("INSERT INTO app_accounts(user_id) VALUES(?)").run(result.user.id);
  db.prepare(
    "INSERT INTO club_memberships(user_id,club_id,role) VALUES(?,?,?)",
  ).run(result.user.id, club.id, role);
})();
console.log(
  "Account provisioned. Sign in with the email and password you supplied.",
);
