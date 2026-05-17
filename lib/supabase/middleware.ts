import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { ROUTES } from "@/lib/routes";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Session'ı yenile; getUser() çağrısı kritik — kaldırma.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;
  const isProtectedPath =
    pathname === ROUTES.DASHBOARD || pathname.startsWith(`${ROUTES.DASHBOARD}/`);
  const isLoginPath = pathname === ROUTES.LOGIN;
  const isRootPath = pathname === ROUTES.HOME;

  // Route guard
  if (isProtectedPath && !user) {
    return NextResponse.redirect(new URL(ROUTES.LOGIN, request.url));
  }
  if (isLoginPath && user) {
    return NextResponse.redirect(new URL(ROUTES.DASHBOARD, request.url));
  }
  if (isRootPath) {
    return NextResponse.redirect(
      new URL(user ? ROUTES.DASHBOARD : ROUTES.LOGIN, request.url),
    );
  }

  // FR-010 / R-007: Korumalı path'lerde tarayıcı cache'i engellenir
  // (çıkış sonrası geri tuşuyla korumalı içerik gösterilmesin)
  if (isProtectedPath) {
    supabaseResponse.headers.set(
      "Cache-Control",
      "no-store, no-cache, must-revalidate",
    );
  }

  return supabaseResponse;
}
