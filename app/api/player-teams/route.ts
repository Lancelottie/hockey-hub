import { z } from "zod";
import { getActiveSession } from "@/lib/session";
import { AccessError } from "@/lib/repository";
import { addPlayerToTeam, listPlayerTeamMemberships, removePlayerFromTeam } from "@/lib/player-teams";
export const runtime = "nodejs";
export const maxDuration = 60;
const id = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/);
const command = z.object({ clubId: id, playerId: id, teamId: id }).strict();
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
function failure(error: unknown) {
  if (error instanceof AccessError) return json({ error: error.message }, error.status);
  return json({ error: "The cross-team assignment could not be loaded or saved." }, 500);
}
async function readCommand(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json"))
    throw new AccessError(415, "JSON required.");
  const reader = request.body?.getReader();
  if (!reader) throw new AccessError(400, "Request body required.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > 4096) {
      await reader.cancel();
      throw new AccessError(413, "Request is too large.");
    }
    chunks.push(value);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new AccessError(400, "Invalid JSON.");
  }
  const parsed = command.safeParse(raw);
  if (!parsed.success) throw new AccessError(400, "Check the player and team.");
  return parsed.data;
}
function requireSameOrigin(request: Request) {
  if (
    request.headers.get("origin") !==
    new URL(process.env.BETTER_AUTH_URL!).origin
  )
    throw new AccessError(403, "Invalid request origin.");
}
export async function GET(request: Request) {
  try {
    const session = await getActiveSession(request.headers);
    if (!session) return json({ error: "Sign in to continue." }, 401);
    const parsed = id.safeParse(new URL(request.url).searchParams.get("clubId"));
    if (!parsed.success) return json({ error: "Choose a club." }, 400);
    return json({ memberships: (await listPlayerTeamMemberships(session.user.id, parsed.data)) });
  } catch (error) {
    return failure(error);
  }
}
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const session = await getActiveSession(request.headers);
    if (!session) return json({ error: "Sign in to continue." }, 401);
    const { clubId, playerId, teamId } = await readCommand(request);
    await addPlayerToTeam(session.user.id, clubId, playerId, teamId);
    return json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
export async function DELETE(request: Request) {
  try {
    requireSameOrigin(request);
    const session = await getActiveSession(request.headers);
    if (!session) return json({ error: "Sign in to continue." }, 401);
    const { clubId, playerId, teamId } = await readCommand(request);
    await removePlayerFromTeam(session.user.id, clubId, playerId, teamId);
    return json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
