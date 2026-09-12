"use client";

import { useGeo, useLocalStorage, useMe } from "@/components/hooks";
import { errorText, useToast } from "@/components/toast";
import { Button, Chip, FloatingObjects, Wordmark } from "@/components/ui";
import { api } from "@/convex/_generated/api";
import { AVAILABILITY, AVATAR_COLORS, CATEGORIES, HEARD_FROM } from "@/convex/shared";
import { reverseArea } from "@/lib/places";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

const EMOJIS = ["🌸", "🏸", "☕", "🎧", "🐙", "🦊", "🌵", "🍜", "🎮", "📷", "🛼", "🌊", "🔥", "🫐", "🐝", "🎸", "🧋", "⚡"];

function OnboardingInner() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const me = useMe();
  const router = useRouter();
  const params = useSearchParams();
  const toast = useToast();
  const geo = useGeo();
  const refStore = useLocalStorage("pap.ref");
  const complete = useMutation(api.users.completeOnboarding);

  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [handle, setHandle] = useState("");
  const [handleTouched, setHandleTouched] = useState(false);
  const [emoji, setEmoji] = useState(EMOJIS[0]);
  const [color, setColor] = useState(AVATAR_COLORS[0]);
  const [interests, setInterests] = useState<string[]>([]);
  const [availability, setAvailability] = useState<string[]>([]);
  const [area, setArea] = useState("");
  const [coordsOverride, setCoordsOverride] = useState<{ lat: number; lng: number } | null>(null);
  const [heardFrom, setHeardFrom] = useState<string>();
  const [busy, setBusy] = useState(false);

  const next = params.get("next");
  const suggested = useMemo(() => name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 16), [name]);
  const effectiveHandle = handleTouched ? handle : suggested;
  const check = useQuery(api.users.handleAvailable, effectiveHandle.length >= 3 ? { handle: effectiveHandle } : "skip");

  useEffect(() => {
    if (!isLoading && !isAuthenticated) router.replace("/signin");
  }, [isAuthenticated, isLoading, router]);

  useEffect(() => {
    if (me?.onboardedAt) router.replace(next && next !== "/onboarding" ? next : "/discover");
  }, [me, next, router]);

  // whatever the browser gives us counts, unless the person picked something themselves
  const coords = coordsOverride ?? (geo.source === "gps" ? geo.coords : null);

  async function useMyLocation() {
    const c = await geo.locate();
    if (!c) return;
    setCoordsOverride(c);
    const found = await reverseArea(c.lat, c.lng);
    if (found) setArea(found);
  }

  async function finish() {
    setBusy(true);
    try {
      await complete({
        name: name.trim(),
        handle: effectiveHandle,
        emoji,
        color,
        interests,
        availability,
        lat: coords?.lat,
        lng: coords?.lng,
        areaName: area || undefined,
        heardFrom,
        ref: refStore.get() ?? undefined,
      });
      toast("you're all set 🎉");
      router.replace(next && next !== "/onboarding" ? next : "/discover");
    } catch (e) {
      toast(errorText(e), "bad");
      setBusy(false);
    }
  }

  const steps = [
    {
      title: "sound good?",
      sub: "three things everyone on pap agrees to.",
      valid: true,
      body: (
        <ul className="space-y-3">
          {[
            ["🙋", "show up", "if you join a plan, you go. if you can't, leave it early so someone else can take the spot."],
            ["🤝", "be decent", "you're meeting real people in your neighbourhood. act like it."],
            ["☀️", "meet in public first", "coffee shops, parks, courts. save the house parties for people you know."],
          ].map(([e, t, b]) => (
            <li key={t} className="flex gap-3 rounded-card bg-white/85 p-4">
              <span className="text-2xl">{e}</span>
              <span>
                <span className="block font-extrabold tracking-tight">{t}</span>
                <span className="mt-0.5 block text-sm leading-snug text-muted">{b}</span>
              </span>
            </li>
          ))}
        </ul>
      ),
      cta: "sounds good.",
    },
    {
      title: "what should people call you?",
      sub: "your first name is plenty.",
      valid: name.trim().length > 0 && effectiveHandle.length >= 3 && check?.ok !== false,
      body: (
        <div className="space-y-3">
          <input className="field field-lg" placeholder="your name" value={name} onChange={(e) => setName(e.target.value)} autoFocus maxLength={40} />
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-lg font-bold text-faint">@</span>
            <input
              className="field field-lg pl-9"
              placeholder="handle"
              value={effectiveHandle}
              onChange={(e) => {
                setHandleTouched(true);
                setHandle(e.target.value.toLowerCase());
              }}
              maxLength={20}
            />
          </div>
          {check && effectiveHandle.length >= 3 && (
            <p className={`px-1 text-sm font-semibold ${check.ok ? "text-[#2f8f5b]" : "text-[#8f1f2d]"}`}>
              {check.ok ? `@${effectiveHandle} is yours` : check.reason}
            </p>
          )}
        </div>
      ),
    },
    {
      title: "pick your look",
      sub: "photos are optional here. you can add one later.",
      valid: true,
      body: (
        <div>
          <div className="mx-auto grid size-24 place-items-center rounded-full text-5xl shadow-soft" style={{ background: color }}>
            {emoji}
          </div>
          <div className="no-scrollbar mt-6 grid grid-cols-6 gap-2">
            {EMOJIS.map((e) => (
              <button key={e} onClick={() => setEmoji(e)} className={`grid aspect-square place-items-center rounded-2xl bg-white text-2xl ${emoji === e ? "ring-2 ring-ink" : ""}`}>
                {e}
              </button>
            ))}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {AVATAR_COLORS.map((c) => (
              <button key={c} onClick={() => setColor(c)} style={{ background: c }} className={`size-9 rounded-full ${color === c ? "ring-2 ring-ink ring-offset-2" : ""}`} aria-label="colour" />
            ))}
          </div>
        </div>
      ),
    },
    {
      title: "what do you actually do?",
      sub: "pick a few. this is what we'll surface first.",
      valid: interests.length > 0,
      body: (
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <Chip
              key={c.key}
              on={interests.includes(c.key)}
              onClick={() => setInterests((v) => (v.includes(c.key) ? v.filter((x) => x !== c.key) : v.length < 12 ? [...v, c.key] : v))}
            >
              <span>{c.emoji}</span> {c.label}
            </Chip>
          ))}
        </div>
      ),
    },
    {
      title: "when are you usually free?",
      sub: "so we don't show you 6am runs if you're a night person.",
      valid: true,
      body: (
        <div className="flex flex-wrap gap-2">
          {AVAILABILITY.map((a) => (
            <Chip key={a.key} on={availability.includes(a.key)} onClick={() => setAvailability((v) => (v.includes(a.key) ? v.filter((x) => x !== a.key) : [...v, a.key]))}>
              <span>{a.emoji}</span> {a.label}
            </Chip>
          ))}
        </div>
      ),
    },
    {
      title: "where should we look?",
      sub: "we only keep your rough area — never your exact location.",
      valid: true,
      body: (
        <div className="space-y-3">
          <Button variant="light" className="btn-block" onClick={useMyLocation} loading={geo.asking}>
            📍 use my location
          </Button>
          <input className="field field-lg" placeholder="or type your area, e.g. indiranagar" value={area} onChange={(e) => setArea(e.target.value)} />
          {coords && <p className="px-1 text-sm font-semibold text-[#2f8f5b]">got it — looking around {area || "you"}</p>}
          {geo.denied && <p className="px-1 text-xs text-muted">location is off in your browser. typing your area works just as well.</p>}
        </div>
      ),
    },
    {
      title: "here from...",
      sub: "last one, promise.",
      valid: true,
      body: (
        <div className="flex flex-col gap-2">
          {HEARD_FROM.map((h) => (
            <button
              key={h.key}
              onClick={() => setHeardFrom(h.key)}
              className={`btn ${heardFrom === h.key ? "btn-dark" : "btn-light"} btn-block justify-start`}
            >
              <span className="mr-1">{h.emoji}</span> {h.label}
            </button>
          ))}
        </div>
      ),
      cta: "let's go",
    },
  ];

  const s = steps[step];
  const last = step === steps.length - 1;

  return (
    <main className="sky relative flex min-h-dvh flex-col overflow-hidden px-6 pb-[calc(1.5rem+var(--sab))] pt-[calc(1.25rem+var(--sat))]">
      <FloatingObjects items={[["🛼", "6%", "80%", 0.4], ["🥐", "84%", "6%", 1.6]]} />
      <div className="relative z-10 flex items-center gap-3">
        {step > 0 ? (
          <button onClick={() => setStep(step - 1)} className="grid size-9 place-items-center rounded-full bg-white/80 shadow-soft" aria-label="back">
            ←
          </button>
        ) : (
          <Wordmark className="text-3xl" />
        )}
        <div className="flex flex-1 gap-1.5">
          {steps.map((_, i) => (
            <span key={i} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-ink" : "bg-white/60"}`} />
          ))}
        </div>
      </div>

      <div className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-8">
        <h1 key={step} className="animate-rise text-[clamp(2rem,9vw,2.75rem)] text-[#0d1d2e]">
          {s.title}
        </h1>
        <p className="mt-2 text-sm font-semibold text-[#1c3a58]">{s.sub}</p>
        <div className="mt-7">{s.body}</div>
      </div>

      <div className="relative z-10 mx-auto w-full max-w-md">
        <Button
          size="lg"
          className="btn-block"
          disabled={!s.valid}
          loading={busy}
          onClick={() => (last ? finish() : setStep(step + 1))}
        >
          {s.cta ?? "next"}
        </Button>
      </div>
    </main>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div className="sky min-h-dvh" />}>
      <OnboardingInner />
    </Suspense>
  );
}
