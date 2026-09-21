import { ROLES, roleTeamName } from "../../lib/users";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { createAuth, getAuth } from "../../lib/auth";
import { getStore } from "../../lib/database";
import { readClub, writeClub, AccessError } from "../../lib/repository";
import { emptySnapshot } from "../../lib/validation";
import { GET, PUT } from "../../app/api/workspace/route";
import { GET as sourceGET, POST as sourcePOST } from "../../app/api/england-hockey/route";

export async function checkTeamAccess() {
  const db = getStore();
  const password = randomBytes(24).toString("base64url");
  const user = (await createAuth(true).api.signUpEmail({ body: {
    email: "vice@example.test", name: "2s Vice Captain", password,
  } })).user;
  await db.prepare("INSERT INTO app_accounts(user_id) VALUES(?)").run(user.id);
  await db.prepare("INSERT INTO clubs(id,name) VALUES('scoped','Scope test')").run();
  await db.prepare("INSERT INTO club_memberships VALUES(?,?,?)").run(user.id, "scoped", "club_admin");
  const initial = emptySnapshot();
  for (const id of ["first", "second", "third"]) {
    initial.teams.push({ id, name: id, formationPresets: [{ name: id, lines: [3,4,3] }] });
    initial.players.push({ id: `p-${id}`, teamId: id, name: id, number: 1, position: "Forward" });
    initial.matches.push({ id: `m-${id}`, teamId: id, opponent: id, date: "", isHome: true });
    initial.lineups[`m-${id}`] = { placements: [], subs: [] };
    const emptyTask = { done: false, answer: "" };
    initial.captainTasks[`m-${id}`] = { pushback: emptyTask, warmupStart: emptyTask, northernKit: emptyTask, oppositionKit: emptyTask, teas: { done: true, answer: id }, lifts: emptyTask, notable: emptyTask, keepersKit: emptyTask, firstAidKit: emptyTask, awayBalls: emptyTask, umpires: emptyTask, gmsUpdated: emptyTask };
    initial.reviews[`m-${id}`] = { ourScore: "", oppositionScore: "", goalscorers: "", assists: "", summary: id, womanOfTheMatchPlayerId: "", playerFeedback: { [`p-${id}`]: id } };
    initial.assessments[`p-${id}`] = { attending: true, fitness: 3, passingBall: 3, receivingBall: 3, defending: 3, attackingPlay: 3, transition: 3, attitudeCommitment: 3, teamworkCommunication: 3, lastSeasonTeam: "2s" };
  }
  await writeClub(user.id, "scoped", 0, initial);
  await db.prepare("UPDATE club_memberships SET role='manager' WHERE user_id=?").run(user.id);
  await db.prepare("INSERT INTO membership_team_access(user_id,club_id,role,team_ids) VALUES(?,?,?,?)").run(user.id, "scoped", "manager", '["second"]');
  const response = await getAuth().api.signInEmail({ body: { email: user.email, password }, asResponse: true });
  assert.equal(response.status, 200);
  const cookie = response.headers.get("set-cookie")!.split(";")[0];
  const url = "http://localhost:3000";
  const get = () => GET(new Request(`${url}/api/workspace?clubId=scoped`, { headers: { cookie } }));
  const visible = await (await get()).json();
  assert.deepEqual(visible.data.teams.map((t: { id: string }) => t.id), ["second"]);
  assert.deepEqual(visible.club.teamIds, ["second"]);
  assert.deepEqual(visible.data.players.map((p: { id: string }) => p.id), ["p-second"]);
  for (const key of ["lineups", "captainTasks", "reviews"]) assert.deepEqual(Object.keys(visible.data[key]), ["m-second"]);
  assert.deepEqual(Object.keys(visible.data.assessments), ["p-second"]);
  assert.equal(JSON.stringify(visible).includes("p-first"), false);
  const save = (data: unknown, revision = visible.revision) => PUT(new Request(`${url}/api/workspace`, {
    method: "PUT", headers: { cookie, origin: url, "content-type": "application/json" }, body: JSON.stringify({ clubId: "scoped", revision, data }),
  }));
  const injected = structuredClone(visible.data);
  injected.teams.push(initial.teams[0]);
  assert.equal((await save(injected)).status, 403);
  const collision = structuredClone(visible.data);
  collision.players.push({ ...initial.players[0], teamId: "second" });
  assert.equal((await save(collision)).status, 403);
  const fixtureCollision = structuredClone(visible.data);
  fixtureCollision.matches.push({ ...initial.matches[0], teamId: "second" });
  assert.equal((await save(fixtureCollision)).status, 403);
  const stolenDoc = structuredClone(visible.data);
  stolenDoc.reviews["m-first"] = initial.reviews["m-first"];
  assert.equal((await save(stolenDoc)).status, 400);
  assert.equal((await sourceGET(new Request(`${url}/api/england-hockey?clubId=scoped&teamId=first`, { headers: { cookie } }))).status, 403);
  assert.equal((await sourcePOST(new Request(`${url}/api/england-hockey`, { method: "POST", headers: { cookie, origin: url, "content-type": "application/json" }, body: JSON.stringify({ clubId: "scoped", teamId: "first", revision: visible.revision }) }))).status, 403);
  // England Hockey access is now restricted to the Northern Hockey Admin role; a scoped manager has none, even for their own team.
  assert.equal((await sourceGET(new Request(`${url}/api/england-hockey?clubId=scoped&teamId=second`, { headers: { cookie } }))).status, 403);
  const changed = structuredClone(visible.data);
  changed.players[0].name = "Edited by vice captain";
  changed.teams[0].formationPresets[0].name = "Vice preset";
  changed.reviews["m-second"].summary = "Vice notes";
  assert.equal((await save(changed)).status, 200);
  assert.equal((await save(changed)).status, 409);
  assert.deepEqual((await (await get()).json()).data, changed);
  // Remove the visible team's records; hidden teams and their documents must survive.
  const cleared = { ...emptySnapshot(), teams: changed.teams };
  assert.equal((await save(cleared, visible.revision + 1)).status, 200);
  await db.prepare("UPDATE membership_team_access SET team_ids='[]' WHERE user_id=?").run(user.id);
  assert.deepEqual((await readClub(user.id, "scoped")).data, emptySnapshot());
  await assert.rejects(writeClub(user.id, "scoped", visible.revision + 2, emptySnapshot()), AccessError);
  await db.prepare("UPDATE membership_team_access SET team_ids='[\"deleted-team\"]' WHERE user_id=?").run(user.id);
  assert.deepEqual((await readClub(user.id, "scoped")).data, emptySnapshot());
  await db.prepare("DELETE FROM membership_team_access WHERE user_id=?").run(user.id);
  const full = (await readClub(user.id, "scoped")).data;
  for (const id of ["first", "third"]) {
    assert.deepEqual(full.teams.find(t => t.id === id), initial.teams.find(t => t.id === id));
    assert.deepEqual(full.players.find(p => p.teamId === id), initial.players.find(p => p.teamId === id));
    assert.deepEqual(full.matches.find(m => m.teamId === id), initial.matches.find(m => m.teamId === id));
    for (const key of ["lineups", "captainTasks", "reviews"] as const) assert.deepEqual(full[key][`m-${id}`], initial[key][`m-${id}`]);
    assert.deepEqual(full.assessments[`p-${id}`], initial.assessments[`p-${id}`]);
  }
  // The scope row's role FK must already exist in club_memberships, so set the role first.
  await db.prepare("UPDATE club_memberships SET role='read_only' WHERE user_id=?").run(user.id);
  await db.prepare("INSERT INTO membership_team_access(user_id,club_id,role,team_ids) VALUES(?,?,?,?)").run(user.id, "scoped", "read_only", '["first"]');
  const readOnly = await readClub(user.id, "scoped");
  assert.equal(readOnly.data.teams.length, 1);
  assert.deepEqual(readOnly.data.reviews, {});
  assert.deepEqual(readOnly.data.assessments, {});
  await assert.rejects(writeClub(user.id, "scoped", readOnly.revision, readOnly.data), AccessError);
  for (const [id, name] of [["first", "Ladies 1s"], ["second", "Ladies 2s"], ["third", "Ladies 3s"]])
    await db.prepare("UPDATE teams SET name=? WHERE club_id='scoped' AND id=?").run(name, id);
  await db.prepare("DELETE FROM membership_team_access WHERE user_id=?").run(user.id);
  for (const role of ROLES.filter(role => roleTeamName(role))) {
    await db.prepare("UPDATE club_memberships SET role=? WHERE user_id=?").run(role, user.id);
    const teamName = roleTeamName(role);
    const expected = teamName === "Ladies 1s" ? "first" : teamName === "Ladies 2s" ? "second" : "third";
    const scoped = await readClub(user.id, "scoped");
    assert.deepEqual(scoped.club.teamIds, [expected]);
    assert.deepEqual(scoped.data.teams.map(t => t.name), [teamName]);
    assert.equal((await writeClub(user.id, "scoped", scoped.revision, scoped.data)), scoped.revision + 1);
    const wrongTeam = expected === "first" ? "third" : "first";
    assert.equal((await sourceGET(new Request(`${url}/api/england-hockey?clubId=scoped&teamId=${wrongTeam}`, { headers: { cookie } }))).status, 403);
    const changed = structuredClone(scoped.data);
    changed.teams[0].name = "Cannot rename the club team";
    await assert.rejects(writeClub(user.id, "scoped", scoped.revision + 1, changed), AccessError);
    // Even an incorrectly assigned explicit scope must not widen the named role.
    await db.prepare("INSERT INTO membership_team_access(user_id,club_id,role,team_ids) VALUES(?,?,?,?)").run(user.id, "scoped", role, JSON.stringify([wrongTeam]));
    assert.deepEqual((await readClub(user.id, "scoped")).data, emptySnapshot());
    await db.prepare("DELETE FROM membership_team_access WHERE user_id=?").run(user.id);
  }
  await db.prepare("UPDATE teams SET name='Renamed' WHERE club_id='scoped' AND id='third'").run();
  assert.deepEqual((await readClub(user.id, "scoped")).data, emptySnapshot());
  await db.prepare("UPDATE teams SET name='Ladies 3s' WHERE club_id='scoped' AND id IN ('first','third')").run();
  assert.deepEqual((await readClub(user.id, "scoped")).data, emptySnapshot());
}
