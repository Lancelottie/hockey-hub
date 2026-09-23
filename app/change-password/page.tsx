import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getActiveSession } from "@/lib/session";
import ChangePasswordForm from "./change-password-form";
export default async function ChangePasswordPage() {
  if (!(await getActiveSession(await headers()))) redirect("/login");
  return <ChangePasswordForm />;
}
