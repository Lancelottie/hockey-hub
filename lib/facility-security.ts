import { randomUUID } from "node:crypto";
import { getStore, lockClub } from "./database";
import { AccessError, requireClub } from "./repository";
import { canAdmin } from "./users";
import { bookingSchema, checklistSchema, checkSchema, DEFAULT_CHECKLISTS, type FacilityBooking, type SecurityCheck, type Checklists } from "./facility-security-model";

async function requireAdmin(userId: string, clubId: string) {
  const club = await requireClub(userId, clubId);
  if (!canAdmin(club.role)) throw new AccessError(403, "Club administrator access required.");
}
export async function facilitySettings(clubId: string): Promise<Checklists> {
  const row = await getStore().prepare("SELECT data FROM facility_security_settings WHERE club_id=?").get(clubId) as { data: string } | undefined;
  return row ? JSON.parse(row.data) : structuredClone(DEFAULT_CHECKLISTS);
}
export async function saveFacilitySettings(userId: string, clubId: string, input: unknown) {
  await requireAdmin(userId, clubId);
  const data = checklistSchema.parse(input);
  await getStore().prepare("INSERT INTO facility_security_settings(club_id,data) VALUES(?,?) ON CONFLICT(club_id) DO UPDATE SET data=excluded.data").run(clubId, JSON.stringify(data));
}
export async function facilityMembers(userId: string, clubId: string) {
  await requireAdmin(userId, clubId);
  return await getStore().prepare(`SELECT DISTINCT u.id,u.name FROM user u JOIN club_memberships m ON m.user_id=u.id JOIN app_accounts a ON a.user_id=u.id WHERE m.club_id=? AND a.status='active' ORDER BY u.name`).all(clubId) as { id: string; name: string }[];
}
export async function createFacilityBooking(userId: string, clubId: string, input: unknown) {
  const data = bookingSchema.parse(input);
  return getStore().transaction(async () => {
    await lockClub(clubId);
    await requireAdmin(userId, clubId);
    const responsible = (await facilityMembers(userId, clubId)).find(m => m.id === data.responsibleId);
    if (!responsible) throw new AccessError(400, "Choose an active member of this club.");
    const team = await getStore().prepare("SELECT name FROM teams WHERE club_id=? AND id=?").get(clubId, data.teamId) as { name: string } | undefined;
    if (!team) throw new AccessError(400, "Choose a team in this club.");
    const existing = await getStore().prepare("SELECT data FROM facility_bookings WHERE club_id=? AND starts_at<? AND ends_at>?").all(clubId, data.endsAt, data.startsAt) as { data: string }[];
    if (existing.some(r => (JSON.parse(r.data) as FacilityBooking).facility.toLowerCase() === data.facility.toLowerCase())) throw new AccessError(409, "This facility already has a booking at that time.");
    const booking: FacilityBooking = { ...data, id: randomUUID(), clubId, teamName: team.name, responsibleName: responsible.name, createdBy: userId, createdAt: new Date().toISOString(), checklists: await facilitySettings(clubId), checks: [] };
    await getStore().prepare("INSERT INTO facility_bookings(id,club_id,responsible_id,starts_at,ends_at,data) VALUES(?,?,?,?,?,?)").run(booking.id, clubId, data.responsibleId, data.startsAt, data.endsAt, JSON.stringify(booking));
    return booking;
  }).immediate();
}
export async function getFacilityBooking(userId: string, clubId: string, id: string) {
  const club = await requireClub(userId, clubId);
  const row = await getStore().prepare("SELECT data FROM facility_bookings WHERE id=? AND club_id=?").get(id, clubId) as { data: string } | undefined;
  if (!row) throw new AccessError(404, "Booking not found.");
  const booking = JSON.parse(row.data) as FacilityBooking;
  if (booking.responsibleId !== userId && !canAdmin(club.role)) throw new AccessError(403, "This booking is private to its responsible member and club administrators.");
  const checks = await getStore().prepare("SELECT data FROM facility_security_checks WHERE booking_id=? ORDER BY kind").all(id) as { data: string }[];
  booking.checks = checks.map(c => JSON.parse(c.data));
  return booking;
}
export async function listFacilityBookings(userId: string, clubId: string) {
  const club = await requireClub(userId, clubId);
  const rows = await getStore().prepare(`SELECT data FROM facility_bookings WHERE club_id=?${canAdmin(club.role) ? "" : " AND responsible_id=?"} ORDER BY starts_at DESC`).all(...(canAdmin(club.role) ? [clubId] : [clubId, userId])) as { data: string }[];
  // Query checks through the same authorization scope; never load photos in a listing.
  const checks = await getStore().prepare(`SELECT c.booking_id,c.data FROM facility_security_checks c JOIN facility_bookings b ON b.id=c.booking_id WHERE b.club_id=?${canAdmin(club.role) ? "" : " AND b.responsible_id=?"}`).all(...(canAdmin(club.role) ? [clubId] : [clubId, userId])) as { booking_id: string; data: string }[];
  return rows.map(r => { const b = JSON.parse(r.data) as FacilityBooking; b.checks = checks.filter(c => c.booking_id === b.id).map(c => JSON.parse(c.data)); return b; });
}
function validatePhoto(data: string) {
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(data);
  if (!match) throw new AccessError(400, "Photos must be JPEG, PNG or WebP images.");
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > 700000 || bytes.length < 12) throw new AccessError(400, "Each photo must be smaller than 700 KB.");
  const valid = match[1] === "jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 : match[1] === "png" ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) : bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  if (!valid) throw new AccessError(400, "The photo format could not be verified. Choose another image.");
}
export async function submitFacilityCheck(userId: string, clubId: string, bookingId: string, input: unknown) {
  const data = checkSchema.parse(input);
  return getStore().transaction(async () => {
    await lockClub(clubId);
    const booking = await getFacilityBooking(userId, clubId, bookingId);
    if (booking.responsibleId !== userId) throw new AccessError(403, "Only the assigned responsible member can submit this check.");
    if (booking.checks.some(c => c.kind === data.kind)) throw new AccessError(409, "This check has already been submitted. Refresh to view the saved record.");
    if (booking.checks.some(c => c.kind === "post")) throw new AccessError(409, "This booking is already completed. Its audit record cannot be changed.");
    if (Date.now() < Date.parse(booking.startsAt) - 60 * 60000) throw new AccessError(400, "Opening checks are available from one hour before the session.");
    if (data.kind === "post" && Date.now() < Date.parse(booking.startsAt)) throw new AccessError(400, "Lock-up cannot be confirmed before the session starts.");
    if (data.responses.length !== booking.checklists[data.kind].length) throw new AccessError(400, "Respond to every checklist item.");
    if (data.responses.includes("issue") && !data.issue) throw new AccessError(400, "Describe the issue for any item you could not confirm.");
    const areas = data.photos.map(p => p.area);
    if (!areas.includes("facility") || !areas.includes("pitch") || new Set(areas).size !== areas.length) throw new AccessError(400, "Add one facility photo and one pitch photo; an issue photo is optional.");
    if (areas.includes("issue") && !data.issue) throw new AccessError(400, "Describe the issue linked to the supporting photo.");
    data.photos.forEach(p => validatePhoto(p.data));
    const user = await getStore().prepare("SELECT name FROM user WHERE id=?").get(userId) as { name: string };
    const check: SecurityCheck = { id: randomUUID(), kind: data.kind, userId, userName: user.name, submittedAt: new Date().toISOString(), responses: data.responses, notes: data.notes, issue: data.issue, photos: data.photos.map(p => ({ id: randomUUID(), area: p.area })) };
    await getStore().prepare("INSERT INTO facility_security_checks(id,booking_id,kind,data) VALUES(?,?,?,?)").run(check.id, bookingId, check.kind, JSON.stringify(check));
    for (const [index, photo] of data.photos.entries()) await getStore().prepare("INSERT INTO facility_security_evidence(id,check_id,data) VALUES(?,?,?)").run(check.photos[index].id, check.id, photo.data);
    return check;
  }).immediate();
}
export async function facilityEvidence(userId: string, clubId: string, bookingId: string, evidenceId: string) {
  const booking = await getFacilityBooking(userId, clubId, bookingId);
  if (!booking.checks.some(c => c.photos.some(p => p.id === evidenceId))) throw new AccessError(404, "Photo not found.");
  const row = await getStore().prepare("SELECT data FROM facility_security_evidence WHERE id=?").get(evidenceId) as { data: string } | undefined;
  if (!row) throw new AccessError(404, "Photo not found.");
  return row.data;
}
