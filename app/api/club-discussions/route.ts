import { z } from "zod";
import { getActiveSession } from "@/lib/session";
import { AccessError } from "@/lib/repository";
import { deleteClubDiscussion, listClubDiscussions, postClubDiscussion, SECTIONS } from "@/lib/club-discussions";
export const runtime = "nodejs";
export const maxDuration = 60;
const id = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/);
const section = z.enum(SECTIONS);
const postBody = z.object({ clubId: id, section, body: z.string().trim().min(1).max(2000) }).strict();
const deleteBody = z.object({ clubId: id, id }).strict();
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
function failure(error: unknown) {
  if (error instanceof AccessError) return json({ error: error.message }, error.status);
  console.error("club_discussion_request_failed");
  return json({ error: "The discussion board could not be loaded or saved." }, 500);
}
function requireSameOrigin(request: Request) {
  if (
    request.headers.get("origin") !==
    new URL(process.env.BETTER_AUTH_URL!).origin
  )
    throw new AccessError(403, "Invalid request origin.");
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
export async function GET(request: Request) {
  try {
    const session = await getActiveSession(request.headers);
    if (!session) return json({ error: "Sign in to continue." }, 401);
    const url = new URL(request.url);
    const clubId = id.safeParse(url.searchParams.get("clubId"));
    if (!clubId.success) return json({ error: "Choose a club." }, 400);
    return json({ discussions: (await listClubDiscussions(session.user.id, clubId.data)) });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const session = await getActiveSession(request.headers);
    if (!session) return json({ error: "Sign in to continue." }, 401);
    const raw = await readJsonBody(request, 4096);
    const parsed = postBody.safeParse(raw);
    if (!parsed.success) return json({ error: "Write something before posting." }, 400);
    const { clubId, section, body } = parsed.data;
    await postClubDiscussion(session.user.id, clubId, section, session.user.name, body);
    return json({ discussions: (await listClubDiscussions(session.user.id, clubId)) });
  } catch (error) {
    return failure(error);
  }
}
export async function DELETE(request: Request) {
  try {
    requireSameOrigin(request);
    const session = await getActiveSession(request.headers);
    if (!session) return json({ error: "Sign in to continue." }, 401);
    const raw = await readJsonBody(request, 4096);
    const parsed = deleteBody.safeParse(raw);
    if (!parsed.success) return json({ error: "Choose an existing discussion." }, 400);
    const { clubId, id: discussionId } = parsed.data;
    await deleteClubDiscussion(session.user.id, clubId, discussionId);
    return json({ discussions: (await listClubDiscussions(session.user.id, clubId)) });
  } catch (error) {
    return failure(error);
  }
}
