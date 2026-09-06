import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getDb, migrateApp } from "../lib/db";
import {
  fetchEnglandHockeyFixtures,
  normalizeFixtures,
  parseTeamPage,
  validateTeamUrl,
  type RemoteFetch,
} from "../lib/england-hockey/source";
import {
  getFixtureSource,
  syncEnglandHockeyFixtures,
} from "../lib/england-hockey/sync";
import { readClub, writeClub } from "../lib/repository";
import { snapshotSchema } from "../lib/validation";
import { GET, POST } from "../app/api/england-hockey/route";
import { randomBytes } from "node:crypto";
import { createAuth, getAuth } from "../lib/auth";
import { getMigrations } from "better-auth/db/migration";

const sourceUrl =
  "https://www.englandhockey.co.uk/teams/northern-development-womens";
const externalTeamId = "393ff35f-945d-451d-8e26-337b946d1b4d";
const otherTeamId = "84296199-fdcf-476f-8ee2-36023a395ea9";
const sample = JSON.parse(
  readFileSync(
    new URL("./fixtures/england-hockey.json", import.meta.url),
    "utf8",
  ),
);
const team = { externalTeamId, name: "Northern Development" };
const html = (id = externalTeamId, name = team.name) =>
  `<h1>${name}</h1><div data-url-key='public-test-key' data-url="https://ehdwapi.englandhockey.co.uk/api/teams/${id}/fixturesandresults" data-module="competitions-team-fixtures"></div>`;
function remote(data: unknown = sample, page = html()): RemoteFetch {
  return async (url, init) => {
    assert.equal(init?.redirect, "error");
    assert.ok(init?.signal);
    assert.equal(init?.cache, "no-store");
    const path = String(url);
    if (path.startsWith("https://www.englandhockey.co.uk/teams/"))
      return new Response(page);
    assert.match(
      path,
      /^https:\/\/ehdwapi\.englandhockey\.co\.uk\/api\/teams\/[a-f0-9-]+\/fixturesandresults$/,
    );
    assert.equal(
      new Headers(init?.headers).get("x-api-key"),
      "public-test-key",
    );
    return Response.json(data);
  };
}
test("home/away and opponent use team IDs, retaining source time and optional fields", () => {
  const result = normalizeFixtures(sample, team, sourceUrl).fixtures;
  assert.equal(result[0].isHome, true);
  assert.equal(result[0].opponent, "Neston Development");
  assert.equal(result[0].homeTeam, "Northern Development");
  assert.equal(result[0].startTime, "15:15");
  assert.equal(result[0].date, "2026-09-19T15:15");
  assert.equal(result[1].isHome, false);
  assert.equal(result[1].opponent, "West Derby Development");
  assert.equal(result[1].startTime, "00:00");
  assert.equal(result[1].date, "2026-09-26");
  assert.equal(result[0].venue, undefined);
  const renamed = structuredClone(sample);
  renamed[0].fixtures[0].homeTeam.teamName = "Northern Renamed";
  assert.equal(
    normalizeFixtures(renamed, team, sourceUrl).fixtures[0].isHome,
    true,
  );
});
test("structured fetch reads discovered team ID and API, not fixture HTML", async () => {
  const result = await fetchEnglandHockeyFixtures(sourceUrl, remote());
  assert.equal(result.teamName, "Northern Development");
  assert.equal(result.externalTeamId, externalTeamId);
  assert.equal(result.fixtures.length, 2);
  assert.equal(parseTeamPage(html(externalTeamId, "A &amp; B")).name, "A & B");
});
test("URL allowlist rejects SSRF, credentials, ports, redirects and untrusted discovered endpoints", async () => {
  for (const invalid of [
    "http://www.englandhockey.co.uk/teams/a",
    "https://evil.test/teams/a",
    "https://www.englandhockey.co.uk.evil.test/teams/a",
    "https://127.0.0.1/teams/a",
    "https://user@www.englandhockey.co.uk/teams/a",
    "https://www.englandhockey.co.uk:444/teams/a",
    `${sourceUrl}?redirect=x`,
    `${sourceUrl}#x`,
    "https://www.englandhockey.co.uk/teams/%2fetc",
    "https://ehdwapi.englandhockey.co.uk/teams/a",
  ]) {
    let fetched = false;
    await assert.rejects(
      fetchEnglandHockeyFixtures(invalid, async () => {
        fetched = true;
        return new Response();
      }),
    );
    assert.equal(fetched, false);
  }
  assert.equal(
    validateTeamUrl(
      "https://englandhockey.co.uk/teams/northern-development-womens/",
    ),
    sourceUrl,
  );
  assert.throws(() =>
    parseTeamPage(html().replace("ehdwapi.englandhockey.co.uk", "127.0.0.1")),
  );
  await assert.rejects(
    fetchEnglandHockeyFixtures(
      sourceUrl,
      async () =>
        new Response("", {
          status: 302,
          headers: { Location: "http://127.0.0.1" },
        }),
    ),
    /unavailable/,
  );
});
test("malformed responses, impossible dates/times, unrelated teams and unavailable upstream fail safely", async () => {
  for (const data of [{}, [{ fixtures: "bad" }], [{ fixtures: [{}] }]])
    assert.throws(
      () => normalizeFixtures(data, team, sourceUrl),
      /could not understand/,
    );
  for (const change of [
    { fixtureDate: "2026-02-30T13:00" },
    { fixtureTime: "25:90" },
    { homeTeamId: otherTeamId },
  ]) {
    const data = structuredClone(sample);
    Object.assign(data[0].fixtures[0], change);
    assert.throws(() => normalizeFixtures(data, team, sourceUrl));
  }
  await assert.rejects(
    fetchEnglandHockeyFixtures(
      sourceUrl,
      async () => new Response("bad", { status: 503 }),
    ),
    /unavailable/,
  );
  await assert.rejects(
    fetchEnglandHockeyFixtures(sourceUrl, async () => {
      throw new Error("private network exception");
    }),
    /unavailable/,
  );
  await assert.rejects(
    fetchEnglandHockeyFixtures(
      sourceUrl,
      async (url) =>
        new Response(String(url).includes("/api/") ? "not-json" : html()),
    ),
    /could not understand/,
  );
  await assert.rejects(
    fetchEnglandHockeyFixtures(
      sourceUrl,
      async () => new Response("x".repeat(2_000_001)),
    ),
    /could not understand/,
  );
});
test("fallback excludes mutable date/time; ambiguous fixture identities are rejected", () => {
  const data = structuredClone(sample);
  for (const f of data[0].fixtures) {
    delete f.id;
    delete f.sourceId;
  }
  const first = normalizeFixtures(data, team, sourceUrl).fixtures[0];
  data[0].fixtures[0].fixtureTime = "14:30";
  data[0].fixtures[0].fixtureDate = "2026-10-01T14:30";
  assert.equal(
    normalizeFixtures(data, team, sourceUrl).fixtures[0].externalKey,
    first.externalKey,
  );
  data[0].fixtures.push(data[0].fixtures[0]);
  assert.throws(
    () => normalizeFixtures(data, team, sourceUrl),
    /could not understand/,
  );
});
test("empty lists and byes are valid; missing optional venue, status and competition do not fail", () => {
  assert.deepEqual(normalizeFixtures([], team, sourceUrl), {
    fixtures: [],
    skipped: 0,
  });
  const data = structuredClone(sample);
  data[0].fixtures[0].isBye = true;
  data[0].fixtures[0].awayTeam = null;
  delete data[0].competitionName;
  for (const f of data[0].fixtures) {
    delete f.status;
    delete f.statusDescription;
    delete f.competitionName;
  }
  const result = normalizeFixtures(data, team, sourceUrl);
  assert.equal(result.skipped, 1);
  assert.equal(result.fixtures.length, 1);
  assert.equal(result.fixtures[0].status, undefined);
});

