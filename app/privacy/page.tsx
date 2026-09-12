import { Wordmark } from "@/components/ui";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "privacy on pap",
  description: "What PAP stores, what it deliberately doesn't, and how to get rid of all of it.",
};

const SECTIONS: [string, string[]][] = [
  [
    "what we store",
    [
      "your email (to sign you in) and your profile: name, handle, photo or emoji, bio, what you're into, when you're usually free.",
      "your home area, rounded to roughly a kilometre. that's the only location we keep.",
      "the plans you host or join, who came, your messages, and the reports you file.",
      "a small event log — plan created, plan joined, feedback given — so we can tell whether the product is actually helping people meet.",
    ],
  ],
  [
    "what we don't store",
    [
      "your precise location. it's read on your device to sort what's nearby, and it is never sent to us or saved.",
      "your contacts, your calendar, your photo library.",
      "any payment details — pap doesn't take money.",
      "advertising identifiers. there is no ad network in this product.",
    ],
  ],
  [
    "who can see what",
    [
      "your profile, the plans you host publicly, and how reliably you turn up are visible to other people on pap.",
      "the exact meeting point of a plan is visible to people who joined it — or to everyone, if the host chose that.",
      "“i'm free now” is visible only to mutual friends, only while the timer runs.",
      "plan chats are visible only to the people in that plan. direct messages are visible only to the two of you.",
      "post-plan feedback is private. the person you rated never sees it.",
      "profiles are not indexed by search engines. shared plan links are, because you chose to share them.",
    ],
  ],
  [
    "getting rid of it",
    [
      "settings → delete my account scrubs your profile, cancels the upcoming plans you host, removes you from plans you joined, and signs you out everywhere.",
      "messages you already sent stay in other people's chats, attributed to a deleted account — the same way a message you sent someone stays on their phone.",
      "you can block anyone at any time; blocking is mutual and immediate.",
    ],
  ],
];

export default function PrivacyPage() {
  return (
    <main className="min-h-dvh">
      <header className="sky px-6 pb-14 pt-[calc(1.5rem+var(--sat))]">
        <Link href="/">
          <Wordmark className="text-4xl" />
        </Link>
        <h1 className="mt-8 text-[clamp(2rem,9vw,3rem)] text-[#0d1d2e]">what we know about you</h1>
        <p className="mt-3 max-w-md text-[15px] font-medium leading-relaxed text-[#17324d]">
          pap is a product about meeting people in your neighbourhood, so it asks for less than you'd expect. here is the whole list, in plain words.
        </p>
      </header>

      <div className="mx-auto max-w-2xl space-y-4 px-5 py-10">
        {SECTIONS.map(([title, points]) => (
          <section key={title} className="card p-5">
            <h2 className="text-2xl">{title}</h2>
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

        <p className="px-1 pt-4 text-center text-xs leading-relaxed text-muted">
          this is a plain-language summary, not a legal contract — if you need the formal version for your jurisdiction, ask before signing up.
          <br />
          questions, or want your data removed by hand? reply to any notification in your inbox.
        </p>
        <div className="flex justify-center gap-2 pt-2">
          <Link href="/safety" className="btn btn-light">
            safety
          </Link>
          <Link href="/discover" className="btn btn-dark">
            back to pap
          </Link>
        </div>
      </div>
    </main>
  );
}
