import { z } from "zod";
import { getActiveSession } from "@/lib/session";
import { AccessError } from "@/lib/repository";
import { createMemberAccount } from "@/lib/account-provisioning";
import { ROLES } from "@/lib/users";
export const runtime = "nodejs";
export const maxDuration = 60;
const id = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/);
const command = z
  .object({
    clubId: id,
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().email().max(254),
    roles: z.array(z.enum(ROLES)).min(1).max(ROLES.length),
    accessRequestId: id.optional(),
  })
  .strict();
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
function failure(error: unknown) {
  if (error instanceof AccessError) return json({ error: error.message }, error.status);
  console.error("create_account_request_failed");
  return json({ error: "The account could not be created." }, 500);
}
export async function POST(request: Request) {
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
    const chunks: Uint8Array[] = [];
    let size = 0;
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
    if (!parsed.success) return json({ error: "Check the account details." }, 400);
    const { clubId, name, email, roles, accessRequestId } = parsed.data;
    const result = await createMemberAccount(session.user.id, clubId, { name, email, roles, accessRequestId });
    return json(result);
  } catch (error) {
    return failure(error);
  }
}
