import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export default auth((req) => {
  const { nextUrl } = req;
  const isLoggedIn = !!req.auth?.user;

  const isAuthApiRoute = nextUrl.pathname.startsWith("/api/auth");
  const isCronApiRoute = nextUrl.pathname.startsWith("/api/notifications/check");
  // Mobile API routes authenticate via bearer access tokens and must
  // return JSON 401s — never redirect to the ERP login page.
  const isMobileApiRoute = nextUrl.pathname.startsWith("/api/mobile/");
  const isLoginPage = nextUrl.pathname === "/login";
  const isRegisterPage = nextUrl.pathname === "/register";
  const isPublicAsset =
    nextUrl.pathname.startsWith("/_next") ||
    nextUrl.pathname.startsWith("/static") ||
    nextUrl.pathname === "/favicon.ico";

  if (isPublicAsset || isAuthApiRoute || isMobileApiRoute || isLoginPage || isRegisterPage || isCronApiRoute) {
    return NextResponse.next();
  }

  if (!isLoggedIn) {
    return NextResponse.redirect(new URL("/login", nextUrl));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // Everything except framework assets and site images.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg)).*)",
    // Uploaded module documents always require a session — including
    // image extensions the pattern above would otherwise skip.
    "/uploads/:path*",
  ],
};

