import { getActiveSession } from "@/lib/session";
import { clearMustChangePassword } from "@/lib/account-provisioning";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  if (
    request.headers.get("origin") !==
    new URL(process.env.BETTER_AUTH_URL!).origin
  )
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  const session = await getActiveSession(request.headers);
  if (!session) return Response.json({ error: "Sign in to continue." }, { status: 401 });
  await clearMustChangePassword(session.user.id);
  return Response.json({ ok: true }, { headers: { "Cache-Control": "private, no-store" } });
}
