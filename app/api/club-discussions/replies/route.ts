import { z } from "zod";
import { getActiveSession } from "@/lib/session";
import { AccessError } from "@/lib/repository";
import { deleteClubDiscussionReply, listClubDiscussions, postClubDiscussionReply } from "@/lib/club-discussions";
export const runtime = "nodejs";
export const maxDuration = 60;
const id = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/);
const postBody = z
  .object({ clubId: id, discussionId: id, body: z.string().trim().min(1).max(2000) })
  .strict();
const deleteBody = z.object({ clubId: id, discussionId: id, id }).strict();
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
function failure(error: unknown) {
  if (error instanceof AccessError) return json({ error: error.message }, error.status);
  console.error("club_discussion_reply_request_failed");
  return json({ error: "The reply could not be saved." }, 500);
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
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const session = await getActiveSession(request.headers);
    if (!session) return json({ error: "Sign in to continue." }, 401);
    const raw = await readJsonBody(request, 4096);
    const parsed = postBody.safeParse(raw);
    if (!parsed.success) return json({ error: "Write something before replying." }, 400);
    const { clubId, discussionId, body } = parsed.data;
    await postClubDiscussionReply(session.user.id, clubId, discussionId, session.user.name, body);
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
    if (!parsed.success) return json({ error: "Choose an existing reply." }, 400);
    const { clubId, discussionId, id: replyId } = parsed.data;
    await deleteClubDiscussionReply(session.user.id, clubId, discussionId, replyId);
    return json({ discussions: (await listClubDiscussions(session.user.id, clubId)) });
  } catch (error) {
    return failure(error);
  }
}
