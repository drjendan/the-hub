"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";

  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);
    const supabase = createClient();

    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName || email.split("@")[0] } },
        });
        if (error) {
          setError(error.message);
          return;
        }
        // If email confirmation is OFF, a session is returned immediately.
        if (data.session) {
          router.replace(next);
          router.refresh();
          return;
        }
        setNotice(
          "Account created. Check your email to confirm your address, then sign in."
        );
        setMode("signin");
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setError(error.message);
        return;
      }
      router.replace(next);
      router.refresh();
    } catch {
      setError("Something went wrong. Is Supabase configured?");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen grid place-items-center px-6 py-12">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2.5 mb-7">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-ink text-paper text-lg">⬡</div>
          <div className="leading-tight">
            <div className="display text-[17px] font-semibold">Agent Hub</div>
            <div className="text-[11px] text-ink-soft tracking-wide">ENTERPRISE</div>
          </div>
        </div>

        <div className="card p-6">
          <h1 className="display text-[22px] font-semibold leading-none">
            {mode === "signin" ? "Sign in" : "Create your account"}
          </h1>
          <p className="mt-2 text-[13px] text-ink-soft">
            {mode === "signin"
              ? "Welcome back. Sign in to your workspace."
              : "Sign up with your work email and a password."}
          </p>

          <form onSubmit={submit} className="mt-5 space-y-3">
            {mode === "signup" && (
              <Field label="Full name">
                <input
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Jordan Lee"
                  className="w-full rounded-lg border hairline bg-white px-3 py-2.5 outline-none focus:border-accent"
                />
              </Field>
            )}
            <Field label="Email">
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                className="w-full rounded-lg border hairline bg-white px-3 py-2.5 outline-none focus:border-accent"
              />
            </Field>
            <Field label="Password">
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border hairline bg-white px-3 py-2.5 outline-none focus:border-accent"
              />
            </Field>

            {error && <p className="text-[12px] text-rust">{error}</p>}
            {notice && <p className="text-[12px] text-moss">{notice}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-ink py-2.5 text-[14px] font-medium text-paper hover:bg-ink-soft disabled:opacity-40 transition-colors"
            >
              {loading ? "Working…" : mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          <div className="mt-4 text-center text-[13px] text-ink-soft">
            {mode === "signin" ? (
              <>
                No account?{" "}
                <button onClick={() => { setMode("signup"); setError(null); setNotice(null); }} className="text-accent hover:underline">
                  Sign up
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button onClick={() => { setMode("signin"); setError(null); setNotice(null); }} className="text-accent hover:underline">
                  Sign in
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-medium text-ink-soft">{label}</span>
      {children}
    </label>
  );
}
