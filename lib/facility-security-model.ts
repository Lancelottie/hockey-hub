import { z } from "zod";

export const ISSUE_TYPES = ["Already unlocked", "Unable to secure access", "Damage", "People remaining onsite", "Equipment not secured", "Other"] as const;
export const DEFAULT_CHECKLISTS = {
  pre: ["Changing rooms checked", "Facility/access points checked", "Existing security issues checked and reported", "Facility appropriately opened/unlocked"],
  post: ["Changing rooms checked and empty", "Facility checked for remaining users", "Equipment/items secured", "Doors/access points secured", "Facility locked", "Issues or damage checked and reported"],
};
const label = z.string().trim().min(1).max(160);
export const checklistSchema = z.object({
  pre: z.array(label).min(1).max(15), post: z.array(label).min(1).max(15),
}).strict().refine(v => new Set(v.pre).size === v.pre.length && new Set(v.post).size === v.post.length, "Checklist items must be unique.");
export type Checklists = z.infer<typeof checklistSchema>;
export const bookingSchema = z.object({
  facility: label, session: label.optional(), teamId: z.string().min(1).max(100), responsibleId: z.string().min(1).max(100),
  startsAt: z.iso.datetime().transform(value => new Date(value).toISOString()), endsAt: z.iso.datetime().transform(value => new Date(value).toISOString()),
}).strict().refine(v => Date.parse(v.endsAt) > Date.parse(v.startsAt), "End time must be after start time.");
export const checkSchema = z.object({
  kind: z.enum(["pre", "post"]),
  responses: z.array(z.enum(["confirmed", "issue"])).min(1).max(15),
  notes: z.string().trim().max(3000),
  issue: z.object({ type: z.enum(ISSUE_TYPES), description: z.string().trim().min(1).max(3000) }).strict().nullable(),
  photos: z.array(z.object({ area: z.enum(["facility", "pitch", "issue"]), data: z.string().min(1).max(950000) }).strict()).min(2).max(3),
}).strict();
export type CheckInput = z.infer<typeof checkSchema>;
export type SecurityCheck = {
  id: string; kind: "pre" | "post"; userId: string; userName: string; submittedAt: string;
  responses: CheckInput["responses"]; notes: string; issue: CheckInput["issue"];
  photos: { id: string; area: "facility" | "pitch" | "issue" }[];
};
export type FacilityBooking = z.infer<typeof bookingSchema> & {
  id: string; clubId: string; teamName: string; responsibleName: string; createdAt: string; createdBy: string;
  checklists: Checklists; checks: SecurityCheck[];
};
export const STATUSES = ["Not Started", "Pre-Check Complete", "Session in Progress", "Post-Check Complete", "Lock-Up Outstanding"] as const;
export function securityStatus(booking: FacilityBooking, now = Date.now()): typeof STATUSES[number] {
  if (booking.checks.some(c => c.kind === "post")) return "Post-Check Complete";
  if (now >= Date.parse(booking.endsAt)) return "Lock-Up Outstanding";
  if (booking.checks.some(c => c.kind === "pre")) return now >= Date.parse(booking.startsAt) ? "Session in Progress" : "Pre-Check Complete";
  return "Not Started";
}
export function securityExceptions(booking: FacilityBooking, now = Date.now()) {
  const pre = booking.checks.find(c => c.kind === "pre");
  const post = booking.checks.find(c => c.kind === "post");
  return [
    ...(securityStatus(booking, now) === "Lock-Up Outstanding" ? ["Lock-Up Outstanding"] : []),
    ...(!pre && now >= Date.parse(booking.startsAt) ? ["Missing pre-check"] : []),
    ...(pre && Date.parse(pre.submittedAt) > Date.parse(booking.startsAt) ? ["Late pre-check"] : []),
    ...(post && Date.parse(post.submittedAt) > Date.parse(booking.endsAt) ? ["Late lock-up"] : []),
    ...(booking.checks.some(c => c.issue) ? ["Security issue reported"] : []),
  ];
}
// Stable keys and due times can also be consumed by a future notification dispatcher.
export function securityReminder(booking: FacilityBooking, now = Date.now()) {
  if (booking.checks.some(c => c.kind === "post")) return null;
  const end = Date.parse(booking.endsAt), start = Date.parse(booking.startsAt);
  const state = now >= end + 30 * 60000 ? "outstanding" : now >= end ? "session-end" : !booking.checks.some(c => c.kind === "pre") && now >= start - 30 * 60000 ? "before-session" : null;
  if (!state) return null;
  return {
    key: `${booking.id}:${state}`, recipientId: booking.responsibleId, state,
    dueAt: new Date(state === "outstanding" ? end + 30 * 60000 : state === "session-end" ? end : start - 30 * 60000).toISOString(),
    message: state === "outstanding" ? "Lock-up confirmation is still outstanding for this booking." : state === "session-end" ? "Your session has finished. Please complete the facility lock-up check." : "Your pitch booking starts shortly. Please complete the facility pre-check when you arrive.",
  };
}
