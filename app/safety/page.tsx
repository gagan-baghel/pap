import { Wordmark } from "@/components/ui";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "safety on pap",
  description: "How PAP keeps meeting new people in real life safe: public meeting points, location privacy, reporting, blocking and moderation.",
};

const SECTIONS: [string, string, string[]][] = [
  [
    "🌞",
    "meet in public, at least the first time",
    [
      "cafés, parks, courts, gyms, bars — places with other people around.",
      "hosts can hide the exact meeting point until you actually join, so a private address is never sitting on a public page.",
      "if a plan asks you to come to someone's home and you've never met them, you're allowed to say no. report it if it feels off.",
    ],
  ],
  [
    "📍",
    "your location stays yours",
    [
      "we store your home area rounded to about a kilometre — never your precise position.",
      "your live location is used on your device to sort what's nearby. it isn't saved.",
      "“i'm free now” is visible only to people you're friends with, and only until your timer runs out.",
    ],
  ],
  [
    "👥",
    "tell someone where you're going",
    [
      "every plan has a share link. send it to a friend — they'll see what it is, where and when.",
      "on any plan you've joined there's a one-tap “share with a friend” button for exactly this.",
    ],
  ],
  [
    "✅",
    "trust signals, not popularity",
    [
      "profiles show how many plans someone has actually done and how often they turn up — after enough history to mean something.",
      "hosts see the same about you. there are no follower counts to farm, which removes most of the reason to fake a profile.",
      "a ✅ marks a host we've verified runs real, recurring plans.",
    ],
  ],
  [
    "💬",
    "strangers can't message you out of nowhere",
    [
      "by default, direct messages open only after you've been on a plan together. you can narrow that to friends only, or turn dms off entirely, in settings.",
      "plan chats are visible only to the people who are in.",
    ],
  ],
  [
    "🚩",
    "reporting and blocking",
    [
      "report any plan, profile or message from its page — it takes two taps and a person reviews it.",
      "when several people report the same plan, it's paused automatically while we look.",
      "blocking is immediate and mutual: you disappear from each other's discovery, plans and messages.",
      "hosts can remove anyone from a plan, and people who repeatedly don't turn up carry that on their profile.",
    ],
  ],
];

export default function SafetyPage() {
  return (
    <main className="min-h-dvh">
      <header className="sky px-6 pb-14 pt-[calc(1.5rem+var(--sat))]">
        <Link href="/">
          <Wordmark className="text-4xl" />
        </Link>
        <h1 className="mt-8 text-[clamp(2rem,9vw,3rem)] text-[#0d1d2e]">meeting people, carefully</h1>
        <p className="mt-3 max-w-md text-[15px] font-medium leading-relaxed text-[#17324d]">
          pap puts you in a room with people you don't know yet. that's the point — and it's why these are not afterthoughts.
        </p>
      </header>

      <div className="mx-auto max-w-2xl space-y-4 px-5 py-10">
        {SECTIONS.map(([emoji, title, points]) => (
          <section key={title} className="card p-5">
            <div className="text-2xl">{emoji}</div>
            <h2 className="mt-2 text-2xl">{title}</h2>
            <ul className="mt-3 space-y-2">
              {points.map((p) => (
                <li key={p} className="flex gap-2 text-sm leading-relaxed text-muted">
                  <span aria-hidden>·</span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </section>
        ))}

        <section className="rounded-card bg-ink p-5 text-white">
          <h2 className="text-2xl">if you're in danger</h2>
          <p className="mt-2 text-sm leading-relaxed text-white/75">
            contact your local emergency services first. pap is not an emergency service. once you're safe, report the person or plan here — reports
            go to a human, and we act on them.
          </p>
        </section>

        <p className="px-1 pt-4 text-center text-xs text-muted">
          questions about a report you filed? reply to the notification in your inbox and a moderator will pick it up.
        </p>
        <div className="flex justify-center pt-2">
          <Link href="/discover" className="btn btn-dark">
            back to pap
          </Link>
        </div>
      </div>
    </main>
  );
}
