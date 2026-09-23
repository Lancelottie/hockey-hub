"use client";
import { useState } from "react";
import Link from "next/link";
import { Shirt, Search } from "lucide-react";
import { useTeam } from "@/lib/team-context";
import { loadPlayers, loadMatches, loadLineup } from "@/lib/storage";
export default function MyTeam() {
  const { activeTeam } = useTeam();
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState("All positions");
  const positionOrder = ["Goalkeeper", "Defender", "Midfielder", "Forward"];
  const players = loadPlayers()
    .filter((p) => p.teamId === activeTeam?.id)
    .sort(
      (a, b) => positionOrder.indexOf(a.position) - positionOrder.indexOf(b.position),
    );
  const next = loadMatches()
    .filter(
      (m) =>
        m.teamId === activeTeam?.id &&
        Date.parse(m.date) >= new Date().setHours(0, 0, 0, 0),
    )
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  const lineup = next ? loadLineup(next.id) : null;
  const starters = new Set(lineup?.placements.map((p) => p.playerId));
  const subs = new Set(lineup?.subs);
  const shown = players.filter(
    (p) =>
      p.name.toLowerCase().includes(query.toLowerCase()) &&
      (position === "All positions" || p.position === position),
  );
  return (
    <div className="space-y-6">
      <div className="page-heading">
        <div>
          <p className="eyebrow">THE PEOPLE BEHIND THE PERFORMANCE</p>
          <h1>My Team</h1>
          <p>
            {activeTeam?.name ?? "Choose a team"} · {players.length} players
          </p>
        </div>
        <Link
          href={next ? `/fixtures/${next.id}` : "/fixtures"}
          className="primary-button"
        >
          Choose your lineup →
        </Link>
      </div>
      <section className="squad-banner">
        <div>
          <span className="eyebrow">MATCH-DAY FOCUS</span>
          <h2>
            {next ? `Next: ${next.opponent}` : "A squad for every challenge."}
          </h2>
          <p>
            {next
              ? `${starters.size} starters · ${lineup?.subs.filter(Boolean).length ?? 0} substitutes selected`
              : "Add your next fixture to start selecting the team."}
          </p>
        </div>
        <div className="composition">
          {["Goalkeeper", "Defender", "Midfielder", "Forward"].map((pos) => (
            <div key={pos}>
              <strong>
                {players.filter((p) => p.position === pos).length}
              </strong>
              <span>{pos === "Goalkeeper" ? "Keepers" : pos + "s"}</span>
            </div>
          ))}
        </div>
      </section>
      <div className="flex flex-wrap gap-3">
        <label className="search-field">
          <Search size={18} />
          <span className="sr-only">Search players</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a player…"
          />
        </label>
        <label className="filter-field">
          <span className="sr-only">Filter by position</span>
          <select
            value={position}
            onChange={(e) => setPosition(e.target.value)}
          >
            {[
              "All positions",
              "Goalkeeper",
              "Defender",
              "Midfielder",
              "Forward",
            ].map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
        <Link
          href="/squads"
          className="ml-auto self-center text-sm font-semibold text-[var(--accent-primary)]"
        >
          Manage player details →
        </Link>
      </div>
      <p className="text-sm text-[var(--text-secondary)]" role="status">
        Showing {shown.length} of {players.length} players. Availability is not
        yet collected.
      </p>
      <div className="grid grid-cols-1 gap-4 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {shown.map((player) => (
          <article key={player.id} className="player-card">
            <div
              className={`player-card-art ${player.position === "Goalkeeper" ? "keeper" : ""}`}
            >
              <span className="player-position">{player.position}</span>
              <Shirt size={88} strokeWidth={1.2} />
              <strong className="shirt-number">{player.number ?? "CC"}</strong>
              <span
                className={`selection-badge ${starters.has(player.id) ? "selected" : ""}`}
              >
                {starters.has(player.id)
                  ? "Starting XI"
                  : subs.has(player.id)
                    ? "Substitute"
                    : "Not selected"}
              </span>
            </div>
            <div className="player-card-body">
              <h2>{player.name}</h2>
              <p>{activeTeam?.name}</p>
              <div>
                <span>Availability</span>
                <span>Unconfirmed</span>
              </div>
            </div>
          </article>
        ))}
      </div>
      {!shown.length && (
        <div className="panel empty-state">
          <UsersPlaceholder />
          <h2>
            {players.length
              ? "No players match your filters"
              : "Your team is taking shape"}
          </h2>
          <p>
            {players.length
              ? "Try another name or position."
              : "Add players or ask your administrator to import your existing squad."}
          </p>
          <Link href="/squads" className="primary-button">
            Open players →
          </Link>
        </div>
      )}
    </div>
  );
}
function UsersPlaceholder() {
  return <Shirt size={32} />;
}
