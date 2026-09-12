"use client";

import { useLocalStorage } from "@/components/hooks";
import { errorText, useToast } from "@/components/toast";
import { Button, FloatingObjects, Wordmark } from "@/components/ui";
import { useAuthActions } from "@convex-dev/auth/react";
import { useConvexAuth } from "convex/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

type Mode = "signUp" | "signIn" | "reset";

function SignInInner() {
  const { signIn } = useAuthActions();
  const { isAuthenticated } = useConvexAuth();
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const ref = useLocalStorage("pap.ref");
  const next = params.get("next") || "/discover";
  const [mode, setMode] = useState<Mode>(params.get("new") ? "signUp" : "signIn");
  const [sentCode, setSentCode] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (params.get("ref")) ref.set(params.get("ref")!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isAuthenticated) router.replace(next === "/" ? "/discover" : next);
  }, [isAuthenticated, next, router]);

  const go = () => router.replace(next === "/" ? "/discover" : next);

  // development shortcut — see convex/devauth.ts. The production path is untouched.
  async function devLogin(handle?: string) {
    setBusy(true);
    setError(null);
    try {
      await signIn("dev", handle ? { handle } : {});
      go();
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "reset" && !sentCode) {
        await signIn("password", { email: email.trim(), flow: "reset" });
        setSentCode(true);
        toast("check your email for a code");
      } else if (mode === "reset") {
        await signIn("password", { email: email.trim(), code: code.trim(), newPassword: password, flow: "reset-verification" });
        toast("password changed — you're in");
        go();
      } else {
        await signIn("password", { email: email.trim(), password, flow: mode });
        toast(mode === "signUp" ? "welcome to pap 👋" : "welcome back");
        go();
      }
    } catch (err) {
      const msg = errorText(err);
      if (mode === "signIn" && msg.includes("something went wrong")) setError("that email and password don't match");
      else if (mode === "reset" && sentCode && msg.includes("something went wrong")) setError("that code didn't work — check it, or send a new one");
      else setError(msg);
    } finally {
      setBusy(false);
    }
  }

  const heading = mode === "signUp" ? "let's get you in" : mode === "reset" ? (sentCode ? "check your email" : "reset your password") : "welcome back";
  const sub =
    mode === "signUp"
      ? "email and a password. that's the whole signup."
      : mode === "reset"
        ? sentCode
          ? `we sent a code to ${email}. it's good for 15 minutes.`
          : "we'll email you a code to set a new one."
        : "pick up where you left off.";

  return (
    <main className="sky relative flex min-h-dvh flex-col overflow-hidden px-6 pb-10 pt-[calc(1.5rem+var(--sat))]">
      <FloatingObjects items={[["🏸", "8%", "78%", 0], ["☕", "72%", "8%", 1.4], ["🎾", "86%", "72%", 0.8]]} />
      <Link href="/" className="relative z-10 w-fit">
        <Wordmark className="text-4xl" />
      </Link>

      <div className="relative z-10 flex flex-1 flex-col justify-center">
        <h1 className="text-[clamp(2.2rem,10vw,3rem)] text-[#0d1d2e]">{heading}</h1>
        <p className="mt-2 text-sm font-semibold text-[#1c3a58]">{sub}</p>

        <form onSubmit={submit} className="mt-7 space-y-3">
          <input
            className="field field-lg"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            placeholder="you@email.com"
            value={email}
            disabled={mode === "reset" && sentCode}
            onChange={(e) => setEmail(e.target.value)}
          />

          {mode === "reset" && sentCode && (
            <input
              className="field field-lg tracking-[0.3em]"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              maxLength={8}
              placeholder="8-digit code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            />
          )}

          {(mode !== "reset" || sentCode) && (
            <input
              className="field field-lg"
              type="password"
              autoComplete={mode === "signIn" ? "current-password" : "new-password"}
              required
              minLength={8}
              placeholder={mode === "signIn" ? "your password" : "create a password (8+ characters)"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          )}

          {error && <p className="px-1 text-sm font-semibold text-[#8f1f2d]">{error}</p>}

          <Button type="submit" size="lg" className="btn-block" loading={busy}>
            {mode === "signUp" ? "create my account" : mode === "reset" ? (sentCode ? "set my new password" : "email me a code") : "enter"}
          </Button>
        </form>

        <div className="mt-5 flex flex-col items-start gap-2">
          {mode === "signIn" && (
            <button
              type="button"
              onClick={() => {
                setMode("reset");
                setSentCode(false);
                setPassword("");
                setError(null);
              }}
              className="text-sm font-bold text-[#14324e] underline underline-offset-4"
            >
              forgot your password?
            </button>
          )}
          {mode === "reset" && sentCode && (
            <button
              type="button"
              onClick={() => {
                setSentCode(false);
                setCode("");
                setError(null);
              }}
              className="text-sm font-bold text-[#14324e] underline underline-offset-4"
            >
              send a different code
            </button>
          )}
          <button
            type="button"
            onClick={() => {
              setMode(mode === "signUp" ? "signIn" : "signUp");
              setSentCode(false);
              setError(null);
            }}
            className="text-sm font-bold text-[#14324e] underline underline-offset-4"
          >
            {mode === "signUp" ? "i already have an account" : mode === "reset" ? "back to signing in" : "i'm new here — create an account"}
          </button>
        </div>

        {process.env.NEXT_PUBLIC_ALLOW_DEV_LOGIN === "true" && (
          <div className="mt-8 rounded-card bg-white/80 p-4">
            <p className="label">dev mode · no password</p>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              drop straight in as someone who already lives here — plans, friends, chats and history included.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {[
                { handle: "aanya", label: "🌸 aanya" },
                { handle: "rohan", label: "🏸 rohan" },
                { handle: "tara", label: "🏃 tara (host)" },
                { handle: "meera", label: "📚 meera" },
              ].map((p) => (
                <Button key={p.handle} size="sm" variant="light" loading={busy} onClick={() => devLogin(p.handle)}>
                  {p.label}
                </Button>
              ))}
            </div>
            <Button size="sm" variant="ghost" className="mt-2" loading={busy} onClick={() => devLogin()}>
              🧪 brand new account (runs onboarding)
            </Button>
          </div>
        )}

        <p className="mt-8 max-w-xs text-xs leading-relaxed text-[#26455f]">
          by continuing you agree to keep PAP a decent place: show up when you say you will, and treat people the way you'd want to be treated.{" "}
          <Link href="/safety" className="underline underline-offset-2">
            safety
          </Link>{" "}
          ·{" "}
          <Link href="/privacy" className="underline underline-offset-2">
            privacy
          </Link>
        </p>
      </div>
    </main>
  );
}

export default function SignInPage() {
  return (
    <Suspense fallback={<div className="sky min-h-dvh" />}>
      <SignInInner />
    </Suspense>
  );
}
