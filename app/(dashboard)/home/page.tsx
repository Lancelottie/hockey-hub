"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowUpRight, CalendarDays, Users, ClipboardList } from "lucide-react";
import { useTeam } from "@/lib/team-context";
import { loadPlayers, loadMatches, loadLineup } from "@/lib/storage";
import { formatMatchDateLong } from "@/lib/match-format";
type PlayerLoan = {
  id: string;
  playerName: string;
  fromTeamId: string;
  toTeamName: string;
  opponent: string;
};
export default function Home() {
  const { activeTeam, userName, club, canWrite } = useTeam();
  const [playerLoans, setPlayerLoans] = useState<PlayerLoan[]>([]);
  const [acknowledgingLoanId, setAcknowledgingLoanId] = useState<string | null>(null);
  useEffect(() => {
    if (!canWrite) return;
    const controller = new AbortController();
    fetch(`/api/player-loans?clubId=${encodeURIComponent(club.id)}`, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((response) => response.json())
      .then((result) => {
        if (!controller.signal.aborted) setPlayerLoans(result.loans ?? []);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [club.id, canWrite]);
  async function acknowledgeLoan(id: string) {
    setAcknowledgingLoanId(id);
    try {
      const response = await fetch("/api/player-loans", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clubId: club.id, id }),
      });
      const result = await response.json();
      if (response.ok) setPlayerLoans(result.loans ?? []);
    } catch {
      // Silently retry-able from the next page load; this panel is a courtesy notice, not a blocker.
    } finally {
      setAcknowledgingLoanId(null);
    }
  }
  const teamLoans = playerLoans.filter((loan) => loan.fromTeamId === activeTeam?.id);
  const players = loadPlayers().filter((p) => p.teamId === activeTeam?.id);
  const matches = loadMatches().filter((m) => m.teamId === activeTeam?.id);
  const upcoming = matches
    .filter(
      (m) => m.date && Date.parse(m.date) >= new Date().setHours(0, 0, 0, 0),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  const next = upcoming[0];
  const lineup = next ? loadLineup(next.id) : null;
  const selected = lineup
    ? lineup.placements.length + lineup.subs.filter(Boolean).length
    : 0;
  return (
    <div className="space-y-7">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">
            THE CLUBHOUSE / {activeTeam?.name ?? "LET’S GET STARTED"}
          </p>
          <h1>
            Your team.
            <br />
            <span>Ready for the next chapter.</span>
          </h1>
          <p>
            Welcome back, {userName.split(" ")[0]}. Bring your people together
            and make match day count.
          </p>
          <Link href="/my-team" className="lime-button">
            Meet your squad <ArrowUpRight size={18} />
          </Link>
        </div>
        <div className="hero-emblem" aria-hidden="true">
          <span>CC</span>
          <small>
            ONE TEAM
            <br />
            EVERY GAME
          </small>
        </div>
      </section>
      <section aria-label="Team overview" className="grid gap-4 sm:grid-cols-3">
        {[
          {
            label: "Players in your squad",
            value: players.length,
            icon: Users,
            href: "/my-team",
          },
          {
            label: "Upcoming fixtures",
            value: upcoming.length,
            icon: CalendarDays,
            href: "/fixtures",
          },
          {
            label: "Selected for next match",
            value: selected,
            icon: ClipboardList,
            href: next ? `/fixtures/${next.id}` : "/fixtures",
          },
        ].map((stat) => (
          <Link key={stat.label} href={stat.href} className="stat-card">
            <stat.icon size={22} />
            <strong>{stat.value}</strong>
            <span>{stat.label}</span>
            <ArrowUpRight className="stat-arrow" size={18} />
          </Link>
        ))}
      </section>
      {teamLoans.length > 0 && (
        <section className="rounded-[20px] border border-[var(--status-warning)] bg-[var(--status-warning-light)] p-5">
          <h2 className="text-lg font-bold text-[var(--status-warning)]">
            Player loans
          </h2>
          <p className="mt-1 text-sm text-[var(--status-warning)]">
            These {activeTeam?.name} players were loaned to another team for a fixture.
          </p>
          <ul className="mt-4 space-y-3">
            {teamLoans.map((loan) => (
              <li
                key={loan.id}
                className="rounded-lg bg-[var(--surface-primary)] p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-[var(--text-primary)]">
                    {loan.playerName} → {loan.toTeamName}
                  </p>
                  <button
                    className="text-sm underline disabled:opacity-55"
                    disabled={acknowledgingLoanId === loan.id}
                    onClick={() => void acknowledgeLoan(loan.id)}
                  >
                    Acknowledge →
                  </button>
                </div>
                <p className="mt-2 text-sm text-[var(--text-secondary)]">
                  For their fixture vs {loan.opponent}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section className="panel">
          <div className="panel-heading">
            <h2>Next up</h2>
            <Link href="/fixtures">All fixtures →</Link>
          </div>
          {next ? (
            <>
              <p className="eyebrow mt-6">
                {next.isHome ? "HOME FIXTURE" : "AWAY FIXTURE"}
              </p>
              <div className="fixture-faceoff">
                <strong>
                  {next.isHome ? activeTeam?.name : next.opponent}
                </strong>
                <span>VS</span>
                <strong>
                  {next.isHome ? next.opponent : activeTeam?.name}
                </strong>
              </div>
              <p className="text-center text-sm text-[var(--text-secondary)]">
                {formatMatchDateLong(next.date)}
              </p>
              <Link
                className="primary-button mt-6"
                href={`/fixtures/${next.id}`}
              >
                Manage match →
              </Link>
            </>
          ) : (
            <div className="empty-state">
              <CalendarDays />
              <h3>Your next match starts here</h3>
              <p>
                Add a fixture to prepare your lineup and match-day checklist.
              </p>
              <Link href="/fixtures" className="primary-button">
                Go to fixtures →
              </Link>
            </div>
          )}
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>Team notebook</h2>
            <span className="dot-badge">LIVE WORKSPACE</span>
          </div>
          <div className="notebook-item">
            <span>01</span>
            <div>
              <h3>Build your match-day squad</h3>
              <p>
                {next
                  ? `${selected} players selected. Review your lineup before pushback.`
                  : "Create a fixture, then choose your starting XI and substitutes."}
              </p>
              <Link href={next ? `/fixtures/${next.id}` : "/fixtures"}>
                {next ? "Open selection →" : "Open fixtures →"}
              </Link>
            </div>
          </div>
          <div className="notebook-item">
            <span>02</span>
            <div>
              <h3>Know your team</h3>
              <p>
                Keep positions and squad assignments up to date. Fixture
                availability has not been collected yet.
              </p>
              <Link href="/squads">Manage players →</Link>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
