import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { pgClient } from "@/db/index";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ locale: string }> }
) {
  const { locale } = await params;
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? `/${locale}/scheduling`;

  if (!code) {
    return NextResponse.redirect(
      `${origin}/${locale}/auth/login?error=userNotFound`
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
    return NextResponse.redirect(`${origin}/${locale}/auth/login?error=invalidCredentials`);
  }

  const authUserId = data?.user?.id;
  if (!authUserId) {
    return NextResponse.redirect(`${origin}/${locale}/auth/login?error=userNotFound`);
  }

  // Verify custom user exists (sync check — users are created by admin)
  const [customUser] = await pgClient`
    SELECT id FROM users WHERE id = ${authUserId} AND is_active = true LIMIT 1
  `;

  if (!customUser) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/${locale}/auth/login?error=userNotFound`);
  }

  return response;
}
