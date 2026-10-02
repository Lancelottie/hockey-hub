import { bookingSchema } from "@/lib/facility-security-model";
import { z } from "zod";
import { AccessError, requireClub } from "@/lib/repository";
import { canAdmin } from "@/lib/users";
import { createFacilityBooking, facilityMembers, facilitySettings, listFacilityBookings, saveFacilitySettings, submitFacilityCheck } from "@/lib/facility-security";
export const runtime = "nodejs";
export const maxDuration = 60;
import { json, failure, sessionUser } from "@/lib/facility-security-http";
const id = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
export async function GET(request: Request) {
  try {
    const user = await sessionUser(request);
    const clubId = id.parse(new URL(request.url).searchParams.get("clubId"));
    const club = await requireClub(user.id, clubId);
    const admin = canAdmin(club.role);
    return json({ bookings: await listFacilityBookings(user.id, clubId), members: admin ? (await facilityMembers(user.id, clubId)).filter(member => member.id === user.id) : [], checklists: admin ? await facilitySettings(clubId) : null, admin });
  } catch (error) { return failure(error); }
}
async function readBody(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new AccessError(415, "JSON required.");
  const reader = request.body?.getReader();
  if (!reader) throw new AccessError(400, "Request body required.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 3000000) { await reader.cancel(); throw new AccessError(413, "Photos are too large. Choose smaller images and retry."); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
  catch { throw new AccessError(400, "Invalid request body."); }
}
export async function POST(request: Request) {
  try {
    if (request.headers.get("origin") !== new URL(process.env.BETTER_AUTH_URL!).origin) throw new AccessError(403, "Invalid request origin.");
    const user = await sessionUser(request);
    const body = z.object({ clubId: id, action: z.enum(["booking", "check", "settings"]), bookingId: id.optional(), data: z.unknown() }).strict().parse(await readBody(request));
    if (body.action === "booking") {
      const booking = bookingSchema.parse(body.data);
      if (booking.responsibleId !== user.id) throw new AccessError(400, "Only your account can be assigned during the Facilities Management preview.");
      return json({ booking: await createFacilityBooking(user.id, body.clubId, booking) }, 201);
    }
    if (body.action === "settings") { await saveFacilitySettings(user.id, body.clubId, body.data); return json({ saved: true }); }
    if (!body.bookingId) throw new AccessError(400, "Choose a booking.");
    return json({ check: await submitFacilityCheck(user.id, body.clubId, body.bookingId, body.data) }, 201);
  } catch (error) { return failure(error); }
}
