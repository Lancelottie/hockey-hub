"use client";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";
import { clearStorage, hasUnsavedChanges } from "@/lib/storage";
export default function LogoutButton() {
  const [error, setError] = useState("");
  async function logout() {
    if (hasUnsavedChanges()) {
      setError(
        "Changes are unsaved. Export your draft and reload before signing out.",
      );
      return;
    }
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error();
      clearStorage();
      window.location.assign("/login");
    } catch {
      setError("Sign-out failed. Please try again.");
    }
  }
  return (
    <>
      <button
        onClick={logout}
        className="rounded-lg border border-white/25 px-4 py-2 text-sm text-white"
      >
        Sign out
      </button>
      {error && (
        <p role="alert" className="text-sm">
          {error}
        </p>
      )}
    </>
  );
}
