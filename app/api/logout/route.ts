export async function POST() {
  return Response.json({ error: "Use /api/auth/sign-out" }, { status: 410 });
}
