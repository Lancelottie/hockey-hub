import { createHash } from "node:crypto";
import { z } from "zod";

export class EnglandHockeyError extends Error {}
const badResponse = () =>
  new EnglandHockeyError(
    "England Hockey returned fixture data we could not understand. No fixtures were changed.",
  );
const uuid =
  "[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}";
export function validateTeamUrl(input: string): string {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new EnglandHockeyError(
      "Enter a valid HTTPS England Hockey team URL.",
    );
  }
  if (
    url.protocol !== "https:" ||
    !["www.englandhockey.co.uk", "englandhockey.co.uk"].includes(
      url.hostname,
    ) ||
    url.port ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/teams\/[a-z0-9]+(?:-[a-z0-9]+)*\/?$/.test(url.pathname)
  ) {
    throw new EnglandHockeyError(
      "Use an HTTPS englandhockey.co.uk/teams/… URL without query parameters.",
    );
  }
  return `https://www.englandhockey.co.uk${url.pathname.replace(/\/$/, "")}`;
}
function decodeText(value: string) {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(
      /&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi,
      (entity, code: string) => {
        if (code.startsWith("#")) {
          const n =
            code[1].toLowerCase() === "x"
              ? parseInt(code.slice(2), 16)
              : parseInt(code.slice(1), 10);
          return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : entity;
        }
        return (
          (
            {
              amp: "&",
              quot: '"',
              apos: "'",
              lt: "<",
              gt: ">",
              nbsp: " ",
            } as Record<string, string>
          )[code.toLowerCase()] ?? entity
        );
      },
    )
    .trim();
}
export function parseTeamPage(html: string) {
  const tags = html.match(/<[^!][^>]*>/g) ?? [];
  const tag = tags.find((t) =>
    /\bdata-module\s*=\s*["']competitions-team-fixtures["']/.test(t),
  );
  const attribute = (name: string) =>
    tag?.match(new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`))?.[2];
  const endpoint = attribute("data-url");
  const apiKey = attribute("data-url-key");
  const match = endpoint?.match(
    new RegExp(
      `^https://ehdwapi\\.englandhockey\\.co\\.uk/api/teams/(${uuid})/fixturesandresults$`,
    ),
  );
  const name = decodeText(
    html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1] ?? "",
  );
  if (
    !match ||
    !apiKey ||
    !/^[a-zA-Z0-9_-]{1,256}$/.test(apiKey) ||
    !name ||
    name.length > 120
  )
    throw badResponse();
  return { externalTeamId: match[1].toLowerCase(), name, apiKey };
}
const optionalText = z.preprocess(
  (v) => (typeof v === "string" && v.trim() ? v.trim() : undefined),
  z.string().max(1000).optional(),
);
const teamSchema = z.object({
  id: optionalText,
  teamName: optionalText,
  clubName: optionalText,
  entityUrlSlug: optionalText,
});
const fixtureSchema = z.object({
  id: optionalText,
  sourceId: optionalText,
  sourceSystem: optionalText,
  seasonId: optionalText,
  competitionId: optionalText,
  competitionName: optionalText,
  homeTeamId: optionalText,
  awayTeamId: optionalText,
  homeTeam: teamSchema,
  awayTeam: teamSchema.nullish(),
  fixtureDate: z.string().max(60).nullish(),
  fixtureTime: z.string().max(30).nullish(),
  venue: optionalText,
  status: optionalText,
  statusDescription: optionalText,
  isBye: z.boolean().optional(),
});
const responseSchema = z
  .array(
    z.object({
      seasonId: optionalText,
      competitionId: optionalText,
      competitionName: optionalText,
      fixtures: z.array(fixtureSchema).max(3000),
    }),
  )
  .max(100);
