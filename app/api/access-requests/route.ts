import { z } from "zod";
import { getActiveSession } from "@/lib/session";
import { AccessError } from "@/lib/repository";
import {
  listAccessRequests,
  resolveAccessRequest,
  submitAccessRequest,
} from "@/lib/access-requests";
import { ACCESS_REQUEST_LEVELS } from "@/lib/access-request-levels";
import { SECTION_KEYS } from "@/lib/team-sections";
export const runtime = "nodejs";
export const maxDuration = 60;
const id = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/);
const submission = z
  .object({
    clubId: id,
    name: z.string().trim().min(1).max(120),
    email: z.string().trim().email().max(254),
    sections: z.array(z.enum(SECTION_KEYS)).min(1).max(SECTION_KEYS.length),
    requestedLevels: z.array(z.enum(ACCESS_REQUEST_LEVELS)).min(1).max(ACCESS_REQUEST_LEVELS.length),
  })
  .strict();
const resolution = z.object({ clubId: id, id }).strict();
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
function failure(error: unknown) {
  if (error instanceof AccessError) return json({ error: error.message }, error.status);
  console.error("access_request_failed");
  return json({ error: "The request could not be processed." }, 500);
}
async function readJsonBody(request: Request, limit: number) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new AccessError(415, "JSON required.");
  const reader = request.body?.getReader();
  if (!reader) throw new AccessError(400, "Request body required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > limit) {
      await reader.cancel();
      throw new AccessError(413, "Request is too large.");
    }
    chunks.push(value);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new AccessError(400, "Invalid JSON.");
  }
}
/** Admin-only: pending requests for the club the caller manages. */
export async function GET(request: Request) {
  try {
    const session = await getActiveSession(request.headers);
    if (!session) return json({ error: "Sign in to continue." }, 401);
    const parsed = id.safeParse(new URL(request.url).searchParams.get("clubId"));
    if (!parsed.success) return json({ error: "Choose a club." }, 400);
    return json({ requests: (await listAccessRequests(session.user.id, parsed.data)) });
  } catch (error) {
    return failure(error);
  }
}
/** Public: submitted from the pre-login request-access form. No session required. */
export async function POST(request: Request) {
  try {
    const raw = await readJsonBody(request, 4096);
    const parsed = submission.safeParse(raw);
    if (!parsed.success) return json({ error: "Check the request details." }, 400);
    const { clubId, name, email, sections, requestedLevels } = parsed.data;
    await submitAccessRequest(clubId, name, email, sections, requestedLevels);
    return json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
/** Admin-only: mark a request as actioned once the account has been created. */
export async function PATCH(request: Request) {
  try {
    if (
      request.headers.get("origin") !==
      new URL(process.env.BETTER_AUTH_URL!).origin
    )
      return json({ error: "Invalid request origin." }, 403);
    const session = await getActiveSession(request.headers);
    if (!session) return json({ error: "Sign in to continue." }, 401);
    const raw = await readJsonBody(request, 4096);
    const parsed = resolution.safeParse(raw);
    if (!parsed.success) return json({ error: "Choose an existing request." }, 400);
    await resolveAccessRequest(session.user.id, parsed.data.clubId, parsed.data.id);
    return json({ requests: (await listAccessRequests(session.user.id, parsed.data.clubId)) });
  } catch (error) {
    return failure(error);
  }
}
