"use client";
/* eslint-disable @next/next/no-img-element -- Private evidence and local previews must not pass through a public image optimizer. */
import { useEffect, useState } from "react";
import { ISSUE_TYPES, type FacilityBooking, type SecurityCheck, type CheckInput } from "@/lib/facility-security-model";

// Resize camera images before uploading; canvas also removes EXIF/location metadata.
async function preparePhoto(file: File): Promise<string> {
  if (!file.type.startsWith("image/") || file.size > 25000000) throw new Error("Choose an image under 25 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url; await image.decode();
    const scale = Math.min(1, 1400 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(image.width * scale)); canvas.height = Math.max(1, Math.round(image.height * scale));
    const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("This browser cannot prepare photos.");
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.82, 0.65, 0.45]) { const data = canvas.toDataURL("image/jpeg", quality); if (data.length < 900000) return data; }
    throw new Error("This image is too large. Try a smaller photo.");
  } catch (error) { throw new Error(error instanceof Error ? `Photo could not be prepared: ${error.message}` : "Photo could not be prepared. Try JPEG or PNG."); }
  finally { URL.revokeObjectURL(url); }
}
export default function CheckForm({ booking, kind, onSaved }: { booking: FacilityBooking; kind: "pre" | "post"; onSaved: (check: SecurityCheck) => void }) {
  const [responses, setResponses] = useState<Record<number, "confirmed" | "issue">>({});
  const [photos, setPhotos] = useState<Partial<Record<"facility" | "pitch" | "issue", string>>>({});
  const [notes, setNotes] = useState("");
  const [hasIssue, setHasIssue] = useState(false);
  const [issueType, setIssueType] = useState<(typeof ISSUE_TYPES)[number]>(ISSUE_TYPES[0]);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(0);
  const [error, setError] = useState("");
  const issueRequired = Object.values(responses).includes("issue");
  const showIssue = hasIssue || issueRequired;
  const dirty = Object.keys(responses).length > 0 || Object.keys(photos).length > 0 || !!notes || !!description;
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  async function photo(file: File | undefined, area: "facility" | "pitch" | "issue") {
    if (!file) return;
    setPreparing(n => n + 1); setError("");
    try { const data = await preparePhoto(file); setPhotos(p => ({ ...p, [area]: data })); }
    catch (e) { setError((e as Error).message); }
    finally { setPreparing(n => n - 1); }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError("");
    const missing = booking.checklists[kind].filter((_, index) => !responses[index]);
    if (missing.length) { setError(`Complete these items: ${missing.join("; ")}.`); return; }
    if (!photos.facility || !photos.pitch) { setError("Add both a facility photo and a pitch photo."); return; }
    if (showIssue && !description.trim()) { setError("Describe the security issue."); return; }
    const data: CheckInput = {
      kind, responses: booking.checklists[kind].map((_, i) => responses[i]), notes,
      issue: showIssue ? { type: issueType, description } : null,
      photos: (["facility", "pitch", ...(showIssue && photos.issue ? ["issue"] : [])] as const).map(area => ({ area: area as "facility" | "pitch" | "issue", data: photos[area as keyof typeof photos]! })),
    };
    setBusy(true);
    try {
      const response = await fetch("/api/facility-security", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clubId: booking.clubId, bookingId: booking.id, action: "check", data }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Submission failed. Please retry.");
      onSaved(result.check);
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  return <form onSubmit={submit} className="space-y-5">
    <h3 className="text-lg font-semibold">{kind === "pre" ? "Opening check" : "Lock-up check"}</h3>
    <p className="text-sm">Photograph both areas, complete each check, and report anything you cannot confirm. Submission records your name and the current time.</p>
    <fieldset disabled={busy || preparing > 0} className="space-y-4">
      <legend className="font-semibold">Photos</legend>
      {(["facility", "pitch", ...(showIssue ? ["issue"] : [])] as ("facility" | "pitch" | "issue")[]).map(area => <div key={area} className="rounded-xl border border-[var(--border-primary)] p-3 space-y-2">
        <p className="font-semibold">{area === "facility" ? "Tiffin / facility" : area === "pitch" ? "Field / pitch" : "Issue (optional)"}</p>
        {photos[area] && <img src={photos[area]} alt={`${area} evidence preview`} className="h-32 w-full rounded-lg object-cover" />}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">Take {area} photo<input aria-label={`Take ${area} photo`} type="file" accept="image/*" capture="environment" className="block min-h-11 w-full max-w-full text-sm" onChange={e => { void photo(e.target.files?.[0], area); e.target.value = ""; }} /></label>
          <label className="block text-sm">Upload {area} photo<input aria-label={`Upload ${area} photo`} type="file" accept="image/*" className="block min-h-11 w-full max-w-full text-sm" onChange={e => { void photo(e.target.files?.[0], area); e.target.value = ""; }} /></label>
        </div>
      </div>)}
    </fieldset>
    <fieldset disabled={busy} className="space-y-3">
      <legend className="font-semibold">Checklist</legend>
      {booking.checklists[kind].map((item, index) => <div key={index} className="rounded-xl border border-[var(--border-primary)] p-3">
        <label className="flex min-h-11 items-center gap-3"><input type="checkbox" className="h-5 w-5" checked={responses[index] === "confirmed"} onChange={e => setResponses(r => { const next = { ...r }; if (e.target.checked) next[index] = "confirmed"; else delete next[index]; return next; })} />{item}</label>
        <button type="button" aria-pressed={responses[index] === "issue"} className="min-h-11 text-sm underline" onClick={() => setResponses(r => ({ ...r, [index]: "issue" }))}>{responses[index] === "issue" ? "Issue recorded — add details below" : "Cannot confirm — report an issue"}</button>
      </div>)}
      <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={showIssue} disabled={issueRequired} onChange={e => setHasIssue(e.target.checked)} />Report a security issue</label>
      {showIssue && <div className="space-y-3 rounded-xl border border-amber-400 p-3">
        <label className="block">Issue type<select className="formation-input w-full min-h-11" value={issueType} onChange={e => setIssueType(e.target.value as typeof issueType)}>{ISSUE_TYPES.map(type => <option key={type}>{type}</option>)}</select></label>
        <label className="block">Issue description<textarea className="formation-input w-full" maxLength={3000} rows={3} value={description} onChange={e => setDescription(e.target.value)} /></label>
        <p className="text-sm">Reporting an issue does not prevent submission. Club administrators can review it in the audit history.</p>
      </div>}
      <label className="block">Notes (optional)<textarea className="formation-input w-full" maxLength={3000} rows={3} value={notes} onChange={e => setNotes(e.target.value)} /></label>
    </fieldset>
    {error && <p role="alert" className="text-red-700">{error}</p>}
    {preparing > 0 && <p role="status">Preparing photo…</p>}
    <p className="text-sm">Submitted checks cannot be edited. Keep this page open until the confirmation appears.</p>
    <button className="primary-button min-h-11 w-full" disabled={busy || preparing > 0}>{busy ? "Saving check and photos…" : kind === "pre" ? "Submit opening check" : "Submit lock-up check"}</button>
  </form>;
}
