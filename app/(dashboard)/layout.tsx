import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getActiveSession, requiresPasswordChange } from "@/lib/session";
import { TeamProvider } from "@/lib/team-context";
import Sidebar from "./sidebar";
import Topbar from "./topbar";
export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const session = await getActiveSession(await headers());
  if (!session) redirect("/login");
  if (await requiresPasswordChange(session.user.id)) redirect("/change-password");
  return (
    <TeamProvider>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Sidebar />
      <Topbar />
      <main
        id="main"
        className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-8 lg:py-8"
      >
        {children}
      </main>
    </TeamProvider>
  );
}
