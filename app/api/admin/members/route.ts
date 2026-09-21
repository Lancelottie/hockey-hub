import { z } from "zod";
import { getActiveSession } from "@/lib/session";
import { AccessError } from "@/lib/repository";
import { addMemberRole, listMembers, removeMemberRole } from "@/lib/members";
import { ROLES } from "@/lib/users";
export const runtime = "nodejs";
export const maxDuration = 60;
const id = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/);
const command = z.object({ clubId: id, userId: id, role: z.enum(ROLES), action: z.enum(["add", "remove"]) }).strict();
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
function failure(error: unknown) {
  if (error instanceof AccessError) return json({ error: error.message }, error.status);
  return json({ error: "Members could not be loaded or saved." }, 500);
}
export async function GET(request: Request) {
  try {
    const session = await getActiveSession(request.headers);
    if (!session) return json({ error: "Sign in to continue." }, 401);
    const parsed = id.safeParse(new URL(request.url).searchParams.get("clubId"));
    if (!parsed.success) return json({ error: "Choose a club." }, 400);
    return json({ members: (await listMembers(session.user.id, parsed.data)) });
  } catch (error) {
    return failure(error);
  }
}
export async function PATCH(request: Request) {
  try {
    if (
      request.headers.get("origin") !==
      new URL(process.env.BETTER_AUTH_URL!).origin
    )
      return json({ error: "Invalid request origin." }, 403);
    const session = await getActiveSession(request.headers);
    if (!session) return json({ error: "Sign in to continue." }, 401);
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      return json({ error: "JSON required." }, 415);
    const reader = request.body?.getReader();
    if (!reader) return json({ error: "Request body required." }, 400);
    let size = 0;
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 4096) {
        await reader.cancel();
        return json({ error: "Request is too large." }, 413);
      }
      chunks.push(value);
    }
    let raw: unknown;
    try {
      raw = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      return json({ error: "Invalid JSON." }, 400);
    }
    const parsed = command.safeParse(raw);
    if (!parsed.success) return json({ error: "Check the member and role." }, 400);
    const { clubId, userId, role, action } = parsed.data;
    if (action === "add") await addMemberRole(session.user.id, clubId, userId, role);
    else await removeMemberRole(session.user.id, clubId, userId, role);
    return json({ members: (await listMembers(session.user.id, clubId)) });
  } catch (error) {
    return failure(error);
  }
}
