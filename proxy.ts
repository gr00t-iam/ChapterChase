import { NextResponse, type NextRequest } from "next/server";

const sessionCookie = "chapterchase_session";
const roleCookie = "chapterchase_role";

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(request.cookies.get(sessionCookie)?.value);
  const role = request.cookies.get(roleCookie)?.value;
  const isApi = pathname.startsWith("/api/");
  const adminOnly = isAdminOnlyPath(pathname);

  if (!hasSession) {
    if (isApi) {
      return Response.json({ error: "Authentication required." }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (adminOnly && role && role.toUpperCase() !== "ADMIN") {
    if (isApi) {
      return Response.json({ error: "Administrator access required." }, { status: 403 });
    }
    return NextResponse.redirect(new URL("/", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/admin/:path*",
    "/preferences/library-folders",
    "/preferences/duplicates",
    "/api/admin/:path*",
    "/api/media-folders/:path*",
  ],
};

function isAdminOnlyPath(pathname: string) {
  return (
    pathname.startsWith("/admin") ||
    pathname === "/preferences/library-folders" ||
    pathname === "/preferences/duplicates" ||
    pathname.startsWith("/api/admin") ||
    pathname.startsWith("/api/media-folders")
  );
}
