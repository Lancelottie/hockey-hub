import type { Match } from "./types";

export function formatFixtureName(
  teamName: string,
  opponent: string,
  isHome: boolean,
): string {
  return isHome ? `${teamName} vs ${opponent}` : `${opponent} vs ${teamName}`;
}

export function formatFixtureLabel(teamName: string, match: Match): string {
  if (match.externalSource && match.homeTeam && match.awayTeam)
    return `${match.homeTeam} vs ${match.awayTeam}`;
  return formatFixtureName(teamName, match.opponent, match.isHome);
}

function parseMatchDateParts(value: string): {
  year: number;
  month: number;
  day: number;
  hours?: number;
  minutes?: number;
} | null {
  const dateTimeMatch = value.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?$/,
  );
  if (!dateTimeMatch) return null;

  return {
    year: Number(dateTimeMatch[1]),
    month: Number(dateTimeMatch[2]),
    day: Number(dateTimeMatch[3]),
    hours:
      dateTimeMatch[4] !== undefined ? Number(dateTimeMatch[4]) : undefined,
    minutes:
      dateTimeMatch[5] !== undefined ? Number(dateTimeMatch[5]) : undefined,
  };
}

export function formatMatchDateLong(value: string): string {
  if (!value) return "No date set";

  const parts = parseMatchDateParts(value);
  if (!parts) return value;

  const date = new Date(parts.year, parts.month - 1, parts.day);
  const dateLabel = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);

  if (parts.hours === undefined || parts.minutes === undefined) {
    return dateLabel;
  }

  const timeLabel = `${String(parts.hours).padStart(2, "0")}:${String(
    parts.minutes,
  ).padStart(2, "0")}`;
  return `${dateLabel} ${timeLabel} pushback`;
}

export function getFixtureMonthKey(value: string): string {
  const parts = parseMatchDateParts(value);
  if (!parts) return "no-date";
  return `${parts.year}-${String(parts.month).padStart(2, "0")}`;
}

export function isUpcomingFixture(value: string, now: Date = new Date()): boolean {
  const parts = parseMatchDateParts(value);
  if (!parts) return false;
  const matchDay = new Date(parts.year, parts.month - 1, parts.day).setHours(0, 0, 0, 0);
  const today = new Date(now).setHours(0, 0, 0, 0);
  return matchDay >= today;
}

export function formatFixtureMonthLabel(monthKey: string): string {
  if (monthKey === "no-date") return "No date";
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(year, month - 1, 1);
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
  }).format(date);
}
