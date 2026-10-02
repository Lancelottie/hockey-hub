import { canAccessFacilities } from "./facilities-access";
import { z } from "zod";
import { getActiveSession, requiresPasswordChange } from "./session";
import { AccessError } from "./repository";
export const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
export function failure(error: unknown) {
  if (error instanceof AccessError) return json({ error: error.message }, error.status);
  if (error instanceof z.ZodError) return json({ error: error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ") }, 400);
  console.error("facility_security_request_failed");
  return json({ error: "Unable to save or load facility security. Please retry; keep this page open to retain your draft." }, 500);
}
export async function sessionUser(request: Request) {
  const session = await getActiveSession(request.headers);
  if (!session) throw new AccessError(401, "Sign in to continue.");
  if (await requiresPasswordChange(session.user.id)) throw new AccessError(403, "Change your password before continuing.");
  if (!canAccessFacilities(session.user.email)) throw new AccessError(403, "Facilities Management is not available for this account.");
  return session.user;
}
