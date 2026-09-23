import { getStore } from "@/lib/database";
export const runtime = "nodejs";
export const maxDuration = 60;

/** Public: club names only, for the pre-login request-access form's club picker. */
export async function GET() {
  const clubs = (await getStore()
    .prepare("SELECT id, name FROM clubs ORDER BY name")
    .all()) as { id: string; name: string }[];
  return Response.json(
    { clubs },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
