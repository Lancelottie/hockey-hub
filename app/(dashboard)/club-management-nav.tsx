"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTeam } from "@/lib/team-context";
import { canAdmin } from "@/lib/users";

export function isClubManagementPath(pathname: string) {
  return ["/facilities-management", "/admin"].some(path => pathname === path || pathname.startsWith(`${path}/`));
}

export default function ClubManagementNav() {
  const pathname = usePathname();
  const { club, canAccessFacilities } = useTeam();
  if (!isClubManagementPath(pathname)) return null;
  const tabs = [
    ...(canAccessFacilities ? [{ href: "/facilities-management", label: "Facilities Management" }] : []),
    ...(canAdmin(club.role) ? [{ href: "/admin", label: "Admin" }] : []),
  ];

  if (!tabs.length) return null;

  return (
    <nav aria-label="Club management" className="mb-6">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Club Management</p>
      <div className="flex gap-1 rounded-2xl border border-[var(--border-primary)] bg-[var(--surface-primary)] p-1.5 sm:inline-flex">
        {tabs.map(tab => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return <Link key={tab.href} href={tab.href} aria-current={active ? "page" : undefined}
            className={`flex min-h-11 flex-1 items-center justify-center rounded-xl px-4 py-2 text-center text-sm font-semibold transition-colors ${active ? "bg-[var(--accent-primary)] text-white" : "text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]"}`}>
            {tab.label}
          </Link>;
        })}
      </div>
    </nav>
  );
}
