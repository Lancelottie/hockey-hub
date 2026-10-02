"use client";
/* eslint-disable @next/next/no-img-element -- Evidence uses an authenticated, uncached endpoint. */
import { useCallback, useEffect, useState } from "react";
import { useTeam } from "@/lib/team-context";
import { DEFAULT_CHECKLISTS, STATUSES, securityExceptions, securityReminder, securityStatus, type Checklists, type FacilityBooking, type SecurityCheck } from "@/lib/facility-security-model";
import CheckForm from "./check-form";

type Data = { bookings: FacilityBooking[]; members: { id: string; name: string }[]; checklists: Checklists | null; admin: boolean };
const time = (value: string) => new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });
const inputClass = "formation-input w-full min-h-11";
async function write(clubId: string, action: string, data: unknown) {
  const response = await fetch("/api/facility-security", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clubId, action, data }) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Unable to save. Please retry.");
  return result;
}
function Status({ booking, now }: { booking: FacilityBooking; now: number }) {
  const status = securityStatus(booking, now);
  return <span className={`inline-block rounded-full px-3 py-1 text-sm font-semibold ${status === "Lock-Up Outstanding" ? "bg-red-100 text-red-900" : status === "Post-Check Complete" ? "bg-green-100 text-green-900" : "bg-amber-100 text-amber-900"}`}>{status}</span>;
}
export default function FacilitiesManagementPage() {
  const { club, userId, teams, canAccessFacilities } = useTeam();
  if (!canAccessFacilities) return <p>Facilities Management is not available for this account.</p>;
  return <FacilitiesWorkspace key={`${club.id}:${club.role}:${userId}`} clubId={club.id} clubName={club.name} userId={userId} teams={teams} />;
}
function FacilitiesWorkspace({ clubId, clubName, userId, teams }: { clubId: string; clubName: string; userId: string; teams: { id: string; name: string }[] }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const [date, setDate] = useState("");
  const [team, setTeam] = useState("");
  const [facility, setFacility] = useState("");
  const [status, setStatus] = useState("");
  const [exceptionsOnly, setExceptionsOnly] = useState(false);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(`/api/facility-security?clubId=${encodeURIComponent(clubId)}`, { cache: "no-store", signal });
      const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Unable to load bookings.");
      if (!signal?.aborted) { setData(result); setNow(Date.now()); setError(""); }
    } catch (e) { if (!signal?.aborted) setError((e as Error).message); }
  }, [clubId]);
  useEffect(() => {
    const controller = new AbortController();
    // refresh updates state only after the network response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh(controller.signal);
    const timer = setInterval(() => { setNow(Date.now()); void refresh(controller.signal); }, 60000);
    return () => { controller.abort(); clearInterval(timer); };
  }, [refresh]);
  const booking = data?.bookings.find(b => b.id === selected);
  const filtered = (data?.bookings ?? []).filter(b => (!date || new Date(b.startsAt).toLocaleDateString("en-CA") === date) && (!team || b.teamId === team) && (!facility || b.facility === facility) && (!status || securityStatus(b, now) === status) && (!exceptionsOnly || securityExceptions(b, now).length > 0)).sort((a, b) => {
    const priority = (b: FacilityBooking) => securityStatus(b, now) === "Lock-Up Outstanding" ? 0 : b.checks.some(c => c.issue) ? 1 : securityExceptions(b, now).includes("Missing pre-check") ? 2 : 3;
    return priority(a) - priority(b) || Math.abs(Date.parse(a.startsAt) - now) - Math.abs(Date.parse(b.startsAt) - now);
  });
  function saved(check: SecurityCheck) {
    setData(d => d ? { ...d, bookings: d.bookings.map(b => b.id === selected ? { ...b, checks: [...b.checks.filter(c => c.kind !== check.kind), check] } : b) } : d);
    setNotice(`${check.kind === "pre" ? "Opening" : "Lock-up"} check saved at ${time(check.submittedAt)}.`);
    void refresh();
  }
  return <div className="flex min-w-0 flex-col gap-6">
    <div><h1 className="font-[family-name:var(--font-heading)] text-2xl font-semibold">Facilities Management</h1><p className="text-[var(--text-secondary)]">{clubName} · Pitch bookings, opening checks and lock-up</p></div>
    {error && <div role="alert" className="panel text-red-700">{error} <button className="min-h-11 underline" onClick={() => void refresh()}>Retry</button></div>}
    {notice && <p role="status" className="rounded-xl bg-green-100 p-3 text-green-900">{notice}</p>}
    {!data && !error && <p role="status">Loading bookings…</p>}
    {data && <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[{ label: "Lock-up outstanding", count: data.bookings.filter(b => securityStatus(b, now) === "Lock-Up Outstanding").length }, { label: "Missing pre-check", count: data.bookings.filter(b => securityExceptions(b, now).includes("Missing pre-check")).length }, { label: "Bookings with issues", count: data.bookings.filter(b => b.checks.some(c => c.issue)).length }].map(item => <div className="panel" key={item.label}><strong className="text-2xl">{item.count}</strong><p>{item.label}</p></div>)}
      </div>
      {data.admin && <div className="grid items-start gap-4 lg:grid-cols-2">
        <details className="panel"><summary className="min-h-11 cursor-pointer font-semibold">Add pitch booking</summary><BookingForm clubId={clubId} teams={teams} members={data.members} onCreated={b => { setData(d => d ? { ...d, bookings: [b, ...d.bookings] } : d); setSelected(b.id); setNotice("Booking created and responsibility assigned."); }} /></details>
        <details className="panel"><summary className="min-h-11 cursor-pointer font-semibold">Configure security checklists</summary><SettingsForm key={JSON.stringify(data.checklists)} clubId={clubId} initial={data.checklists ?? DEFAULT_CHECKLISTS} onSaved={() => { setNotice("Checklists saved for new bookings. Existing bookings retain their original checklist."); void refresh(); }} /></details>
      </div>}
      <section className="panel space-y-4" aria-label="Booking filters">
        <button type="button" className="min-h-11 underline" onClick={() => void refresh()}>Refresh bookings</button>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label>Date<input className={inputClass} type="date" value={date} onChange={e => setDate(e.target.value)} /></label>
          <label>Team<select className={inputClass} value={team} onChange={e => setTeam(e.target.value)}><option value="">All teams</option>{Array.from(new Map(data.bookings.map(b => [b.teamId, b.teamName])).entries()).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
          <label>Facility<select className={inputClass} value={facility} onChange={e => setFacility(e.target.value)}><option value="">All facilities</option>{Array.from(new Set(data.bookings.map(b => b.facility))).map(f => <option key={f}>{f}</option>)}</select></label>
          <label>Security status<select className={inputClass} value={status} onChange={e => setStatus(e.target.value)}><option value="">All statuses</option>{STATUSES.map(s => <option key={s}>{s}</option>)}</select></label>
        </div>
        <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={exceptionsOnly} onChange={e => setExceptionsOnly(e.target.checked)} />Only show exceptions</label>
        <p className="text-sm">Outstanding lock-ups and reported issues appear first. Times use your device’s time zone. Reminders are shown here while you use the app.</p>
      </section>
      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <section aria-label="Pitch bookings" className="min-w-0 space-y-3">
          <h2 className="text-xl font-semibold">{data.admin ? "Club bookings" : "Your bookings"}</h2>
          {!filtered.length && <p className="panel">{data.bookings.length ? "No bookings match these filters." : data.admin ? "Add a pitch booking to assign responsibility for opening and lock-up." : "You have no assigned bookings. A club administrator can assign one to you."}</p>}
          {filtered.map(b => <button key={b.id} className={`panel block w-full space-y-2 text-left ${selected === b.id ? "ring-2 ring-[var(--accent-primary)]" : ""}`} aria-pressed={selected === b.id} onClick={() => { setSelected(b.id); setNotice(""); }}>
            <div className="font-semibold">{b.session ? `${b.session} · ` : ""}{b.teamName}</div><p>{b.facility}</p><p className="text-sm">{time(b.startsAt)} – {time(b.endsAt)}</p><p className="text-sm">Responsible: {b.responsibleName}</p><Status booking={b} now={now} />
            {securityExceptions(b, now).length > 0 && <p className="text-sm text-red-700">{securityExceptions(b, now).join(" · ")}</p>}
          </button>)}
        </section>
        {booking ? <section className="panel min-w-0 space-y-5" aria-label="Booking security">
          <div><h2 className="text-xl font-semibold">{booking.session ?? `${booking.teamName} booking`}</h2><p>{booking.facility} · {booking.teamName}</p><p className="text-sm">{time(booking.startsAt)} – {time(booking.endsAt)}</p><p>Responsible: {booking.responsibleName}</p></div>
          <Status booking={booking} now={now} />
          {securityReminder(booking, now) && <p className="rounded-xl bg-amber-50 p-3 text-amber-900" role="status">{securityReminder(booking, now)!.message}</p>}
          {securityExceptions(booking, now).length > 0 && <p className="text-sm text-red-700">{securityExceptions(booking, now).join(" · ")}</p>}
          {(["pre", "post"] as const).map(kind => {
            const check = booking.checks.find(c => c.kind === kind);
            if (check) return <AuditCheck key={`${booking.id}:${kind}`} booking={booking} check={check} />;
            const completed = booking.checks.some(c => c.kind === "post");
            const available = now >= Date.parse(booking.startsAt) - (kind === "pre" ? 3600000 : 0);
            if (completed || booking.responsibleId !== userId || !available) return <p key={kind}>{kind === "pre" ? "Opening" : "Lock-up"} check: {completed ? "not submitted" : !available ? `available ${kind === "pre" ? "one hour before the session" : "once the session starts"}` : "awaiting the responsible member"}.</p>;
            return <details key={`${booking.id}:${kind}`} open={kind === "pre" ? !booking.checks.length : booking.checks.some(c => c.kind === "pre")} className="rounded-xl border border-[var(--border-primary)] p-3">
              <summary className="min-h-11 cursor-pointer font-semibold">{kind === "pre" ? "Complete opening check" : "Complete lock-up check"}</summary>
              {kind === "post" && !booking.checks.some(c => c.kind === "pre") && <p className="my-3 text-amber-900">The opening check is missing. You can still secure the facility; the missing check will remain in the audit history.</p>}
              <CheckForm booking={booking} kind={kind} onSaved={saved} />
            </details>;
          })}
          <p className="text-xs text-[var(--text-secondary)]">Booking recorded {time(booking.createdAt)} · Audit records are read-only after submission.</p>
        </section> : <p className="panel">Choose a booking to complete its checks or review its security history.</p>}
      </div>
    </>}
  </div>;
}
function AuditCheck({ booking, check }: { booking: FacilityBooking; check: SecurityCheck }) {
  return <details className="rounded-xl border border-[var(--border-primary)] p-3" open={!!check.issue}>
    <summary className="min-h-11 cursor-pointer font-semibold">{check.kind === "pre" ? "Opening check complete" : "Lock-up check complete"} · {time(check.submittedAt)}</summary>
    <p className="my-2">Submitted by {check.userName}</p>
    <ul className="space-y-2">{booking.checklists[check.kind].map((item, i) => <li key={i}>{check.responses[i] === "issue" ? "Issue reported" : "Confirmed"}: {item}</li>)}</ul>
    {check.notes && <p className="my-3 whitespace-pre-wrap">Notes: {check.notes}</p>}
    {check.issue && <div className="my-3 rounded-xl bg-amber-50 p-3 text-amber-900"><strong>Security issue: {check.issue.type}</strong><p className="whitespace-pre-wrap">{check.issue.description}</p></div>}
    <div className="mt-3 grid grid-cols-2 gap-3">{check.photos.map(p => {
      const url = `/api/facility-security/evidence?clubId=${encodeURIComponent(booking.clubId)}&bookingId=${encodeURIComponent(booking.id)}&id=${encodeURIComponent(p.id)}`;
      return <a key={p.id} href={url} target="_blank" rel="noreferrer" className="text-sm underline"><img src={url} alt={`${p.area} evidence`} loading="lazy" className="mb-1 h-32 w-full rounded-lg object-cover" />View {p.area} photo</a>;
    })}</div>
  </details>;
}
function BookingForm({ clubId, teams, members, onCreated }: { clubId: string; teams: { id: string; name: string }[]; members: Data["members"]; onCreated: (b: FacilityBooking) => void }) {
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  return <form className="space-y-3" onSubmit={async e => {
    e.preventDefault(); const form = e.currentTarget; const fields = new FormData(form); setBusy(true); setError("");
    try { const data = Object.fromEntries(fields); data.startsAt = new Date(String(data.startsAt)).toISOString(); data.endsAt = new Date(String(data.endsAt)).toISOString(); const result = await write(clubId, "booking", data); onCreated(result.booking); form.reset(); }
    catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }}>
    <fieldset disabled={busy} className="space-y-3">
      <label className="block">Facility / pitch<input name="facility" required maxLength={160} className={inputClass} placeholder="e.g. Main pitch" /></label>
      <label className="block">Booking team<select aria-label="Booking team" name="teamId" required className={inputClass}><option value="">Choose team</option>{teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      <label className="block">Responsible person<select aria-label="Responsible person" name="responsibleId" required className={inputClass}><option value="">Choose responsible member</option>{members.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
      <label className="block">Starts<input type="datetime-local" name="startsAt" required className={inputClass} /></label>
      <label className="block">Ends<input type="datetime-local" name="endsAt" required className={inputClass} /></label>
      <p className="text-sm">Times use your device’s time zone. The responsible member will see this booking and its checks.</p>
      <button className="primary-button min-h-11">{busy ? "Creating…" : "Create booking"}</button>
    </fieldset>{error && <p role="alert" className="text-red-700">{error}</p>}
  </form>;
}
function SettingsForm({ clubId, initial, onSaved }: { clubId: string; initial: Checklists; onSaved: () => void }) {
  const [pre, setPre] = useState(initial.pre.join("\n")), [post, setPost] = useState(initial.post.join("\n"));
  const [error, setError] = useState(""), [busy, setBusy] = useState(false);
  return <form className="space-y-3" onSubmit={async e => { e.preventDefault(); setBusy(true); setError(""); try { await write(clubId, "settings", { pre: pre.split("\n").map(s => s.trim()).filter(Boolean), post: post.split("\n").map(s => s.trim()).filter(Boolean) }); onSaved(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); } }}>
    <p className="text-sm">One item per line, up to 15 per check. Changes apply to new bookings only. Facility and pitch photos are always required.</p>
    <label className="block">Opening checklist<textarea aria-label="Opening checklist" rows={5} maxLength={2500} className={inputClass} value={pre} onChange={e => setPre(e.target.value)} disabled={busy} /></label>
    <label className="block">Lock-up checklist<textarea aria-label="Lock-up checklist" rows={6} maxLength={2500} className={inputClass} value={post} onChange={e => setPost(e.target.value)} disabled={busy} /></label>
    {error && <p role="alert" className="text-red-700">{error}</p>}<button disabled={busy} className="primary-button min-h-11">{busy ? "Saving…" : "Save checklists"}</button>
  </form>;
}