const dir = mkdtempSync(join(tmpdir(), "cocaptain-eh-"));
process.env.DATABASE_PATH = join(dir, "test.sqlite");
process.env.BETTER_AUTH_SECRET = randomBytes(48).toString("base64url");
process.env.BETTER_AUTH_URL = "http://localhost:3000";
after(() => {
  getDb().close();
  rmSync(dir, { recursive: true, force: true });
});
test("transactional sync, workspace coexistence and authorization", async (t) => {
  const auth = createAuth(true);
  await (await getMigrations(auth.options)).runMigrations();
  migrateApp();
  migrateApp();
  const db = getDb();
  const password = randomBytes(24).toString("base64url");
  const users: Record<string, string> = {};
  const cookies: Record<string, string> = {};
  db.prepare(
    "INSERT INTO clubs(id,name) VALUES('a','Club A'),('b','Club B')",
  ).run();
  for (const role of [
    "club_admin",
    "manager",
    "coach",
    "player",
    "read_only",
  ]) {
    const user = (
      await auth.api.signUpEmail({
        body: { email: `${role}@example.test`, name: role, password },
      })
    ).user;
    users[role] = user.id;
    db.prepare("INSERT INTO app_accounts(user_id) VALUES(?)").run(user.id);
    db.prepare("INSERT INTO club_memberships VALUES(?,?,?)").run(
      user.id,
      "a",
      role,
    );
    const signed = await getAuth().api.signInEmail({
      body: { email: user.email, password },
      asResponse: true,
    });
    cookies[role] = signed.headers.get("set-cookie")!.split(";")[0];
  }
  db.prepare(
    "INSERT INTO teams VALUES('a','one','Ladies 1s'),('a','two','Ladies 2s'),('b','one','Other club')",
  ).run();
  const opts = {
    clubId: "a",
    actor: { userId: users.club_admin },
    fetcher: remote(),
  };
  await t.test(
    "first sync inserts; repeat is unchanged and preserves internal IDs and documents",
    async () => {
      const first = await syncEnglandHockeyFixtures("one", {
        ...opts,
        sourceUrl,
      });
      assert.equal(first.added, 2);
      const before = (await readClub(users.club_admin, "a"));
      const id = before.data.matches[0].id;
      db.prepare("INSERT INTO fixture_documents VALUES(?,?,?,?)").run(
        "a",
        id,
        "lineups",
        JSON.stringify({ placements: [], subs: [null] }),
      );
      const second = await syncEnglandHockeyFixtures("one", opts);
      assert.equal(second.unchanged, 2);
      assert.equal(second.added, 0);
      assert.equal(second.updated, 0);
      const after = (await readClub(users.club_admin, "a"));
      assert.deepEqual(
        after.data.matches.map((f) => f.id),
        before.data.matches.map((f) => f.id),
      );
      assert.equal(
        after.data.matches[0].updatedAt,
        before.data.matches[0].updatedAt,
      );
      assert.ok(after.data.lineups[id]);
    },
  );
  await t.test(
    "date, time, venue, opponent and postponed/cancelled changes update existing records",
    async () => {
      const changed = structuredClone(sample);
      Object.assign(changed[0].fixtures[0], {
        fixtureTime: "13:30",
        fixtureDate: "2026-10-03T13:30:00",
        venue: "New pitch",
        statusDescription: "Postponed",
      });
      changed[0].fixtures[0].awayTeam.teamName = "Liverpool Sefton 3";
      changed[0].fixtures[1].statusDescription = "Cancelled";
      const before = (await readClub(users.club_admin, "a")).data.matches;
      const result = await syncEnglandHockeyFixtures("one", {
        ...opts,
        fetcher: remote(changed),
      });
      assert.equal(result.updated, 2);
      const matches = (await readClub(users.club_admin, "a")).data.matches;
      assert.equal(matches[0].id, before[0].id);
      assert.equal(matches[0].date, "2026-10-03T13:30");
      assert.equal(matches[0].venue, "New pitch");
      assert.equal(matches[0].opponent, "Liverpool Sefton 3");
      assert.equal(matches[0].status, "Postponed");
      assert.equal(matches[1].status, "Cancelled");
      assert.equal(matches.length, 2);
    },
  );
  await t.test(
    "failed or empty sync never deletes fixtures or replaces a saved URL",
    async () => {
      const before = (await readClub(users.club_admin, "a"));
      await assert.rejects(
        syncEnglandHockeyFixtures("one", {
          ...opts,
          sourceUrl: "https://www.englandhockey.co.uk/teams/other",
          fetcher: remote({ bad: true }),
        }),
      );
      assert.deepEqual((await readClub(users.club_admin, "a")), before);
      assert.equal((await getFixtureSource("a", "one"))?.sourceUrl, sourceUrl);
      await syncEnglandHockeyFixtures("one", { ...opts, fetcher: remote([]) });
      assert.equal((await readClub(users.club_admin, "a")).data.matches.length, 2);
    },
  );
  await t.test(
    "multiple teams have independent URLs and cannot mix another external team into existing fixtures",
    async () => {
      const otherUrl =
        "https://www.englandhockey.co.uk/teams/west-derby-development-womens";
      const data = structuredClone(sample);
      data[0].fixtures = [data[0].fixtures[1]];
      const fetcher = remote(data, html(otherTeamId, "West Derby Development"));
      const result = await syncEnglandHockeyFixtures("two", {
        ...opts,
        sourceUrl: otherUrl,
        fetcher,
      });
      assert.equal(result.added, 1);
      assert.equal((await getFixtureSource("a", "one"))?.sourceUrl, sourceUrl);
      assert.equal((await getFixtureSource("a", "two"))?.sourceUrl, otherUrl);
      const second = (await readClub(users.club_admin, "a")).data.matches.find(
        (f) => f.teamId === "two",
      )!;
      assert.equal(second.isHome, true);
      assert.equal(second.opponent, "Northern Development");
      await assert.rejects(
        syncEnglandHockeyFixtures("one", {
          ...opts,
          sourceUrl: otherUrl,
          fetcher,
        }),
        /different England Hockey team/,
      );
    },
  );
  await t.test(
    "workspace saves retain integration settings and metadata; stale drafts and tampering are rejected",
    async () => {
      const current = (await readClub(users.club_admin, "a"));
      const parsed = snapshotSchema.parse(current.data);
      parsed.teams[0].name = "Updated team name";
      (await writeClub(users.club_admin, "a", current.revision, parsed));
      assert.ok((await getFixtureSource("a", "one")));
      assert.ok((await getFixtureSource("a", "two")));
      assert.deepEqual(
        (await readClub(users.club_admin, "a")).data.matches,
        current.data.matches,
      );
      await assert.rejects(
        async () => (await writeClub(users.club_admin, "a", current.revision, parsed)),
        /Another user/,
      );
      parsed.matches[0].opponent = "Forged";
      await assert.rejects(
        async () => (await writeClub(users.club_admin, "a", current.revision + 1, parsed)),
        /Imported fixtures/,
      );
    },
  );
  await t.test(
    "concurrent workspace change or membership revocation causes atomic conflict",
    async () => {
      const fetcher: RemoteFetch = async (url, init) => {
        if (String(url).includes("/api/"))
          db.prepare("UPDATE clubs SET revision=revision+1 WHERE id='a'").run();
        return remote()(url, init);
      };
      const before = (await readClub(users.club_admin, "a")).data;
      await assert.rejects(
        syncEnglandHockeyFixtures("one", { ...opts, fetcher }),
        /Someone saved/,
      );
      assert.deepEqual((await readClub(users.club_admin, "a")).data, before);
      const revoke: RemoteFetch = async (url, init) => {
        if (String(url).includes("/api/"))
          db.prepare(
            "UPDATE app_accounts SET status='suspended' WHERE user_id=?",
          ).run(users.manager);
        return remote()(url, init);
      };
      await assert.rejects(
        syncEnglandHockeyFixtures("one", {
          ...opts,
          actor: { userId: users.manager },
          fetcher: revoke,
        }),
        /permission/,
      );
      db.prepare("UPDATE app_accounts SET status='active' WHERE user_id=?").run(
        users.manager,
      );
    },
  );
  const request = (
    role: string,
    body: unknown,
    origin = "http://localhost:3000",
  ) =>
    new Request("http://localhost:3000/api/england-hockey", {
      method: "POST",
      headers: {
        cookie: cookies[role] ?? "",
        origin,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
  await t.test(
    "HTTP rejects anonymous, player, reader, cross-club, forged scheduler, CSRF and oversized requests",
    async () => {
      const body = {
        teamId: "one",
        clubId: "a",
        revision: (await readClub(users.club_admin, "a")).revision,
      };
      assert.equal((await POST(request("none", body))).status, 401);
      for (const role of ["player", "read_only"]) {
        assert.equal((await POST(request(role, body))).status, 403);
        assert.equal(
          (
            await GET(
              new Request(
                "http://localhost:3000/api/england-hockey?clubId=a&teamId=one",
                { headers: { cookie: cookies[role] } },
              ),
            )
          ).status,
          403,
        );
      }
      assert.equal(
        (await POST(request("club_admin", { ...body, clubId: "b" }))).status,
        403,
      );
      assert.equal(
        (
          await POST(
            request("club_admin", { ...body, actor: { system: true } }),
          )
        ).status,
        400,
      );
      assert.equal(
        (await POST(request("club_admin", body, "https://evil.test"))).status,
        403,
      );
      assert.equal(
        (await POST(request("club_admin", "x".repeat(4097)))).status,
        413,
      );
      assert.equal(
        (
          await POST(
            request("club_admin", { ...body, sourceUrl: "https://127.0.0.1" }),
          )
        ).status,
        422,
      );
      assert.equal(
        (await POST(request("club_admin", { ...body, revision: 0 }))).status,
        409,
      );
    },
  );
  await t.test(
    "HTTP successful manager sync returns a fresh workspace and readable summary",
    async () => {
      const originalFetch = globalThis.fetch;
      globalThis.fetch = remote();
      try {
        const response = await POST(
          request("manager", {
            clubId: "a",
            teamId: "one",
            revision: (await readClub(users.manager, "a")).revision,
          }),
        );
        assert.equal(response.status, 200);
        const result = await response.json();
        assert.equal(result.checked, 2);
        assert.equal(result.workspace.data.matches.length, 3);
        assert.equal(result.source.teamName, "Northern Development");
      } finally {
        globalThis.fetch = originalFetch;
      }
    },
  );
  await t.test(
    "team deletion cleans its source while other teams remain configured",
    async () => {
      const current = (await readClub(users.club_admin, "a"));
      current.data.teams = current.data.teams.filter((t) => t.id !== "two");
      current.data.matches = current.data.matches.filter(
        (f) => f.teamId !== "two",
      );
      (await writeClub(users.club_admin, "a", current.revision, current.data));
      assert.equal((await getFixtureSource("a", "two")), null);
      assert.ok((await getFixtureSource("a", "one")));
    },
  );
});
