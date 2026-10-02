import { facilityEvidence } from "@/lib/facility-security";
import { failure, sessionUser } from "@/lib/facility-security-http";
import { z } from "zod";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const user = await sessionUser(request);
    const params = new URL(request.url).searchParams;
    const id = z.string().min(1).max(100);
    const data = await facilityEvidence(user.id, id.parse(params.get("clubId")), id.parse(params.get("bookingId")), id.parse(params.get("id")));
    const [prefix, encoded] = data.split(",");
    return new Response(Buffer.from(encoded, "base64"), { headers: {
      "Content-Type": prefix.slice(5, prefix.indexOf(";")),
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline", "Content-Security-Policy": "default-src 'none'; sandbox",
    } });
  } catch (error) { return failure(error); }
}
