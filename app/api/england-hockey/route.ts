import { z } from "zod";
import { getActiveSession } from "@/lib/session";
import { AccessError, readClub } from "@/lib/repository";
import { EnglandHockeyError } from "@/lib/england-hockey/source";
import {
  readFixtureSource,
  syncEnglandHockeyFixtures,
} from "@/lib/england-hockey/sync";
export const runtime = "nodejs";
const id = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/);
const scope = z.object({ clubId: id, teamId: id }).strict();
const command = scope.extend({
  sourceUrl: z.string().max(500).optional(),
  revision: z.number().int().nonnegative(),
});
const json = (data: unknown, status = 200) =>
  Response.json(data, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
function failure(error: unknown) {
  if (error instanceof AccessError)
    return json({ error: error.message }, error.status);
  if (error instanceof EnglandHockeyError)
    return json({ error: error.message }, 422);
  return json(
    { error: "Fixtures could not be synced. Please try again." },
    500,
  );
}
export async function GET(request: Request) {
  try {
    const session = await getActiveSession(request.headers);
    if (!session) return json({ error: "Sign in to continue." }, 401);
    const parsed = scope.safeParse(
      Object.fromEntries(new URL(request.url).searchParams),
    );
    if (!parsed.success) return json({ error: "Choose a club and team." }, 400);
    return json({
      source: readFixtureSource(
        session.user.id,
        parsed.data.clubId,
        parsed.data.teamId,
      ),
    });
  } catch (error) {
    return failure(error);
  }
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
    if (!parsed.success)
      return json({ error: "Check the team and England Hockey URL." }, 400);
    const { teamId, clubId, sourceUrl, revision } = parsed.data;
    const result = await syncEnglandHockeyFixtures(teamId, {
      clubId,
      sourceUrl,
      expectedRevision: revision,
      actor: { userId: session.user.id },
    });
    return json({ ...result, workspace: readClub(session.user.id, clubId) });
  } catch (error) {
    return failure(error);
  }
}
