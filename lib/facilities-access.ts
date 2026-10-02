/** Temporary account-only rollout. Evaluate on the server, never from a client-supplied identity. */
export function canAccessFacilities(email: string) {
  const owner = process.env.FACILITIES_OWNER_EMAIL ?? "lottiew51@icloud.com";
  return !!owner.trim() && email.trim().toLowerCase() === owner.trim().toLowerCase();
}
