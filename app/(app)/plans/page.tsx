"use client";

import PlanCard from "@/components/PlanCard";
import { useNow } from "@/components/hooks";
import { errorText, useToast } from "@/components/toast";
import { Avatar, Button, CardSkeleton, Chip, Empty, Sheet, TopBar } from "@/components/ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useState } from "react";

type Tab = "upcoming" | "hosting" | "saved" | "past";
const TABS: { key: Tab; label: string }[] = [
  { key: "upcoming", label: "upcoming" },
  { key: "hosting", label: "hosting" },
  { key: "saved", label: "saved" },
  { key: "past", label: "past" },
];

export default function PlansPage() {
  const [tab, setTab] = useState<Tab>("upcoming");
  const plans = useQuery(api.plans.mine, { tab });
  const pending = useQuery(api.feedback.pending) ?? [];
  const now = useNow();
  const [feedbackFor, setFeedbackFor] = useState<(typeof pending)[number] | null>(null);

  return (
    <div>
      <TopBar title="my plans" sub="everything you're in, hosting, or saved for later." />

      <div className="no-scrollbar flex gap-2 overflow-x-auto px-4 py-3">
        {TABS.map((t) => (
          <Chip key={t.key} on={tab === t.key} onClick={() => setTab(t.key)} className="shrink-0">
            {t.label}
          </Chip>
        ))}
      </div>

      <div className="space-y-3 px-4 pb-6">
        {pending.length > 0 && tab !== "saved" && (
          <section className="space-y-2">
            {pending.map((p) => (
              <button key={p.planId} onClick={() => setFeedbackFor(p)} className="card flex w-full items-center gap-3 p-4 text-left">
                <span className="text-2xl">{p.emoji}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-extrabold tracking-tight">how was {p.title}?</span>
                  <span className="block text-xs text-muted">{p.isHost ? "mark who showed up — it keeps reliability honest" : "five seconds, and it stays private"}</span>
                </span>
                <span className="btn btn-dark btn-sm">answer</span>
              </button>
            ))}
          </section>
        )}

        {plans === undefined ? (
          <CardSkeleton count={3} />
        ) : plans.length === 0 ? (
          <Empty
            emoji={tab === "saved" ? "★" : tab === "past" ? "🕰️" : "🌱"}
            title={
              tab === "upcoming"
                ? "nothing on the calendar"
                : tab === "hosting"
                  ? "you haven't hosted yet"
                  : tab === "saved"
                    ? "nothing saved"
                    : "no history yet"
            }
            body={
              tab === "hosting"
                ? "hosting is the fastest way to meet people here — post something small, like coffee."
                : tab === "saved"
                  ? "tap the star on any plan to keep an eye on it."
                  : "join something this week and it'll show up here."
            }
            action={
              <Link href={tab === "saved" ? "/discover" : "/create"} className="btn btn-dark">
                {tab === "saved" ? "find plans" : "post a plan"}
              </Link>
            }
          />
        ) : (
          plans.map((p) => <PlanCard key={p._id} card={p} now={now} />)
        )}
      </div>

      <FeedbackSheet item={feedbackFor} onClose={() => setFeedbackFor(null)} />
    </div>
  );
}

function FeedbackSheet({ item, onClose }: { item: { planId: string; title: string; emoji: string; isHost: boolean; people: { _id: string; name: string; emoji: string; color: string; image: string | null }[] } | null; onClose: () => void }) {
  const submit = useMutation(api.feedback.submit);
  const toast = useToast();
  const [vibe, setVibe] = useState<"great" | "ok" | "bad" | null>(null);
  const [again, setAgain] = useState<string[]>([]);
  const [absent, setAbsent] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const close = () => {
    setVibe(null);
    setAgain([]);
    setAbsent([]);
    onClose();
  };

  return (
    <Sheet
      open={!!item}
      onClose={close}
      title={item ? `${item.emoji} how did it go?` : ""}
      subtitle="private. we use it to make recommendations better — nobody sees your answers."
      footer={
        <Button
          className="btn-block"
          disabled={!vibe}
          loading={busy}
          onClick={async () => {
            if (!item || !vibe) return;
            setBusy(true);
            try {
              await submit({
                planId: item.planId as Id<"plans">,
                vibe,
                wouldAgain: again as Id<"users">[],
                noShows: item.isHost ? (absent as Id<"users">[]) : undefined,
              });
              toast("thanks — that helps a lot");
              close();
            } catch (e) {
              toast(errorText(e), "bad");
            } finally {
              setBusy(false);
            }
          }}
        >
          done
        </Button>
      }
    >
      {item && (
        <div className="space-y-5 py-2">
          <div className="flex gap-2">
            {[
              { v: "great" as const, label: "🙌 great" },
              { v: "ok" as const, label: "🙂 fine" },
              { v: "bad" as const, label: "😕 not great" },
            ].map((o) => (
              <Chip key={o.v} on={vibe === o.v} onClick={() => setVibe(o.v)} className="flex-1 justify-center">
                {o.label}
              </Chip>
            ))}
          </div>

          {item.people.length > 0 && (
            <div>
              <p className="label mb-2">who would you plan with again?</p>
              <div className="flex flex-wrap gap-2">
                {item.people.map((p) => (
                  <button
                    key={p._id}
                    onClick={() => setAgain((v) => (v.includes(p._id) ? v.filter((x) => x !== p._id) : [...v, p._id]))}
                    className={`flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm font-bold ${again.includes(p._id) ? "bg-ink text-white" : "bg-white"}`}
                  >
                    <Avatar user={p} size={26} /> {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {item.isHost && item.people.length > 0 && (
            <div>
              <p className="label mb-2">anyone not turn up?</p>
              <div className="flex flex-wrap gap-2">
                {item.people.map((p) => (
                  <button
                    key={p._id}
                    onClick={() => setAbsent((v) => (v.includes(p._id) ? v.filter((x) => x !== p._id) : [...v, p._id]))}
                    className={`flex items-center gap-2 rounded-full py-1 pl-1 pr-3 text-sm font-bold ${absent.includes(p._id) ? "bg-blush text-[#8f1f2d]" : "bg-white"}`}
                  >
                    <Avatar user={p} size={26} /> {p.name}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-muted">only mark people who didn't come and didn't say anything. everyone else counts as there.</p>
            </div>
          )}

          {vibe === "bad" && (
            <p className="rounded-card bg-blush p-3 text-xs font-semibold text-[#8f1f2d]">
              if something happened that wasn't ok, report it from the plan page — we read every report.
            </p>
          )}
        </div>
      )}
    </Sheet>
  );
}
