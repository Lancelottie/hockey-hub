import { z } from "zod";
import { getActiveSession } from "@/lib/session";
import { AccessError } from "@/lib/repository";
import { acknowledgePlayerLoan, listPlayerLoans, recordPlayerLoan } from "@/lib/player-loans";
export const runtime = "nodejs";
export const maxDuration = 60;
const id = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[a-zA-Z0-9_-]+$/);
const label = z.string().trim().min(1).max(120);
const loan = z
  .object({
    clubId: id,
    playerId: id,
    playerName: label,
    fromTeamId: id,
    fromTeamName: label,
    toTeamId: id,
    toTeamName: label,
    matchId: id,
    opponent: label,
  })
  .strict();
const acknowledgement = z.object({ clubId: id, id }).strict();
const json = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
function failure(error: unknown) {
  if (error instanceof AccessError) return json({ error: error.message }, error.status);
  console.error("player_loan_request_failed");
  return json({ error: "The loan notice could not be processed." }, 500);
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
    return json({ loans: (await listPlayerLoans(session.user.id, parsed.data)) });
  } catch (error) {
    return failure(error);
  }
}
/** Called from the formation editor when a captain actually assigns a non-pooled section player. */
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const session = await getActiveSession(request.headers);
    if (!session) return json({ error: "Sign in to continue." }, 401);
    const raw = await readJsonBody(request, 4096);
    const parsed = loan.safeParse(raw);
    if (!parsed.success) return json({ error: "Check the loan details." }, 400);
    const { clubId, ...input } = parsed.data;
    await recordPlayerLoan(session.user.id, clubId, input);
    return json({ ok: true });
  } catch (error) {
    return failure(error);
  }
}
export async function PATCH(request: Request) {
  try {
    requireSameOrigin(request);
    const session = await getActiveSession(request.headers);
    if (!session) return json({ error: "Sign in to continue." }, 401);
    const raw = await readJsonBody(request, 4096);
    const parsed = acknowledgement.safeParse(raw);
    if (!parsed.success) return json({ error: "Choose an existing loan notice." }, 400);
    await acknowledgePlayerLoan(session.user.id, parsed.data.clubId, parsed.data.id);
    return json({ loans: (await listPlayerLoans(session.user.id, parsed.data.clubId)) });
  } catch (error) {
    return failure(error);
  }
}
