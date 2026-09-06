"use client";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";
export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await authClient.signIn.email({ email, password });
      if (result.error) {
        setError(
          "Sign-in failed. Check your details or wait a minute before trying again.",
        );
      } else {
        window.location.assign("/home");
      }
    } catch {
      setError("Unable to connect. Please try again.");
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
        <p className="eyebrow">YOUR CLUB. YOUR PEOPLE. YOUR GAME.</p>
        <h1>
          Great teams
          <br />
          start here.
        </h1>
        <p>
          From the first whistle to the final score.
          <br />
          One place to bring your squad together.
        </p>
        <div className="login-pitch" aria-hidden="true">
          <span />
        </div>
      </section>
      <section className="login-form">
        <form onSubmit={submit}>
          <p className="eyebrow">WELCOME TO THE CLUB</p>
          <h2>Ready for pushback?</h2>
          <p className="mb-8 text-[var(--text-secondary)]">
            Sign in to manage your team.
          </p>
          <label htmlFor="email">Email address</label>
          <input
            id="email"
            type="email"
            autoComplete="username"
            required
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          {error && (
            <p role="alert" className="mb-4 text-[var(--status-critical)]">
              {error}
            </p>
          )}
          <button className="primary-button w-full" disabled={busy}>
            {busy ? "Signing in…" : "Sign in →"}
          </button>
          <p className="mt-6 text-sm text-[var(--text-secondary)]">
            Access is arranged by your club administrator. Contact them if you
            need an account or password assistance.
          </p>
        </form>
      </section>
    </main>
  );
}
