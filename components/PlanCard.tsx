"use client";

import { api } from "@/convex/_generated/api";
import { category, formatCost, formatDistance, formatWhenRange, planPhase } from "@/convex/shared";
import { useConvexAuth, useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import Link from "next/link";
import { AvatarStack, Badge } from "./ui";
import { errorText, useToast } from "./toast";

export type Card = FunctionReturnType<typeof api.plans.mine>[number];

export function statusBadge(card: Card, now: number) {
  const phase = planPhase(card, now);
  if (phase === "cancelled") return <Badge tone="bad">cancelled</Badge>;
  if (phase === "ended") return <Badge tone="neutral">{card.goingCount ? "done" : "expired"}</Badge>;
  if (phase === "live")
    return (
      <Badge tone="live">
        <span className="live-dot mr-0.5 inline-block size-1.5 rounded-full bg-[#6bf0a0] text-[#6bf0a0]" />
        happening now
      </Badge>
    );
  if (phase === "soon") return <Badge tone="warn">starting soon</Badge>;
  if (card.goingCount >= card.spots) return <Badge tone="neutral">full{card.waitCount ? ` · ${card.waitCount} waiting` : ""}</Badge>;
  return null;
}

export function spotsLine(card: Card) {
  const left = card.spots - card.goingCount;
  if (left <= 0) return card.waitCount ? `full · ${card.waitCount} on the waitlist` : "full";
  if (card.goingCount === 0) return `${left} ${left === 1 ? "spot" : "spots"} · be the first in`;
  return `${card.goingCount} going · ${left} ${left === 1 ? "spot" : "spots"} left`;
}

export default function PlanCard({ card, now, href }: { card: Card; now: number; href?: string }) {
  const c = category(card.category);
  const phase = planPhase(card, now);
  const dim = phase === "ended" || phase === "cancelled";
  const you = card.viewerStatus;
  const { isAuthenticated } = useConvexAuth();
  const toggleSave = useMutation(api.plans.toggleSave);
  const toast = useToast();

  return (
    <div className="relative">
      <Link
        href={href ?? `/p/${card._id}`}
        className={`card animate-rise block p-3.5 transition active:scale-[0.985] ${dim ? "opacity-70" : ""}`}
      >
        <div className="flex gap-3.5">
          <div
            style={{ background: c.tint }}
            className="grid size-[62px] shrink-0 place-items-center rounded-[18px] text-[30px] leading-none"
            aria-hidden
          >
            {c.emoji}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              <h3 className="display line-clamp-2 min-w-0 flex-1 text-[19px] leading-[1.1]">{card.title}</h3>
              {card.cost > 0 ? (
                <span className="mt-0.5 shrink-0 text-xs font-bold text-muted">{formatCost(card.cost, card.currency)}</span>
              ) : (
                <span className="mt-0.5 shrink-0 text-xs font-bold text-[#2f8f5b]">free</span>
              )}
            </div>
            <p className="mt-1 truncate text-[13px] font-semibold text-ink">
              {formatWhenRange(card.startAt, card.endAt, now, card.tz ?? undefined)}
              <span className="text-muted"> · {card.placeName}</span>
              {card.distanceKm != null && <span className="text-muted"> · {formatDistance(card.distanceKm)}</span>}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
              {statusBadge(card, now)}
              {card.host?.verifiedHost && <Badge tone="good">⭐ creator</Badge>}
              {you === "host" && <Badge tone="good">you're hosting</Badge>}
              {you === "going" && <Badge tone="good">you're in</Badge>}
              {you === "waitlist" && <Badge tone="warn">waitlisted</Badge>}
              {you === "requested" && <Badge tone="warn">requested</Badge>}
              {card.recurrence === "weekly" && <Badge tone="neutral">weekly</Badge>}
              {card.visibility === "friends" && <Badge tone="neutral">friends only</Badge>}
              {card.visibility === "private" && <Badge tone="neutral">link only</Badge>}
            </div>
            <div className="mt-2.5 flex items-center gap-2">
              <AvatarStack users={[card.host, ...card.going]} size={24} max={4} />
              <span className="truncate pr-8 text-xs text-muted">{spotsLine(card)}</span>
            </div>
            {!!card.reasons?.length && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {card.reasons.map((r) => (
                  <span key={r} className="rounded-full bg-black/5 px-2 py-0.5 text-[11px] font-semibold text-muted">
                    {r}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </Link>

      {isAuthenticated && you !== "host" && phase !== "ended" && phase !== "cancelled" && (
        <button
          aria-label={card.saved ? "remove from saved" : "save for later"}
          onClick={async (e) => {
            e.preventDefault();
            try {
              const saved = await toggleSave({ id: card._id });
              toast(saved ? "saved — it's in your plans tab" : "removed from saved");
            } catch (err) {
              toast(errorText(err), "bad");
            }
          }}
          className={`absolute bottom-3 right-3 grid size-8 place-items-center rounded-full text-sm transition active:scale-90 ${
            card.saved ? "bg-ink text-white" : "bg-black/5 text-muted"
          }`}
        >
          {card.saved ? "★" : "☆"}
        </button>
      )}
    </div>
  );
}
