"use client";
import { useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function SessionRefresher() {
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    // Refresh session immediately on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        supabase.auth.refreshSession();
      }
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === "TOKEN_REFRESHED") {
          // Token refreshed successfully
        }
        if (event === "SIGNED_OUT") {
          window.location.href = "/auth/login";
        }
      }
    );

    // Proactively refresh every 10 minutes
    const interval = setInterval(async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        const expiresAt = session.expires_at ?? 0;
        const now = Math.floor(Date.now() / 1000);
        // Refresh if expiring in less than 10 minutes
        if (expiresAt - now < 600) {
          await supabase.auth.refreshSession();
        }
      }
    }, 60_000); // Check every minute

    return () => {
      subscription.unsubscribe();
      clearInterval(interval);
    };
  }, []);

  return null;
}
