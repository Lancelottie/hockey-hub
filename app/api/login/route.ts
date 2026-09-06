export async function POST() {
  return Response.json(
    { error: "Use /api/auth/sign-in/email" },
    { status: 410 },
  );
}
