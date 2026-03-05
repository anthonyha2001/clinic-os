"use client";

import { useEffect } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

/**
 * SessionKeeper — mounts once in the app shell.
 * Listens for Supabase auth state changes and token refreshes.
 * When the token is refreshed, Supabase SSR automatically updates
 * the cookie via the middleware. This component ensures the refresh
 * event is triggered client-side so the server never sees a stale token.
 */
export function SessionKeeper() {
  useEffect(() => {
    const supabase = createSupabaseBrowserClient();

    // Listen for auth events — TOKEN_REFRESHED keeps cookie fresh
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "TOKEN_REFRESHED") {
        // Token was refreshed — cookie is now updated automatically
        // No action needed, just keeping the listener alive
      }
      if (event === "SIGNED_OUT") {
        // Redirect to login on explicit sign out
        window.location.href = "/auth/login";
      }
    });

    // Proactively refresh session every 45 minutes
    // (token expires at 60min — this gives 15min buffer)
    const refreshInterval = setInterval(async () => {
      const { error } = await supabase.auth.refreshSession();
      if (error) {
        // Session is truly expired — redirect to login
        window.location.href = "/auth/login";
      }
    }, 45 * 60 * 1000); // 45 minutes

    return () => {
      subscription.unsubscribe();
      clearInterval(refreshInterval);
    };
  }, []);

  return null; // renders nothing
}
