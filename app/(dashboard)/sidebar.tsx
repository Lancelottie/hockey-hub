"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, X } from "lucide-react";
import { useTeam } from "@/lib/team-context";
import { canAdmin, isNorthernHockeyAdmin } from "@/lib/users";
import { isTeamManagementPath } from "./team-management-nav";
import { isClubManagementPath } from "./club-management-nav";
import LogoutButton from "../logout-button";
const items = [
  { href: "/sections", label: "Sections" },
  { href: "/home", label: "Home" },
  { href: "/my-team", label: "Team Management" },
  { href: "/discussions", label: "Discussions" },
];
export default function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { club, clubs, switchClub, userName, canAccessFacilities } = useTeam();
  return (
    <header className="club-header">
      <div className="club-header-inner">
        <Link href="/home" className="brand" aria-label="CoCaptain home">
          C<span>C</span>
          <span className="brand-name">
            Co<span className="brand-accent">Captain</span><small>THE TEAM COMES FIRST</small>
          </span>
        </Link>
        <div className="header-account">
          <span className="hidden text-sm sm:block">{userName}</span>
          <LogoutButton />
          <button
            aria-label={open ? "Close navigation" : "Open navigation"}
            aria-expanded={open}
            aria-controls="primary-navigation"
            className="mobile-menu"
            onClick={() => setOpen(!open)}
          >
            {open ? <X /> : <Menu />}
          </button>
        </div>
      </div>
      <div className="club-nav-row">
        <nav
          id="primary-navigation"
          aria-label="Main navigation"
          className={`club-nav ${open ? "is-open" : ""}`}
        >
          {[
            ...items,
            ...(canAccessFacilities || canAdmin(club.role)
              ? [{ href: canAccessFacilities ? "/facilities-management" : "/admin", label: "Club Management" }]
              : []),
            ...(isNorthernHockeyAdmin(club.role)
              ? [{ href: "/registrations", label: "Registrations" }]
              : []),
          ].map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpen(false)}
              aria-current={
                (item.href === "/my-team" ? isTeamManagementPath(pathname) : item.label === "Club Management" ? isClubManagementPath(pathname) : pathname === item.href || pathname.startsWith(item.href + "/"))
                  ? "page"
                  : undefined
              }
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <label className="club-switch">
          <span className="sr-only">Club</span>
          <select value={club.id} onChange={(e) => switchClub(e.target.value)}>
            {clubs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>
    </header>
  );
}
