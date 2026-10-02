"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/my-team", label: "My Team" },
  { href: "/fixtures", label: "Fixtures" },
];

export function isTeamManagementPath(pathname: string) {
  return tabs.some(tab => pathname === tab.href || pathname.startsWith(`${tab.href}/`));
}

export default function TeamManagementNav() {
  const pathname = usePathname();
  if (!isTeamManagementPath(pathname)) return null;

  return (
    <nav aria-label="Team management" className="mb-6">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-[var(--text-secondary)]">Team Management</p>
      <div className="flex w-full gap-1 rounded-2xl border border-[var(--border-primary)] bg-[var(--surface-primary)] p-1.5">
        {tabs.map(tab => {
          const active = pathname === tab.href || pathname.startsWith(`${tab.href}/`);
          return <Link key={tab.href} href={tab.href} aria-current={active ? "page" : undefined}
            className={`flex min-h-11 min-w-0 flex-1 items-center justify-center rounded-xl px-4 py-2 text-center text-sm font-semibold transition-colors ${active ? "bg-[var(--accent-primary)] text-white" : "text-[var(--text-secondary)] hover:bg-[var(--surface-muted)]"}`}>
            {tab.label}
          </Link>;
        })}
      </div>
    </nav>
  );
}
