import { getActiveSession } from "@/lib/session";
import { AccessError, listClubs, readClub, writeClub } from "@/lib/repository";
import { saveSchema } from "@/lib/validation";
export const runtime = "nodejs";
export const maxDuration = 60;
function failure(error: unknown) {
  if (error instanceof AccessError)
    return Response.json({ error: error.message }, { status: error.status });
  console.error("workspace_request_failed");
  return Response.json(
    { error: "The workspace could not be loaded or saved." },
    { status: 500 },
  );
}
export async function GET(request: Request) {
  try {
    const session = await getActiveSession(request.headers);
    if (!session)
      return Response.json({ error: "Sign in to continue." }, { status: 401 });
    const clubs = (await listClubs(session.user.id));
    const id = new URL(request.url).searchParams.get("clubId") ?? clubs[0]?.id;
    if (!id)
      return Response.json(
        {
          error:
            "Your account has no club membership. Contact your administrator.",
        },
        { status: 403 },
      );
    return Response.json(
      {
        ...(await readClub(session.user.id, id)),
        clubs,
        user: { id: session.user.id, name: session.user.name },
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
export async function PUT(request: Request) {
  try {
    if (
      request.headers.get("origin") !==
      new URL(process.env.BETTER_AUTH_URL!).origin
    )
      return Response.json(
        { error: "Invalid request origin." },
        { status: 403 },
      );
    const session = await getActiveSession(request.headers);
    if (!session)
      return Response.json({ error: "Sign in to continue." }, { status: 401 });
    if (!request.headers.get("content-type")?.startsWith("application/json"))
      return Response.json({ error: "JSON required." }, { status: 415 });
    const reader = request.body?.getReader();
    if (!reader)
      return Response.json(
        { error: "Request body required." },
        { status: 400 },
      );
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 2_000_000) {
        await reader.cancel();
        return Response.json(
          { error: "Workspace exceeds the 2 MB limit." },
          { status: 413 },
        );
      }
      chunks.push(value);
    }
    let raw: unknown;
    try {
      raw = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    } catch {
      return Response.json({ error: "Invalid JSON." }, { status: 400 });
    }
    const parsed = saveSchema.safeParse(raw);
    if (!parsed.success)
      return Response.json(
        { error: "Invalid workspace data or team/player references." },
        { status: 400 },
      );
    const { clubId, revision, data } = parsed.data;
    return Response.json(
      { revision: (await writeClub(session.user.id, clubId, revision, data)) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return failure(error);
  }
}
