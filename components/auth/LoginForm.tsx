"use client";

import { useState } from "react";
import { createBrowserClient } from "@supabase/ssr";

interface LoginFormProps {
  errorParam?: string;
}

export function LoginForm({ errorParam }: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(errorParam ?? null);
  const [loading, setLoading] = useState(false);
  const [debug, setDebug] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDebug(null);
    setLoading(true);

    const SUPABASE_URL = "https://fbejbbcsapsrugptefgy.supabase.co";
    const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZiZWpiYmNzYXBzcnVncHRlZmd5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzEyMjkzMTAsImV4cCI6MjA4NjgwNTMxMH0.Tb9KkYACtqq8RE6w50YoydV7ZQMErvGPbYUyprelK0c";

    setDebug(`URL: ${SUPABASE_URL} | Email: ${email.trim()} | Pass length: ${password.length}`);

    const supabase = createBrowserClient(SUPABASE_URL, SUPABASE_ANON_KEY);

    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });

    if (signInError) {
      setError(`Error: ${signInError.message} (${signInError.status})`);
      setLoading(false);
      return;
    }

    if (data?.session) {
      setDebug(`✅ Login success! User: ${data.user?.email}`);
      // Redirect after short delay so we can see the success message
      setTimeout(() => {
        window.location.href = "/en/scheduling";
      }, 1000);
    }
  }

  return (
    <div className="space-y-6">
      {debug && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-xs text-blue-800 break-all">
          {debug}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="email" className="block text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          autoFocus
          className="mt-2 w-full rounded-lg border px-4 py-3 focus:outline-none focus:ring-2"
        />
      </div>

      <div>
        <label htmlFor="password" className="block text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          className="mt-2 w-full rounded-lg border px-4 py-3 focus:outline-none focus:ring-2"
        />
      </div>

      <button
        type="button"
        onClick={handleSubmit}
        disabled={loading}
        className="w-full rounded-lg bg-blue-600 px-4 py-3 font-medium text-white hover:bg-blue-700 disabled:opacity-60"
      >
        {loading ? "Signing in..." : "Sign In"}
      </button>
    </div>
  );
}