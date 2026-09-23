import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { getMigrations } from "better-auth/db/migration";
import { createAuth } from "../lib/auth";
import { getDb, migrateApp } from "../lib/db";
import { AccessError, writeClub } from "../lib/repository";
import { emptySnapshot } from "../lib/validation";
import {
  deleteTeamDiscussion,
  deleteTeamDiscussionReply,
  listTeamDiscussions,
  postTeamDiscussion,
  postTeamDiscussionReply,
} from "../lib/team-discussions";

const dir = mkdtempSync(join(tmpdir(), "cocaptain-team-discussions-"));
process.env.DATABASE_PATH = join(dir, "test.sqlite");
process.env.BETTER_AUTH_SECRET = randomBytes(48).toString("base64url");
process.env.BETTER_AUTH_URL = "http://localhost:3000";
after(() => {
  getDb().close();
  rmSync(dir, { recursive: true, force: true });
});

test("team discussions: anyone with team access to start or reply, author or manager to delete", async (t) => {
  const auth = createAuth(true);
  await (await getMigrations(auth.options)).runMigrations();
  migrateApp();
  const db = getDb();
  const password = randomBytes(24).toString("base64url");
  const users: Record<string, string> = {};
  db.prepare("INSERT INTO clubs(id,name) VALUES('club','Club')").run();
  for (const role of ["club_admin", "read_only"]) {
    const user = (await auth.api.signUpEmail({ body: { email: `${role}@example.test`, name: role, password } })).user;
    users[role] = user.id;
    db.prepare("INSERT INTO app_accounts(user_id) VALUES(?)").run(user.id);
    db.prepare("INSERT INTO club_memberships VALUES(?,?,?)").run(user.id, "club", role);
  }
  const snapshot = emptySnapshot();
  snapshot.teams = [{ id: "team", name: "Ladies 1s" }];
  await writeClub(users.club_admin, "club", 0, snapshot);

  await t.test("a read-only member can see the empty board and start a discussion", async () => {
    assert.deepEqual(await listTeamDiscussions(users.read_only, "club", "team"), []);
    await postTeamDiscussion(users.read_only, "club", "team", "Read Only", "Training moved to Tuesday?");
    const [discussion] = await listTeamDiscussions(users.read_only, "club", "team");
    assert.equal(discussion.body, "Training moved to Tuesday?");
    assert.equal(discussion.authorName, "Read Only");
  });

  await t.test("both a manager and the read-only author can reply to the discussion", async () => {
    const [discussion] = await listTeamDiscussions(users.club_admin, "club", "team");
    await postTeamDiscussionReply(users.club_admin, "club", "team", discussion.id, "Admin", "Works for me!");
    await postTeamDiscussionReply(users.read_only, "club", "team", discussion.id, "Read Only", "Great, see you there.");
    const withReplies = await listTeamDiscussions(users.read_only, "club", "team");
    assert.deepEqual(
      withReplies[0].replies.map((r) => r.authorName),
      ["Admin", "Read Only"],
    );
  });

  await t.test("rejects a reply to a discussion from another team/club", async () => {
    const [discussion] = await listTeamDiscussions(users.club_admin, "club", "team");
    await assert.rejects(
      postTeamDiscussionReply(users.club_admin, "club", "other-team", discussion.id, "Admin", "Sneaky"),
      AccessError,
    );
  });

  await t.test("the reply's own author can delete it; another non-author non-manager cannot", async () => {
    const [discussion] = await listTeamDiscussions(users.club_admin, "club", "team");
    const [adminReply, readOnlyReply] = discussion.replies;
    // A third read-only user — neither the author nor a manager — may not delete either reply.
    const auth2 = createAuth(true);
    const otherPassword = randomBytes(24).toString("base64url");
    const other = (await auth2.api.signUpEmail({ body: { email: "other@example.test", name: "Other", password: otherPassword } })).user;
    db.prepare("INSERT INTO app_accounts(user_id) VALUES(?)").run(other.id);
    db.prepare("INSERT INTO club_memberships VALUES(?,?,?)").run(other.id, "club", "read_only");
    await assert.rejects(deleteTeamDiscussionReply(other.id, "club", "team", discussion.id, readOnlyReply.id), AccessError);
    // The read-only author can delete their own reply, even though they aren't a manager.
    await deleteTeamDiscussionReply(users.read_only, "club", "team", discussion.id, readOnlyReply.id);
    assert.deepEqual((await listTeamDiscussions(users.club_admin, "club", "team"))[0].replies, [adminReply]);
  });

  await t.test("a manager can delete the whole discussion, cascading its replies", async () => {
    const [discussion] = await listTeamDiscussions(users.club_admin, "club", "team");
    await postTeamDiscussionReply(users.read_only, "club", "team", discussion.id, "Read Only", "One more thing");
    await assert.rejects(deleteTeamDiscussion(users.read_only, "club", "team", discussion.id), AccessError);
    await deleteTeamDiscussion(users.club_admin, "club", "team", discussion.id);
    assert.deepEqual(await listTeamDiscussions(users.club_admin, "club", "team"), []);
    const remainingReplies = db.prepare("SELECT COUNT(*) AS n FROM team_discussion_replies").get() as { n: number };
    assert.equal(remainingReplies.n, 0);
  });
});
