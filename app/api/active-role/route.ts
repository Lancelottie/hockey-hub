import { z } from "zod";
import { getActiveSession } from "@/lib/session";
import { AccessError } from "@/lib/repository";
import { switchActiveRole } from "@/lib/active-role";
import { ROLES } from "@/lib/users";
export const runtime = "nodejs";
export const maxDuration = 60;
const id = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/);
const command = z.object({ clubId: id, role: z.enum(ROLES) }).strict();
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
function failure(error: unknown) {
  if (error instanceof AccessError) return json({ error: error.message }, error.status);
  return json({ error: "Unable to switch role." }, 500);
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
      if (size > 512) {
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
    if (!parsed.success) return json({ error: "Check the club and role." }, 400);
    const { clubId, role } = parsed.data;
    await switchActiveRole(session.user.id, clubId, role);
    return json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
