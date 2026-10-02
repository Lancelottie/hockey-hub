import { GET, POST } from "../app/api/facility-security/route";
import { GET as PHOTO } from "../app/api/facility-security/evidence/route";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { getMigrations } from "better-auth/db/migration";
import { createAuth } from "../lib/auth";
import { getDb, migrateApp } from "../lib/db";
import { createFacilityBooking, facilityEvidence, getFacilityBooking, listFacilityBookings, saveFacilitySettings, submitFacilityCheck } from "../lib/facility-security";
import { securityStatus, securityExceptions, securityReminder, DEFAULT_CHECKLISTS, type CheckInput, type FacilityBooking, type SecurityCheck } from "../lib/facility-security-model";
const dir = mkdtempSync(join(tmpdir(), "cocaptain-facilities-"));
process.env.DATABASE_PATH = join(dir, "test.sqlite");
process.env.BETTER_AUTH_SECRET = randomBytes(48).toString("base64url");
process.env.BETTER_AUTH_URL = "http://localhost:3000";
process.env.FACILITIES_OWNER_EMAIL = "player@example.test";
after(() => { getDb().close(); rmSync(dir, { recursive: true, force: true }); });
const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jN1sAAAAASUVORK5CYII=";
function input(kind: "pre" | "post", length = DEFAULT_CHECKLISTS[kind].length): CheckInput {
  return { kind, responses: Array.from({ length }, () => "confirmed"), notes: "", issue: null, photos: [{ area: "facility", data: png }, { area: "pitch", data: png }] };
}
test("facility bookings enforce assignment, private evidence, complete atomic checks and immutable audit", async t => {
  const auth = createAuth(true); await (await getMigrations(auth.options)).runMigrations(); migrateApp(); migrateApp();
  const db = getDb();
  db.prepare("INSERT INTO clubs(id,name) VALUES('club','Club'),('other','Other')").run();
  db.prepare("INSERT INTO teams VALUES('club','team','Ladies 1s')").run();
  const users: Record<string, string> = {};
  const password = randomBytes(24).toString("base64url");
  for (const role of ["club_admin", "player", "manager", "outsider"]) {
    const user = (await auth.api.signUpEmail({ body: { email: `${role}@example.test`, name: role, password } })).user;
    users[role] = user.id; db.prepare("INSERT INTO app_accounts(user_id) VALUES(?)").run(user.id);
    db.prepare("INSERT INTO club_memberships VALUES(?,?,?)").run(user.id, role === "outsider" ? "other" : "club", role === "outsider" ? "club_admin" : role);
  }
  const now = Date.now();
  const bookingInput = { facility: "Main pitch", teamId: "team", responsibleId: users.player, startsAt: new Date(now - 30 * 60000).toISOString(), endsAt: new Date(now + 30 * 60000).toISOString() };
  const booking = await createFacilityBooking(users.club_admin, "club", bookingInput);
  await t.test("only administrators book; overlaps, invalid teams, nonmembers and times rejected", async () => {
    await assert.rejects(createFacilityBooking(users.player, "club", bookingInput));
    await assert.rejects(createFacilityBooking(users.club_admin, "club", bookingInput), /already has a booking/);
    await assert.rejects(createFacilityBooking(users.club_admin, "club", { ...bookingInput, teamId: "missing" }));
    await assert.rejects(createFacilityBooking(users.club_admin, "club", { ...bookingInput, responsibleId: users.outsider }));
    await assert.rejects(createFacilityBooking(users.club_admin, "club", { ...bookingInput, endsAt: bookingInput.startsAt }));
  });
  await t.test("only responsible member and club administrators see bookings", async () => {
    assert.equal((await listFacilityBookings(users.player, "club")).length, 1);
    assert.equal((await listFacilityBookings(users.club_admin, "club")).length, 1);
    assert.equal((await listFacilityBookings(users.manager, "club")).length, 0);
    await assert.rejects(getFacilityBooking(users.manager, "club", booking.id));
    await assert.rejects(getFacilityBooking(users.outsider, "club", booking.id));
    await assert.rejects(submitFacilityCheck(users.club_admin, "club", booking.id, input("pre")));
  });
  await t.test("checklists are versioned per booking", async () => {
    await assert.rejects(saveFacilitySettings(users.player, "club", { pre: ["New"], post: ["Locked"] }));
    await saveFacilitySettings(users.club_admin, "club", { pre: ["New"], post: ["Locked"] });
    assert.deepEqual((await getFacilityBooking(users.player, "club", booking.id)).checklists, DEFAULT_CHECKLISTS);
  });
  await t.test("validation rejects missing checklist, photos and issue details without saving partial records", async () => {
    await assert.rejects(submitFacilityCheck(users.player, "club", booking.id, { ...input("pre"), responses: ["confirmed"] }));
    await assert.rejects(submitFacilityCheck(users.player, "club", booking.id, { ...input("pre"), photos: [{ area: "facility", data: png }] }));
    await assert.rejects(submitFacilityCheck(users.player, "club", booking.id, { ...input("pre"), photos: [{ area: "facility", data: png }, { area: "facility", data: png }] }));
    await assert.rejects(submitFacilityCheck(users.player, "club", booking.id, { ...input("pre"), photos: [{ area: "facility", data: "data:image/png;base64,YWJjZGVmZ2hpamtsbW5v" }, { area: "pitch", data: png }] }));
    const issue = input("pre"); issue.responses[0] = "issue";
    await assert.rejects(submitFacilityCheck(users.player, "club", booking.id, issue));
    assert.equal((await getFacilityBooking(users.player, "club", booking.id)).checks.length, 0);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM facility_security_evidence").get() as {n:number}).n, 0);
  });
  const opening = input("pre"); opening.responses[0] = "issue"; opening.issue = { type: "Already unlocked", description: "Door open when I arrived" };
  const check = await submitFacilityCheck(users.player, "club", booking.id, opening);
  await t.test("issues allow completion; server supplies actor/time and protects photos", async () => {
    assert.equal(check.userId, users.player); assert.equal(check.userName, "player"); assert.ok(Date.parse(check.submittedAt) >= now);
    assert.equal(await facilityEvidence(users.player, "club", booking.id, check.photos[0].id), png);
    assert.equal(await facilityEvidence(users.club_admin, "club", booking.id, check.photos[0].id), png);
    await assert.rejects(facilityEvidence(users.manager, "club", booking.id, check.photos[0].id));
    await assert.rejects(facilityEvidence(users.outsider, "club", booking.id, check.photos[0].id));
    await assert.rejects(facilityEvidence(users.player, "other", booking.id, check.photos[0].id));
    await assert.rejects(submitFacilityCheck(users.player, "club", booking.id, opening), /already been submitted/);
    const b = await getFacilityBooking(users.player, "club", booking.id);
    assert.equal(securityStatus(b), "Session in Progress"); assert.ok(securityExceptions(b).includes("Security issue reported"));
  });
  await t.test("concurrent duplicate submissions create one closing record and photo set", async () => {
    const results = await Promise.allSettled([submitFacilityCheck(users.player, "club", booking.id, input("post")), submitFacilityCheck(users.player, "club", booking.id, input("post"))]);
    assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
    const b = await getFacilityBooking(users.player, "club", booking.id);
    assert.equal(b.checks.length, 2); assert.equal(securityStatus(b, now + 86400000), "Post-Check Complete");
    assert.equal(securityReminder(b, now + 86400000), null);
    assert.equal((db.prepare("SELECT COUNT(*) AS n FROM facility_security_evidence").get() as {n:number}).n, 4);
  });
  await t.test("missed opening remains in history even when lock-up is completed", async () => {
    const b = await createFacilityBooking(users.club_admin, "club", { ...bookingInput, facility: "Second pitch", startsAt: new Date(now - 7200000).toISOString(), endsAt: new Date(now - 3600000).toISOString() });
    assert.equal(securityStatus(b), "Lock-Up Outstanding");
    assert.equal(securityReminder(b)?.state, "outstanding");
    await submitFacilityCheck(users.player, "club", b.id, input("post", 1));
    const closed = await getFacilityBooking(users.player, "club", b.id);
    assert.equal(securityStatus(closed), "Post-Check Complete");
    assert.ok(securityExceptions(closed).includes("Missing pre-check"));
    assert.ok(securityExceptions(closed).includes("Late lock-up"));
    await assert.rejects(submitFacilityCheck(users.player, "club", b.id, input("pre", 1)), /already completed/);
    await assert.rejects(facilityEvidence(users.player, "club", b.id, check.photos[0].id));
  });
  await t.test("HTTP guards reject anonymous requests, CSRF, malformed bodies, oversize uploads and suspended accounts", async () => {
    const base = "http://localhost:3000/api/facility-security";
    assert.equal((await GET(new Request(`${base}?clubId=club`))).status, 401);
    assert.equal((await PHOTO(new Request(`${base}/evidence?clubId=club&bookingId=${booking.id}&id=${check.photos[0].id}`))).status, 401);
    const login = await auth.api.signInEmail({ body: { email: "player@example.test", password }, asResponse: true });
    const cookie = login.headers.get("set-cookie")!.split(";")[0];
    const adminLogin = await auth.api.signInEmail({ body: { email: "club_admin@example.test", password }, asResponse: true });
    const otherCookie = adminLogin.headers.get("set-cookie")!.split(";")[0];
    assert.equal((await GET(new Request(`${base}?clubId=club`, { headers: { cookie: otherCookie } }))).status, 403);
    assert.equal((await POST(new Request(base, { method: "POST", headers: { cookie: otherCookie, origin: "http://localhost:3000", "content-type": "application/json" }, body: JSON.stringify({ clubId: "club", action: "settings", data: DEFAULT_CHECKLISTS }) }))).status, 403);
    assert.equal((await PHOTO(new Request(`${base}/evidence?clubId=club&bookingId=${booking.id}&id=${check.photos[0].id}`, { headers: { cookie: otherCookie } }))).status, 403);

    const request = (body: string, origin = "http://localhost:3000") => new Request(base, { method: "POST", headers: { cookie, origin, "content-type": "application/json" }, body });
    assert.equal((await POST(request("{}", "https://evil.example"))).status, 403);
    assert.equal((await POST(request("{}"))).status, 400);
    assert.equal((await POST(request("{"))).status, 400);
    assert.equal((await POST(request("x".repeat(3000001)))).status, 413);
    assert.equal((await GET(new Request(`${base}?clubId=other`, { headers: { cookie } }))).status, 403);
    const photo = await PHOTO(new Request(`${base}/evidence?clubId=club&bookingId=${booking.id}&id=${check.photos[0].id}`, { headers: { cookie } }));
    assert.equal(photo.status, 200); assert.equal(photo.headers.get("cache-control"), "private, no-store");
    db.prepare("UPDATE app_accounts SET status='suspended' WHERE user_id=?").run(users.player);
    assert.equal((await GET(new Request(`${base}?clubId=club`, { headers: { cookie } }))).status, 401);
    db.prepare("UPDATE app_accounts SET status='active' WHERE user_id=?").run(users.player);
  });
  await t.test("future checks cannot be pre-filled", async () => {
    const b = await createFacilityBooking(users.club_admin, "club", { ...bookingInput, startsAt: new Date(now + 86400000).toISOString(), endsAt: new Date(now + 90000000).toISOString() });
    await assert.rejects(submitFacilityCheck(users.player, "club", b.id, input("pre", 1)), /one hour before/);
    assert.equal(securityStatus(b), "Not Started");
  });
});
test("time boundaries drive statuses and reminder keys without silently completing", () => {
  const start = Date.parse("2026-10-02T12:00:00Z"), end = start + 3600000;
  const b = { id: "booking", responsibleId: "member", startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString(), checks: [] } as unknown as FacilityBooking;
  assert.equal(securityReminder(b, start - 1800001), null);
  assert.equal(securityReminder(b, start - 1800000)?.state, "before-session");
  assert.equal(securityReminder(b, end)?.state, "session-end");
  assert.equal(securityReminder(b, end + 1800000)?.key, "booking:outstanding");
  assert.equal(securityStatus(b, end), "Lock-Up Outstanding");
  b.checks = [{ kind: "pre", submittedAt: new Date(start - 1000).toISOString() } as SecurityCheck];
  assert.equal(securityStatus(b, start - 1), "Pre-Check Complete");
  assert.equal(securityStatus(b, start), "Session in Progress");
  assert.equal(securityStatus(b, end), "Lock-Up Outstanding");
});
