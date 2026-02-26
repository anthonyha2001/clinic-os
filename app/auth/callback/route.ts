import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { defaultLocale } from "@/i18n/config";
import { pgClient } from "@/db/index";

/**
 * Root auth callback (no locale) — used when OAuth redirect_uri is /auth/callback.
 * Syncs session and redirects to locale-aware paths. Default locale used for redirects.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? `/${defaultLocale}/scheduling`;

  if (!code) {
    return NextResponse.redirect(
      `${origin}/${defaultLocale}/auth/login?error=userNotFound`
    );
  }

  const response = NextResponse.redirect(`${origin}${next.startsWith("/") ? next : `/${next}`}`);

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(
      `${origin}/${defaultLocale}/auth/login?error=invalidCredentials`
    );
  }

  const authUserId = data?.user?.id;
  if (!authUserId) {
    return NextResponse.redirect(
      `${origin}/${defaultLocale}/auth/login?error=userNotFound`
    );
  }

  const [customUser] = await pgClient`
    SELECT id FROM users WHERE id = ${authUserId} AND is_active = true LIMIT 1
  `;

  if (!customUser) {
    await supabase.auth.signOut();
    return NextResponse.redirect(
      `${origin}/${defaultLocale}/auth/login?error=userNotFound`
    );
  }

  return response;
}
