import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";
// Navigation optimisation only. Layout and every data endpoint verify a live session.
export function proxy(request: NextRequest) {
  if (!getSessionCookie(request))
    return NextResponse.redirect(new URL("/login", request.url));
  return NextResponse.next();
}
export const config = {
  matcher: [
    "/",
    "/change-password/:path*",
    "/sections/:path*",
    "/home/:path*",
    "/my-team/:path*",
    "/teams/:path*",
    "/squads/:path*",
    "/fixtures/:path*",
    "/squad-selection/:path*",
    "/admin/:path*",
  ],
};
