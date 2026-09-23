"use client";
import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";

export default function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (newPassword !== confirm) {
      setError("New passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      const result = await authClient.changePassword({
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      });
      if (result.error)
        throw new Error(result.error.message ?? "Unable to change your password.");
      await fetch("/api/account/password-changed", { method: "POST" });
      window.location.assign("/sections");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to change your password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-screen">
      <section className="login-story">
        <span className="brand" aria-label="CoCaptain">
          C<span>C</span> / Co<span className="brand-accent">Captain</span>
        </span>
        <p className="eyebrow">FIRST SIGN-IN</p>
        <h1>
          Set your
          <br />
          own password.
        </h1>
        <p>
          You&apos;re signed in with the password your admin gave you.
          <br />
          Choose a new one to keep using the club hub.
        </p>
        <div className="login-pitch" aria-hidden="true">
          <span />
        </div>
      </section>
      <section className="login-form">
        <form onSubmit={submit}>
          <p className="eyebrow">WELCOME TO THE CLUB</p>
          <h2>Set your password</h2>
          <p className="mb-8 text-[var(--text-secondary)]">
            Choose a new password to replace the one you were given.
          </p>
          <label htmlFor="current">Current password</label>
          <input
            id="current"
            type="password"
            autoComplete="current-password"
            required
            maxLength={128}
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
          <label htmlFor="new">New password</label>
          <input
            id="new"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={128}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
          />
          <label htmlFor="confirm">Confirm new password</label>
          <input
            id="confirm"
            type="password"
            autoComplete="new-password"
            required
            minLength={12}
            maxLength={128}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
          {error && (
            <p role="alert" className="mb-4 text-[var(--status-critical)]">
              {error}
            </p>
          )}
          <button className="primary-button w-full" disabled={busy}>
            {busy ? "Saving…" : "Set password →"}
          </button>
        </form>
      </section>
    </main>
  );
}
