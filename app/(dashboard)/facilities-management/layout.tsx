import type { ReactNode } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getActiveSession } from "@/lib/session";
import { canAccessFacilities } from "@/lib/facilities-access";

export default async function FacilitiesLayout({ children }: { children: ReactNode }) {
  const session = await getActiveSession(await headers());
  if (!session) redirect("/login");
  if (!canAccessFacilities(session.user.email)) redirect("/home");
  return children;
}
