import { z } from "zod";
import { getActiveSession } from "@/lib/session";
import { AccessError } from "@/lib/repository";
import { listSectionRoster } from "@/lib/section-roster";
export const runtime = "nodejs";
export const maxDuration = 60;
const id = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/);
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
function failure(error: unknown) {
  if (error instanceof AccessError) return json({ error: error.message }, error.status);
  console.error("section_roster_request_failed");
  return json({ error: "The section roster could not be loaded." }, 500);
}
export async function GET(request: Request) {
  try {
    const session = await getActiveSession(request.headers);
    if (!session) return json({ error: "Sign in to continue." }, 401);
    const url = new URL(request.url);
    const clubId = id.safeParse(url.searchParams.get("clubId"));
    const teamId = id.safeParse(url.searchParams.get("teamId"));
    if (!clubId.success || !teamId.success) return json({ error: "Choose a club and team." }, 400);
    return json(await listSectionRoster(session.user.id, clubId.data, teamId.data));
  } catch (error) {
    return failure(error);
  }
}
