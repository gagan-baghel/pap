"use client";

import PlanCard from "@/components/PlanCard";
import { FloatingObjects, Wordmark } from "@/components/ui";
import { useNow } from "@/components/hooks";
import { api } from "@/convex/_generated/api";
import { useConvexAuth, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

const OBJECTS: [string, string, string, number][] = [
  ["🏸", "12%", "8%", 0],
  ["☕", "68%", "6%", 1.2],
  ["🎾", "18%", "82%", 0.6],
  ["🍜", "74%", "80%", 1.8],
  ["🎧", "44%", "88%", 2.4],
  ["⚽", "84%", "42%", 0.9],
  ["📷", "8%", "58%", 1.5],
];

export default function Landing() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const router = useRouter();
  const featured = useQuery(api.plans.featured, {});
  const now = useNow();

  useEffect(() => {
    if (!isLoading && isAuthenticated) router.replace("/discover");
  }, [isAuthenticated, isLoading, router]);

  return (
    <main className="min-h-dvh">
      <section className="sky relative flex min-h-[100dvh] flex-col items-center justify-center overflow-hidden px-6 text-center">
        <FloatingObjects items={OBJECTS} />
        <div className="relative z-10 flex flex-col items-center">
          <Wordmark className="text-[clamp(5rem,26vw,13rem)]" />
          <p className="mt-6 max-w-md text-[clamp(1.6rem,6vw,2.4rem)] font-extrabold leading-[1.05] tracking-tight text-[#10243a] lowercase">
            post a plan.
            <br />
            people show up.
          </p>
          <p className="mt-4 max-w-sm text-[15px] font-medium leading-relaxed text-[#17324d]">
            badminton at 7. coffee in twenty minutes. dinner on saturday. put it up, and whoever's nearby and free can join in one tap.
          </p>
          <div className="mt-8 flex w-full max-w-xs flex-col gap-3">
            <Link href="/signin?new=1" className="btn btn-dark btn-lg btn-block">
              get started
            </Link>
            <Link href="/signin" className="btn btn-light btn-block">
              i already have an account
            </Link>
          </div>
          <p className="mt-5 text-xs font-semibold text-[#2a4a6b]">
            free · no feed · no followers
          </p>
        </div>
        <a href="#live" className="absolute bottom-8 z-10 text-2xl" aria-label="see what's happening">
          ↓
        </a>
      </section>

      <section id="live" className="haze px-5 py-16">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-3xl">happening right now</h2>
          <p className="mt-2 text-sm text-muted">real plans on PAP. tap one to see it — you only need an account to join.</p>
          <div className="mt-6 space-y-3">
            {featured === undefined ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="card h-24 animate-pulse" />
                ))}
              </div>
            ) : featured.length === 0 ? (
              <div className="card p-6 text-center">
                <p className="text-lg font-bold">nothing is up right now.</p>
                <p className="mt-1 text-sm text-muted">be the first — post something for tonight.</p>
              </div>
            ) : (
              featured.map((c) => <PlanCard key={c._id} card={c} now={now} />)
            )}
          </div>
        </div>
      </section>

      <section className="bg-white px-5 py-20">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-3xl">the group chat problem</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-card bg-paper p-5">
              <p className="label mb-3">without pap</p>
              <div className="space-y-2 text-sm">
                {["anyone free tonight?", "maybe, what's the plan", "idk, movie?", "which one", "where tho", "who all coming", "we'll decide later"].map((m, i) => (
                  <p key={i} className={`w-fit max-w-[85%] rounded-2xl px-3 py-2 ${i % 2 ? "ml-auto bg-white" : "bg-[#e8ecf3]"}`}>
                    {m}
                  </p>
                ))}
                <p className="pt-2 text-center text-xs font-bold text-muted">…nobody went anywhere</p>
              </div>
            </div>
            <div className="rounded-card bg-ink p-5 text-white">
              <p className="label mb-3 text-white/60">with pap</p>
              <div className="rounded-2xl bg-white p-4 text-ink">
                <p className="display text-xl">late show, whatever's good</p>
                <p className="mt-1 text-sm text-muted">tonight 9:30pm · PVR Forum · 1.2 km</p>
                <p className="mt-1 text-sm text-muted">3 spots · ₹400</p>
                <div className="btn btn-dark mt-3 w-full">i'm in</div>
              </div>
              <p className="mt-4 text-sm text-white/70">one plan. one tap. everyone knows where to be.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="haze px-5 py-20">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-3xl">how it works</h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {[
              ["👀", "see", "what's on near you in the next hour, tonight, or this weekend — sorted by what you're actually into."],
              ["✋", "join", "one tap. you get the exact spot, the group chat, and a reminder an hour before."],
              ["🤝", "meet", "you show up. that's the whole product. no posting about it afterwards."],
            ].map(([e, t, b]) => (
              <div key={t} className="card p-5">
                <div className="text-3xl">{e}</div>
                <h3 className="mt-3 text-2xl">{t}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{b}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-white px-5 py-20">
        <div className="mx-auto max-w-2xl">
          <h2 className="text-3xl">built for meeting strangers, carefully</h2>
          <ul className="mt-6 space-y-3">
            {[
              ["📍", "the exact spot is yours to share", "hosts can keep the meeting point hidden until someone actually joins. we never store your precise location."],
              ["✅", "reliability, not popularity", "profiles show how often someone turns up — not how many followers they have."],
              ["🛡️", "report, block, and real moderation", "plans get paused automatically when several people flag them. no follower counts to farm, so there's little to spam for."],
              ["💬", "dms unlock after a plan", "strangers can't slide into your messages. you talk in the plan chat first."],
            ].map(([e, t, b]) => (
              <li key={t} className="flex gap-4 rounded-card bg-paper p-5">
                <span className="text-2xl">{e}</span>
                <span>
                  <span className="block text-lg font-extrabold tracking-tight">{t}</span>
                  <span className="mt-1 block text-sm leading-relaxed text-muted">{b}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="sky relative overflow-hidden px-6 py-24 text-center">
        <FloatingObjects items={[["🥾", "14%", "10%", 0], ["🍸", "70%", "84%", 1], ["📚", "20%", "80%", 2]]} />
        <div className="relative z-10 mx-auto max-w-md">
          <Wordmark className="text-7xl" />
          <p className="mt-5 text-2xl font-extrabold tracking-tight text-[#10243a] lowercase">what are you doing today?</p>
          <Link href="/signin?new=1" className="btn btn-dark btn-lg mt-7 w-full max-w-xs">
            post your first plan
          </Link>
        </div>
      </section>

      <footer className="bg-ink px-6 py-10 text-center text-xs text-white/50">
        <p>PAP — social networking for things you actually do.</p>
        <p className="mt-2">made for one city at a time.</p>
        <p className="mt-4 flex justify-center gap-4">
          <Link href="/safety" className="underline underline-offset-4 hover:text-white">
            safety
          </Link>
          <Link href="/privacy" className="underline underline-offset-4 hover:text-white">
            privacy
          </Link>
        </p>
      </footer>
    </main>
  );
}
