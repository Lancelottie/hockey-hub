"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import {
  ACCESS_REQUEST_LEVELS,
  ACCESS_REQUEST_LEVEL_LABELS,
  type AccessRequestLevel,
} from "@/lib/access-request-levels";
import { SECTION_KEYS, SECTION_LABELS, type SectionKey } from "@/lib/team-sections";

export default function RequestAccessPage() {
  const [clubs, setClubs] = useState<{ id: string; name: string }[]>([]);
  const [clubId, setClubId] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [sections, setSections] = useState<SectionKey[]>([]);
  const [levels, setLevels] = useState<AccessRequestLevel[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    fetch("/api/clubs", { cache: "no-store" })
      .then((r) => r.json())
      .then((result) => {
        setClubs(result.clubs ?? []);
        if (result.clubs?.length === 1) setClubId(result.clubs[0].id);
      })
      .catch(() => setError("Unable to load clubs. Please try again."));
  }, []);

  function toggleSection(key: SectionKey) {
    setSections((current) =>
      current.includes(key) ? current.filter((s) => s !== key) : [...current, key],
    );
  }

  function toggleLevel(level: AccessRequestLevel) {
    setLevels((current) =>
      current.includes(level) ? current.filter((l) => l !== level) : [...current, level],
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/access-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clubId, name, email, sections, requestedLevels: levels }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to send your request.");
      setSubmitted(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to send your request.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-screen">
      <section className="login-story">
        <Link href="/" className="brand" aria-label="CoCaptain home">
          C<span>C</span> / Co<span className="brand-accent">Captain</span>
        </Link>
        <p className="eyebrow">JOIN THE CLUB</p>
        <h1>
          Ask for
          <br />
          your access.
        </h1>
        <p>
          Tell us who you are and what you need.
          <br />A club administrator will set up your account.
        </p>
        <div className="login-pitch" aria-hidden="true">
          <span />
        </div>
      </section>
      <section className="login-form">
        {submitted ? (
          <div>
            <p className="eyebrow">REQUEST SENT</p>
            <h2>Thanks, {name.split(" ")[0]}.</h2>
            <p className="mb-8 text-[var(--text-secondary)]">
              A club administrator will review your request and be in touch
              once your account is ready.
            </p>
            <Link className="primary-button" href="/login">
              Back to sign in →
            </Link>
          </div>
        ) : (
          <form onSubmit={submit}>
            <p className="eyebrow">WELCOME TO THE CLUB</p>
            <h2>Request access</h2>
            <p className="mb-8 text-[var(--text-secondary)]">
              Fill this in and an admin will create your account.
            </p>
            <label htmlFor="name">Name</label>
            <input
              id="name"
              required
              maxLength={120}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <label htmlFor="email">Email address</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              maxLength={254}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {clubs.length > 1 && (
              <>
                <label htmlFor="club">Club</label>
                <select
                  id="club"
                  required
                  value={clubId}
                  onChange={(e) => setClubId(e.target.value)}
                >
                  <option value="" disabled>
                    Choose a club
                  </option>
                  {clubs.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </>
            )}
            <label>Section access</label>
            <div className="mb-5 flex flex-wrap gap-x-5 gap-y-2">
              {SECTION_KEYS.map((key) => (
                <label key={key} className="checkbox-field">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[var(--accent-primary)]"
                    checked={sections.includes(key)}
                    onChange={() => toggleSection(key)}
                  />
                  {SECTION_LABELS[key]}
                </label>
              ))}
            </div>
            <label>Level of access</label>
            <div className="mb-5 flex flex-wrap gap-x-5 gap-y-2">
              {ACCESS_REQUEST_LEVELS.map((l) => (
                <label key={l} className="checkbox-field">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[var(--accent-primary)]"
                    checked={levels.includes(l)}
                    onChange={() => toggleLevel(l)}
                  />
                  {ACCESS_REQUEST_LEVEL_LABELS[l]}
                </label>
              ))}
            </div>
            {error && (
              <p role="alert" className="mt-4 text-[var(--status-critical)]">
                {error}
              </p>
            )}
            <button
              className="primary-button mt-6 w-full"
              disabled={busy || !clubId || sections.length === 0 || levels.length === 0}
            >
              {busy ? "Sending…" : "Send request →"}
            </button>
            <p className="mt-6 text-sm text-[var(--text-secondary)]">
              Already have an account? <Link href="/login">Sign in</Link>
            </p>
          </form>
        )}
      </section>
    </main>
  );
}