export type ImportedFixture = {
  externalKey: string;
  externalFixtureId?: string;
  externalTeamId: string;
  externalSource: "england-hockey";
  opponent: string;
  isHome: boolean;
  date: string;
  startTime: string | null;
  homeTeam: string;
  awayTeam: string;
  venue?: string;
  competition?: string;
  status?: string;
  sourceUrl: string;
};
export function normalizeFixtures(
  raw: unknown,
  team: { externalTeamId: string; name: string },
  sourceUrl: string,
) {
  const parsed = responseSchema.safeParse(raw);
  if (!parsed.success) throw badResponse();
  const fixtures: ImportedFixture[] = [];
  const keys = new Set<string>();
  let skipped = 0;
  for (const group of parsed.data)
    for (const f of group.fixtures) {
      if (f.isBye) {
        skipped++;
        continue;
      }
      const homeId = (f.homeTeamId ?? f.homeTeam.id)?.toLowerCase();
      const awayId = (f.awayTeamId ?? f.awayTeam?.id)?.toLowerCase();
      const isHome = homeId === team.externalTeamId;
      const isAway = awayId === team.externalTeamId;
      if (isHome === isAway) throw badResponse();
      const homeTeam = f.homeTeam.teamName ?? f.homeTeam.clubName;
      const awayTeam = f.awayTeam?.teamName ?? f.awayTeam?.clubName;
      if (
        !homeTeam ||
        !awayTeam ||
        homeTeam.length > 120 ||
        awayTeam.length > 120
      )
        throw badResponse();
      const day = f.fixtureDate?.slice(0, 10) ?? "";
      if (
        day &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(day) ||
          !Number.isFinite(Date.parse(day)) ||
          new Date(day).toISOString().slice(0, 10) !== day)
      )
        throw badResponse();
      const time = f.fixtureTime?.trim() || null;
      if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw badResponse();
      // EH uses 00:00 for unconfirmed pushback. Keep that raw value but avoid presenting it as a confirmed midnight game.
      const date = day
        ? `${day}${time && time !== "00:00" ? `T${time}` : ""}`
        : "";
      const fallbackParts = [
        f.seasonId ?? group.seasonId,
        f.competitionId ?? group.competitionId,
        homeId,
        awayId,
      ];
      if (!f.id && !f.sourceId && fallbackParts.some((p) => !p))
        throw badResponse();
      const externalKey = f.id
        ? `id:${f.id.toLowerCase()}`
        : f.sourceId
          ? `source:${f.sourceSystem ?? "Gms"}:${f.sourceId}`
          : `pair:${createHash("sha256").update(JSON.stringify(fallbackParts)).digest("hex")}`;
      // An ambiguous fallback is never silently merged. A changed upstream contract needs attention.
      if (keys.has(externalKey)) throw badResponse();
      keys.add(externalKey);
      fixtures.push({
        externalKey,
        externalFixtureId: f.id,
        externalTeamId: team.externalTeamId,
        externalSource: "england-hockey",
        date,
        startTime: time,
        isHome,
        opponent: isHome ? awayTeam : homeTeam,
        homeTeam,
        awayTeam,
        venue: f.venue,
        competition: f.competitionName ?? group.competitionName,
        status: f.statusDescription ?? f.status,
        sourceUrl,
      });
    }
  if (fixtures.length > 3000) throw badResponse();
  return { fixtures, skipped };
}
export type RemoteFetch = typeof fetch;
async function requestText(
  url: string,
  limit: number,
  fetcher: RemoteFetch,
  headers: Record<string, string> = {},
) {
  try {
    const response = await fetcher(url, {
      headers,
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error("upstream unavailable");
    const reader = response.body?.getReader();
    if (!reader) throw badResponse();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) {
        await reader.cancel();
        throw badResponse();
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks).toString("utf8");
  } catch (error) {
    if (error instanceof EnglandHockeyError) throw error;
    throw new EnglandHockeyError(
      "England Hockey is unavailable or took too long to respond. Please try again. Your fixtures have been kept.",
    );
  }
}
export async function fetchEnglandHockeyFixtures(
  input: string,
  fetcher: RemoteFetch = fetch,
) {
  const sourceUrl = validateTeamUrl(input);
  const team = parseTeamPage(await requestText(sourceUrl, 2_000_000, fetcher));
  // Reconstruct from a validated ID: never follow URLs supplied by the user or links in API responses.
  const endpoint = `https://ehdwapi.englandhockey.co.uk/api/teams/${team.externalTeamId}/fixturesandresults`;
  const json = await requestText(endpoint, 5_000_000, fetcher, {
    "x-api-key": team.apiKey,
    Accept: "application/json",
  });
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw badResponse();
  }
  return {
    sourceUrl,
    externalTeamId: team.externalTeamId,
    teamName: team.name,
    ...normalizeFixtures(raw, team, sourceUrl),
  };
}
