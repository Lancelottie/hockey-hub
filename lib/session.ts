import { getAuth } from "./auth";
import { getStore } from "./database";
export async function getActiveSession(headers: Headers) {
  const session = await getAuth().api.getSession({ headers });
  if (!session) return null;
  const account = (await getStore()
    .prepare("SELECT status FROM app_accounts WHERE user_id = ?")
    .get(session.user.id)) as { status: string } | undefined;
  return account?.status === "active" ? session : null;
}
