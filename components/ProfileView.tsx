"use client";

import PlanCard from "@/components/PlanCard";
import { useMe, useNow, useShare } from "@/components/hooks";
import { errorText, useToast } from "@/components/toast";
import { Avatar, Badge, Button, Empty, Sheet, TopBar } from "@/components/ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AVAILABILITY, REPORT_REASONS, category } from "@/convex/shared";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function ProfileView({ handle }: { handle: string }) {
  const profile = useQuery(api.users.profile, { handle });
  const plans = useQuery(api.plans.byHost, profile ? { userId: profile.user._id } : "skip");
  const past = useQuery(api.users.hostedPast, profile ? { userId: profile.user._id } : "skip");
  const me = useMe();
  const now = useNow();
  const router = useRouter();
  const toast = useToast();
  const share = useShare();
  const follow = useMutation(api.users.follow);
  const block = useMutation(api.users.block);
  const openDm = useMutation(api.messages.openDm);
  const report = useMutation(api.moderation.report);
  const setVerified = useMutation(api.moderation.setVerifiedHost);
  const [busy, setBusy] = useState(false);
  const [moreSheet, setMoreSheet] = useState(false);
  const [reportSheet, setReportSheet] = useState(false);

  if (profile === undefined)
    return (
      <div className="space-y-4 p-5 pt-[calc(1.25rem+var(--sat))]">
        <div className="flex items-end gap-4">
          <div className="skeleton size-[86px] rounded-full" />
          <div className="flex-1 space-y-2 pb-2">
            <div className="skeleton h-7 w-40" />
            <div className="skeleton h-4 w-24" />
          </div>
        </div>
        <div className="skeleton h-16 w-full" />
        <div className="skeleton h-24 w-full rounded-card" />
      </div>
    );
  if (profile === null)
    return (
      <Empty
        emoji="👻"
        title="no one here"
        body="this profile doesn't exist, or it isn't available to you."
        action={
          <Link href="/discover" className="btn btn-dark">
            back to discover
          </Link>
        }
      />
    );

  const u = profile.user;
  const memberSince = new Date(profile.memberSince).toLocaleDateString("en-US", { month: "long", year: "numeric" }).toLowerCase();

  async function act(fn: () => Promise<unknown>, ok?: string) {
    setBusy(true);
    try {
      await fn();
      if (ok) toast(ok);
    } catch (e) {
      toast(errorText(e), "bad");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pb-6">
      <TopBar
        title=""
        back={true}
        right={
          !profile.isMe ? (
            <button onClick={() => setMoreSheet(true)} aria-label={`more about ${u.name}`} className="grid size-9 place-items-center rounded-full bg-white shadow-soft">
              ···
            </button>
          ) : (
            <Link href="/settings" className="btn btn-light btn-sm">
              settings
            </Link>
          )
        }
      />

      <div className="px-5 pt-2">
        <div className="flex items-end gap-4">
          <Avatar user={u} size={86} />
          <div className="min-w-0 flex-1 pb-1">
            <h1 className="flex items-center gap-2 truncate text-3xl">
              {u.name}
              {u.verifiedHost && <span title="verified host">✅</span>}
            </h1>
            <p className="truncate text-sm font-semibold text-muted">
              @{u.handle}
              {profile.areaName ? ` · ${profile.areaName}` : ""}
            </p>
          </div>
        </div>

        {profile.bio && <p className="mt-4 text-[15px] leading-relaxed">{profile.bio}</p>}

        <div className="mt-4 flex flex-wrap gap-2">
          {u.verifiedHost && <Badge tone="good">⭐ verified creator</Badge>}
          {u.reliability != null ? (
            <Badge tone={u.reliability >= 85 ? "good" : u.reliability >= 60 ? "warn" : "bad"}>shows up {u.reliability}% of the time</Badge>
          ) : (
            <Badge tone="neutral">{u.isNew ? "new here" : "still building a track record"}</Badge>
          )}
          <Badge tone="neutral">{profile.attended} plans done</Badge>
          {profile.hosted > 0 && <Badge tone="neutral">{profile.hosted} hosted</Badge>}
          {profile.friends && <Badge tone="good">friends</Badge>}
          {profile.together > 0 && (
            <Badge tone="neutral">
              {profile.together} {profile.together === 1 ? "plan" : "plans"} together
            </Badge>
          )}
          <Badge tone="neutral">on pap since {memberSince}</Badge>
        </div>

        {!profile.isMe && (
          <div className="mt-5 flex gap-2">
            <Button
              className="flex-1"
              variant={profile.iFollow ? "light" : "dark"}
              loading={busy}
              onClick={() =>
                act(
                  () => follow({ userId: u._id as Id<"users">, on: !profile.iFollow }),
                  profile.iFollow ? "you'll stop getting their plans" : "you'll hear when they post a plan",
                )
              }
            >
              {profile.iFollow ? (profile.friends ? "friends ✓" : "following ✓") : profile.followsMe ? "follow back" : "follow"}
            </Button>
            {profile.canMessage && (
              <Button
                variant="light"
                loading={busy}
                onClick={() =>
                  act(async () => {
                    const key = await openDm({ userId: u._id as Id<"users"> });
                    router.push(`/chat/${encodeURIComponent(key)}`);
                  })
                }
              >
                message
              </Button>
            )}
          </div>
        )}
        {!profile.isMe && !profile.canMessage && !profile.blockedByMe && (
          <p className="mt-2 text-xs text-muted">direct messages open up once you've been on a plan together — it keeps randoms out of your inbox.</p>
        )}
        {profile.blockedByMe && (
          <div className="mt-4 rounded-card bg-blush p-4 text-sm font-bold text-[#8f1f2d]">
            you blocked {u.name}.
            <button className="ml-2 underline" onClick={() => act(() => block({ userId: u._id as Id<"users">, on: false }), "unblocked")}>
              unblock
            </button>
          </div>
        )}

        {!!profile.interests.length && (
          <section className="mt-6">
            <p className="label mb-2">into</p>
            <div className="flex flex-wrap gap-2">
              {profile.interests.map((i) => (
                <span key={i} className="chip">
                  <span>{category(i).emoji}</span> {category(i).label}
                </span>
              ))}
            </div>
          </section>
        )}

        {!!profile.availability.length && (
          <section className="mt-5">
            <p className="label mb-2">usually free</p>
            <div className="flex flex-wrap gap-2">
              {profile.availability.map((a) => {
                const found = AVAILABILITY.find((x) => x.key === a);
                return (
                  <span key={a} className="chip">
                    <span>{found?.emoji}</span> {found?.label}
                  </span>
                );
              })}
            </div>
          </section>
        )}

        {!!profile.circles.length && (
          <section className="mt-5">
            <p className="label mb-2">circles</p>
            <div className="flex flex-wrap gap-2">
              {profile.circles.map((c) => (
                <Link key={c.slug} href={`/c/${c.slug}`} className="chip">
                  <span>{c.emoji}</span> {c.name}
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>

      <section className="mt-7 px-4">
        <h2 className="px-1 text-2xl">{profile.isMe ? "your upcoming plans" : `${u.name.split(" ")[0]}'s plans`}</h2>
        <div className="mt-3 space-y-3">
          {plans === undefined ? (
            <div className="skeleton h-24 rounded-card" />
          ) : plans.length === 0 ? (
            <p className="px-1 text-sm text-muted">
              {profile.isMe ? "nothing coming up — post something and it'll show here." : "nothing coming up right now."}
            </p>
          ) : (
            plans.map((p) => <PlanCard key={p._id} card={p} now={now} />)
          )}
        </div>
      </section>

      {!!past?.length && (
        <section className="mt-7 px-4">
          <h2 className="px-1 text-2xl">{profile.isMe ? "what you've hosted" : "what they've hosted"}</h2>
          <div className="mt-3 space-y-3">
            {past.map((p) => (
              <PlanCard key={p._id} card={p} now={now} />
            ))}
          </div>
        </section>
      )}

      <Sheet open={moreSheet} onClose={() => setMoreSheet(false)} title={`about ${u.name}`}>
        <div className="space-y-2 py-2">
          <Button
            variant="light"
            className="btn-block justify-start"
            onClick={async () => {
              const r = await share(`/u/${u.handle}`, u.name, `${u.name} on pap`);
              if (r === "copied") toast("profile link copied");
              setMoreSheet(false);
            }}
          >
            🔗 copy link to this profile
          </Button>
          {me?.isAdmin && (
            <Button
              variant="light"
              className="btn-block justify-start"
              onClick={() =>
                act(
                  () => setVerified({ userId: u._id as Id<"users">, on: !u.verifiedHost }),
                  u.verifiedHost ? "verification removed" : "marked as a verified host",
                )
              }
            >
              {u.verifiedHost ? "➖ remove verified host" : "✅ mark as verified host"}
            </Button>
          )}
          <Button variant="light" className="btn-block justify-start" onClick={() => (setMoreSheet(false), setReportSheet(true))}>
            🚩 report {u.name}
          </Button>
          <Button
            variant="danger"
            className="btn-block justify-start"
            onClick={async () => {
              await act(() => block({ userId: u._id as Id<"users">, on: true }), `${u.name} is blocked`);
              setMoreSheet(false);
            }}
          >
            🚫 block — you won't see each other's plans
          </Button>
        </div>
      </Sheet>

      <Sheet open={reportSheet} onClose={() => setReportSheet(false)} title="report" subtitle="a person reviews this. tell us what happened.">
        <div className="flex flex-col gap-2 py-2">
          {REPORT_REASONS.map((r) => (
            <Button
              key={r}
              variant="light"
              className="btn-block justify-start"
              onClick={async () => {
                await act(() => report({ targetType: "user", targetId: u._id, reason: r }), "thanks — we're looking into it");
                setReportSheet(false);
              }}
            >
              {r}
            </Button>
          ))}
        </div>
      </Sheet>
    </div>
  );
}
