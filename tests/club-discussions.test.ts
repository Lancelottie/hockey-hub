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
  deleteClubDiscussion,
  deleteClubDiscussionReply,
  listClubDiscussions,
  postClubDiscussion,
  postClubDiscussionReply,
  toggleDiscussionReaction,
  toggleReplyReaction,
} from "../lib/club-discussions";

const dir = mkdtempSync(join(tmpdir(), "cocaptain-club-discussions-"));
process.env.DATABASE_PATH = join(dir, "test.sqlite");
process.env.BETTER_AUTH_SECRET = randomBytes(48).toString("base64url");
process.env.BETTER_AUTH_URL = "http://localhost:3000";
after(() => {
  getDb().close();
  rmSync(dir, { recursive: true, force: true });
});

test("club discussions: club-wide regardless of team/section, author or manager to delete", async (t) => {
  const auth = createAuth(true);
  await (await getMigrations(auth.options)).runMigrations();
  migrateApp();
  const db = getDb();
  const password = randomBytes(24).toString("base64url");
  const users: Record<string, string> = {};
  db.prepare("INSERT INTO clubs(id,name) VALUES('club','Club')").run();
  db.prepare("INSERT INTO teams VALUES('club','ladies1','Ladies 1s'),('club','mens1','Mens 1s')").run();
  for (const role of ["club_admin", "ladies_1s_captain", "read_only"]) {
    const user = (await auth.api.signUpEmail({ body: { email: `${role}@example.test`, name: role, password } })).user;
    users[role] = user.id;
    db.prepare("INSERT INTO app_accounts(user_id) VALUES(?)").run(user.id);
    db.prepare("INSERT INTO club_memberships VALUES(?,?,?)").run(user.id, "club", role);
  }
  // Scope the captain to Ladies 1s only, to prove they can still post/read/reply on Mens/Juniors.
  db.prepare("INSERT INTO membership_team_access(user_id,club_id,role,team_ids) VALUES(?,?,?,?)").run(users.ladies_1s_captain, "club", "ladies_1s_captain", '["ladies1"]');

  await t.test("a captain scoped only to Ladies 1s can start a Mens discussion; anyone can read it", async () => {
    assert.deepEqual(await listClubDiscussions(users.ladies_1s_captain, "club"), []);
    await postClubDiscussion(users.ladies_1s_captain, "club", "mens", "Ladies Captain", "Can Mens 1s share our minibus on Saturday?");
    const [discussion] = await listClubDiscussions(users.read_only, "club");
    assert.equal(discussion.section, "mens");
    assert.equal(discussion.authorName, "Ladies Captain");
  });

  await t.test("a read-only member (no manage access, any team) can reply", async () => {
    const [discussion] = await listClubDiscussions(users.club_admin, "club");
    await postClubDiscussionReply(users.read_only, "club", discussion.id, "Read Only", "Works for us!");
    const withReply = (await listClubDiscussions(users.club_admin, "club"))[0];
    assert.equal(withReply.replies.length, 1);
    assert.equal(withReply.replies[0].authorName, "Read Only");
  });

  await t.test("anyone can react to a discussion or a reply; counts total, toggling removes it", async () => {
    const [discussion] = await listClubDiscussions(users.club_admin, "club");
    const [reply] = discussion.replies;
    assert.deepEqual(discussion.reactions, []);
    assert.deepEqual(reply.reactions, []);

    await toggleDiscussionReaction(users.read_only, "club", discussion.id, "celebrate");
    await toggleDiscussionReaction(users.club_admin, "club", discussion.id, "celebrate");
    await toggleDiscussionReaction(users.club_admin, "club", discussion.id, "hockey_stick");
    await toggleReplyReaction(users.club_admin, "club", discussion.id, reply.id, "thumbs_up");

    const withReactions = (await listClubDiscussions(users.ladies_1s_captain, "club"))[0];
    assert.deepEqual(
      withReactions.reactions.sort((a, b) => a.emoji.localeCompare(b.emoji)),
      [
        { emoji: "celebrate", count: 2, reactedByMe: false },
        { emoji: "hockey_stick", count: 1, reactedByMe: false },
      ],
    );
    assert.deepEqual(withReactions.replies[0].reactions, [{ emoji: "thumbs_up", count: 1, reactedByMe: false }]);

    // The caller's own reaction is flagged; toggling the same emoji again removes it.
    const asAdmin = (await listClubDiscussions(users.club_admin, "club"))[0];
    assert.deepEqual(
      asAdmin.reactions.find((r) => r.emoji === "celebrate"),
      { emoji: "celebrate", count: 2, reactedByMe: true },
    );
    await toggleDiscussionReaction(users.club_admin, "club", discussion.id, "celebrate");
    const afterUntoggle = (await listClubDiscussions(users.club_admin, "club"))[0];
    assert.deepEqual(afterUntoggle.reactions.find((r) => r.emoji === "celebrate"), { emoji: "celebrate", count: 1, reactedByMe: false });
  });

  await t.test("rejects a reaction to a discussion that doesn't exist", async () => {
    await assert.rejects(
      toggleDiscussionReaction(users.club_admin, "club", "missing-id", "thumbs_up"),
      AccessError,
    );
  });

  await t.test("rejects a reply to a discussion that doesn't exist", async () => {
    await assert.rejects(
      postClubDiscussionReply(users.club_admin, "club", "missing-id", "Admin", "Sneaky"),
      AccessError,
    );
  });

  await t.test("the reply's own author can delete it; another non-author non-manager cannot", async () => {
    const [discussion] = await listClubDiscussions(users.club_admin, "club");
    const [reply] = discussion.replies;
    // A second read-only user — neither the author nor manage-capable — may not delete it.
    const other = (await auth.api.signUpEmail({ body: { email: "other@example.test", name: "Other", password } })).user;
    db.prepare("INSERT INTO app_accounts(user_id) VALUES(?)").run(other.id);
    db.prepare("INSERT INTO club_memberships VALUES(?,?,?)").run(other.id, "club", "read_only");
    await assert.rejects(deleteClubDiscussionReply(other.id, "club", discussion.id, reply.id), AccessError);
    // The read-only author can delete their own reply, even though they aren't manage-capable.
    await deleteClubDiscussionReply(users.read_only, "club", discussion.id, reply.id);
    assert.deepEqual((await listClubDiscussions(users.club_admin, "club"))[0].replies, []);
  });

  await t.test("a manage-capable role (even scoped to a different team) can delete the whole discussion", async () => {
    const [discussion] = await listClubDiscussions(users.club_admin, "club");
    await assert.rejects(deleteClubDiscussion(users.read_only, "club", discussion.id), AccessError);
    await deleteClubDiscussion(users.ladies_1s_captain, "club", discussion.id);
    assert.deepEqual(await listClubDiscussions(users.club_admin, "club"), []);
  });

  await t.test("a snapshot write (writeClub) doesn't touch club discussions — separate table", async () => {
    const snapshot = emptySnapshot();
    snapshot.teams = [{ id: "ladies1", name: "Ladies 1s" }, { id: "mens1", name: "Mens 1s" }];
    await writeClub(users.club_admin, "club", 0, snapshot);
    assert.deepEqual(await listClubDiscussions(users.club_admin, "club"), []);
  });
});
