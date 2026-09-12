"use client";

import MapView from "@/components/MapView";
import { statusBadge } from "@/components/PlanCard";
import { useMe, useNow, useShare } from "@/components/hooks";
import { errorText, useToast } from "@/components/toast";
import { Avatar, Badge, Button, Empty, Sheet, Spinner } from "@/components/ui";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { REPORT_REASONS, category, clock, formatCost, formatDuration, formatWhen, formatWhenRange, planPhase } from "@/convex/shared";
import { useConvexAuth, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

export default function PlanView({ id }: { id: string }) {
  const data = useQuery(api.plans.get, { id });
  const { isAuthenticated } = useConvexAuth();
  const me = useMe();
  const now = useNow(15_000);
  const router = useRouter();
  const params = useSearchParams();
  const share = useShare();
  const toast = useToast();

  const join = useMutation(api.plans.join);
  const leave = useMutation(api.plans.leave);
  const toggleSave = useMutation(api.plans.toggleSave);
  const cancelPlan = useMutation(api.plans.cancel);
  const respond = useMutation(api.plans.respond);
  const removeParticipant = useMutation(api.plans.removeParticipant);
  const checkIn = useMutation(api.plans.checkIn);
  const markAttendance = useMutation(api.plans.markAttendance);
  const invite = useMutation(api.plans.invite);
  const report = useMutation(api.moderation.report);
  const logShare = useMutation(api.plans.shared);
  const candidates = useQuery(api.plans.inviteCandidates, data && !data.restricted && data.viewer ? { id: id as Id<"plans"> } : "skip");

  const [busy, setBusy] = useState(false);
  const [joinSheet, setJoinSheet] = useState(false);
  const [note, setNote] = useState("");
  const [leaveSheet, setLeaveSheet] = useState(false);
  const [manageSheet, setManageSheet] = useState(false);
  const [cancelSheet, setCancelSheet] = useState(false);
  const [reason, setReason] = useState("");
  const [reportSheet, setReportSheet] = useState(false);
  const [inviteSheet, setInviteSheet] = useState(false);
  const [invited, setInvited] = useState<string[]>([]);
  const [postedSheet, setPostedSheet] = useState(params.get("new") === "1");

  // invite attribution: whoever's link brought you here becomes a friend when you sign up
  const ref = params.get("ref");
  useEffect(() => {
    if (!ref) return;
    try {
      localStorage.setItem("pap.ref", ref);
    } catch {}
  }, [ref]);

  if (data === undefined)
    return (
      <div className="p-6">
        <div className="skeleton h-40 w-full rounded-card" />
        <div className="skeleton mt-4 h-8 w-2/3" />
        <div className="skeleton mt-2 h-4 w-1/2" />
      </div>
    );

  if (data === null)
    return (
      <Empty
        emoji="🕳️"
        title="this plan is gone"
        body="it may have been cancelled, or it was never open to you."
        action={
          <Link href="/discover" className="btn btn-dark">
            find something else
          </Link>
        }
      />
    );

  const c = data.card;
  const cat = category(c.category);
  const phase = planPhase(c, now);
  const full = c.goingCount >= c.spots;
  const status = c.viewerStatus;
  const isHost = status === "host";
  const shareUrl = `/p/${c._id}${me ? `?ref=${me._id}` : ""}`;

  if (data.restricted)
    return (
      <div className="p-5">
        <div style={{ background: cat.tint }} className="grid h-40 place-items-center rounded-card text-6xl">
          {cat.emoji}
        </div>
        <h1 className="mt-5 text-3xl">{c.title}</h1>
        <p className="mt-2 text-sm text-muted">
          {c.host?.name} keeps this one for {c.visibility === "friends" ? "friends" : "their circle"}. become friends on pap and you'll see it — and everything else they post.
        </p>
        <Link href={`/u/${c.host?.handle}`} className="btn btn-dark mt-5">
          see {c.host?.name}'s profile
        </Link>
      </div>
    );

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

  const primary = () => {
    if (!isAuthenticated)
      return (
        <Link href={`/signin?next=${encodeURIComponent(`/p/${c._id}${ref ? `?ref=${ref}` : ""}`)}`} className="btn btn-dark btn-lg btn-block">
          sign in to join
        </Link>
      );
    if (phase === "cancelled" || phase === "ended") {
      // a finished plan is the best template for the next one
      if (isHost)
        return (
          <Link href={`/create?copy=${c._id}`} className="btn btn-dark btn-lg btn-block">
            post it again
          </Link>
        );
      return (
        <Button size="lg" className="btn-block" disabled>
          {phase === "cancelled" ? "this plan was cancelled" : "this one's done"}
        </Button>
      );
    }
    if (isHost)
      return (
        <div className="flex gap-2">
          <Link href={`/chat/${encodeURIComponent(`p:${c._id}`)}`} className="btn btn-dark btn-lg flex-1">
            open plan chat
          </Link>
          <Button size="lg" variant="light" onClick={() => setManageSheet(true)}>
            manage
          </Button>
        </div>
      );
    if (status === "going")
      return (
        <div className="flex gap-2">
          {phase === "live" && !data.viewer?.checkedIn ? (
            <Button size="lg" className="flex-1" loading={busy} onClick={() => act(() => checkIn({ id: c._id }), "checked in 📍")}>
              i'm here
            </Button>
          ) : (
            <Link href={`/chat/${encodeURIComponent(`p:${c._id}`)}`} className="btn btn-dark btn-lg flex-1">
              open plan chat
            </Link>
          )}
          <Button size="lg" variant="light" onClick={() => setLeaveSheet(true)}>
            can't make it
          </Button>
        </div>
      );
    if (status === "waitlist")
      return (
        <div className="flex gap-2">
          <Button size="lg" className="flex-1" disabled>
            you're on the waitlist
          </Button>
          <Button size="lg" variant="light" onClick={() => act(() => leave({ id: c._id }), "left the waitlist")}>
            leave
          </Button>
        </div>
      );
    if (status === "requested")
      return (
        <div className="flex gap-2">
          <Button size="lg" className="flex-1" disabled>
            waiting on the host
          </Button>
          <Button size="lg" variant="light" onClick={() => act(() => leave({ id: c._id }), "request withdrawn")}>
            withdraw
          </Button>
        </div>
      );
    return (
      <Button size="lg" className="btn-block" loading={busy} onClick={() => (c.approval || data.requirements || full ? setJoinSheet(true) : doJoin())}>
        {full ? "join the waitlist" : c.approval ? "ask to join" : "i'm in"}
      </Button>
    );
  };

  async function doJoin() {
    await act(async () => {
      const res = await join({ id: c._id, note: note.trim() || undefined, ref: params.get("ref") ?? undefined });
      setJoinSheet(false);
      setNote("");
      toast(res === "going" ? "you're in 🎉 the exact spot and chat are yours now" : res === "waitlist" ? "you're on the waitlist — we'll tell you if a spot opens" : "request sent to the host");
    });
  }

  return (
    <div className="pb-24 md:pb-4">
      <div style={{ background: cat.tint }} className="relative grid h-44 place-items-center overflow-hidden">
        <span className="text-7xl drop-shadow-[0_10px_16px_rgba(20,40,60,0.2)]">{cat.emoji}</span>
        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-3 pt-[calc(0.75rem+var(--sat))]">
          <button onClick={() => router.back()} aria-label="back" className="grid size-9 place-items-center rounded-full bg-white/90 shadow-soft">
            ←
          </button>
          <div className="flex gap-2">
            {isAuthenticated && (
              <button
                onClick={() => act(() => toggleSave({ id: c._id }))}
                aria-label="save"
                className={`grid size-9 place-items-center rounded-full shadow-soft ${c.saved ? "bg-ink text-white" : "bg-white/90"}`}
              >
                {c.saved ? "★" : "☆"}
              </button>
            )}
            <button
              onClick={async () => {
                const r = await share(shareUrl, c.title, `${formatWhen(c.startAt, now, c.tz ?? undefined)} · ${c.placeName}`);
                if (r === "copied") toast("link copied — paste it anywhere");
                if (r !== "cancelled") logShare({ id: c._id, channel: r });
              }}
              aria-label="share"
              className="grid size-9 place-items-center rounded-full bg-white/90 shadow-soft"
            >
              ↗
            </button>
          </div>
        </div>
      </div>

      <div className="space-y-5 px-4 py-5">
        {phase === "cancelled" && (
          <div className="rounded-card bg-blush p-4 text-sm font-bold text-[#8f1f2d]">
            this plan was cancelled{data.cancelReason ? ` — “${data.cancelReason}”` : ""}.
          </div>
        )}
        {data.hidden && <div className="rounded-card bg-[#FFEFD2] p-4 text-sm font-bold text-[#8a5a00]">paused while we review reports. only you can see it.</div>}

        <div>
          <div className="flex flex-wrap items-center gap-2">
            {statusBadge(c, now)}
            {c.host?.verifiedHost && <Badge tone="good">⭐ creator meetup</Badge>}
            {c.recurrence === "weekly" && <Badge tone="neutral">every week</Badge>}
            {data.circle && (
              <Link href={`/c/${data.circle.slug}`}>
                <Badge tone="neutral">
                  {data.circle.emoji} {data.circle.name}
                </Badge>
              </Link>
            )}
            {c.visibility !== "public" && <Badge tone="neutral">{c.visibility === "friends" ? "friends only" : c.visibility === "circle" ? "circle" : "link only"}</Badge>}
          </div>
          <h1 className="mt-3 text-[clamp(1.9rem,7vw,2.6rem)]">{c.title}</h1>
        </div>

        <div className="card divide-y divide-line">
          <Row
            emoji="🕒"
            title={formatWhenRange(c.startAt, c.endAt, now, c.tz ?? undefined)}
            sub={`${clock(c.startAt, c.tz ?? undefined)} – ${clock(c.endAt, c.tz ?? undefined)} · ${formatDuration(c.endAt - c.startAt)}`}
          />
          <Row
            emoji="📍"
            title={c.placeName}
            sub={[c.areaName, c.distanceKm != null ? `${c.distanceKm.toFixed(1)} km away` : null, !c.exact ? "exact spot shared when you join" : null].filter(Boolean).join(" · ")}
          />
          <Row emoji="💸" title={formatCost(c.cost, c.currency)} sub={c.cost ? "roughly, each" : "nothing to pay"} />
          <Row
            emoji="🎟️"
            title={full ? (c.waitCount ? `full · ${c.waitCount} waiting` : "full") : `${c.spots - c.goingCount} of ${c.spots} spots left`}
            sub={c.approval ? "the host approves people" : "instant join"}
          />
        </div>

        {data.description && <p className="whitespace-pre-wrap text-[15px] leading-relaxed">{data.description}</p>}

        {(data.bring || data.requirements) && (
          <div className="card space-y-3 p-4">
            {data.bring && (
              <p className="text-sm">
                <span className="label">bring</span>
                <br />
                {data.bring}
              </p>
            )}
            {data.requirements && (
              <p className="text-sm">
                <span className="label">before you join</span>
                <br />
                {data.requirements}
              </p>
            )}
          </div>
        )}

        <div className="overflow-hidden rounded-card">
          <MapView center={{ lat: c.lat, lng: c.lng }} zoom={c.exact ? 15 : 13} points={[{ id: c._id, lat: c.lat, lng: c.lng, emoji: cat.emoji, live: phase === "live" }]} showMe={false} className="h-40 w-full" />
        </div>
        <div className="flex flex-wrap gap-2">
          {c.exact && (
            <a className="btn btn-light btn-sm" href={`https://www.google.com/maps/search/?api=1&query=${c.lat},${c.lng}`} target="_blank" rel="noreferrer">
              open in maps
            </a>
          )}
          {phase !== "ended" && phase !== "cancelled" && (
            <a className="btn btn-light btn-sm" href={calendarUrl(c)} target="_blank" rel="noreferrer">
              add to calendar
            </a>
          )}
        </div>

        <section>
          <h2 className="text-2xl">who's going</h2>
          <div className="mt-3 space-y-2">
            <PersonRow user={c.host} caption="hosting" right={isHost ? <Badge tone="good">you</Badge> : null} />
            {data.going.map((p) => (
              <PersonRow
                key={p._id}
                user={p}
                caption={[p.friend ? "friend" : null, p.checkedIn ? "checked in" : null].filter(Boolean).join(" · ") || undefined}
                right={
                  !isHost || p._id === me?._id ? null : now >= c.startAt ? (
                    // once it's started, the host records who actually turned up
                    <span className="flex shrink-0 gap-1">
                      <button
                        onClick={() => act(() => markAttendance({ id: c._id, userId: p._id as Id<"users">, attended: true }), "marked as there")}
                        className={`rounded-full px-2 py-1 text-[11px] font-bold ${p.showedUp !== false ? "bg-mint text-[#166b3c]" : "bg-black/5 text-muted"}`}
                      >
                        here
                      </button>
                      <button
                        onClick={() => act(() => markAttendance({ id: c._id, userId: p._id as Id<"users">, attended: false }), "marked as a no-show")}
                        className={`rounded-full px-2 py-1 text-[11px] font-bold ${p.showedUp === false ? "bg-blush text-[#a11d33]" : "bg-black/5 text-muted"}`}
                      >
                        no-show
                      </button>
                    </span>
                  ) : (
                    <button className="text-xs font-bold text-muted underline" onClick={() => act(() => removeParticipant({ id: c._id, userId: p._id as Id<"users"> }), "removed")}>
                      remove
                    </button>
                  )
                }
              />
            ))}
            {data.going.length === 0 && <p className="px-1 text-sm text-muted">nobody yet — be the first in.</p>}
            {c.waitCount > 0 && <p className="px-1 text-sm text-muted">{c.waitCount} on the waitlist</p>}
          </div>
          {isHost && data.requests.length > 0 && (
            <div className="card mt-4 p-4">
              <p className="label mb-2">{data.requests.length} waiting for your yes</p>
              {data.requests.map((r) => (
                <div key={r.user!._id} className="flex items-center gap-3 py-2">
                  <Avatar user={r.user} size={36} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{r.user!.name}</span>
                    {r.note && <span className="block truncate text-xs text-muted">“{r.note}”</span>}
                  </span>
                  <Button size="sm" onClick={() => act(() => respond({ id: c._id, userId: r.user!._id as Id<"users">, accept: true }), "they're in")}>
                    let them in
                  </Button>
                  <button className="text-xs font-bold text-muted" onClick={() => act(() => respond({ id: c._id, userId: r.user!._id as Id<"users">, accept: false }))}>
                    no
                  </button>
                </div>
              ))}
            </div>
          )}
          {isHost && data.waitlist.length > 0 && (
            <div className="card mt-4 p-4">
              <p className="label mb-2">{data.waitlist.length} on the waitlist</p>
              {data.waitlist.map((w) => (
                <div key={w.user!._id} className="flex items-center gap-3 py-2">
                  <Avatar user={w.user} size={32} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{w.user!.name}</span>
                    {w.note && <span className="block truncate text-xs text-muted">“{w.note}”</span>}
                  </span>
                </div>
              ))}
              <p className="mt-2 text-xs leading-relaxed text-muted">
                they move up automatically if someone drops out — or edit the plan to add a spot and let the next person in.
              </p>
            </div>
          )}
          {(isHost || status === "going") && (
            <Button variant="light" size="sm" className="mt-3" onClick={() => setInviteSheet(true)}>
              + invite friends
            </Button>
          )}
        </section>

        {status === "going" && phase !== "ended" && (
          <div className="rounded-card bg-white p-4 text-sm">
            <p className="font-extrabold tracking-tight">meeting new people?</p>
            <p className="mt-1 text-muted">send this plan to someone you know, so a friend knows where you are. it's a good habit even for coffee.</p>
            <Button
              size="sm"
              variant="light"
              className="mt-3"
              onClick={async () => {
                const r = await share(shareUrl, `i'm going to: ${c.title}`, `${formatWhen(c.startAt, now, c.tz ?? undefined)} · ${c.placeName}`);
                if (r === "copied") toast("link copied");
              }}
            >
              share with a friend
            </Button>
          </div>
        )}

        {isAuthenticated && !isHost && (
          <button onClick={() => setReportSheet(true)} className="px-1 text-xs font-bold text-muted underline underline-offset-4">
            report this plan
          </button>
        )}
      </div>

      {/* floats just above the tab bar on mobile, so it never hides behind it */}
      <div className="fixed inset-x-0 bottom-[calc(80px+var(--sab))] z-40 px-3 [&_.btn]:shadow-lift md:sticky md:bottom-4 md:px-4">
        <div className="mx-auto max-w-lg">{primary()}</div>
      </div>

      {/* join */}
      <Sheet
        open={joinSheet}
        onClose={() => setJoinSheet(false)}
        title={full ? "join the waitlist" : c.approval ? "ask to join" : "you're joining"}
        subtitle={`${c.title} · ${formatWhen(c.startAt, now, c.tz ?? undefined)}`}
        footer={
          <Button className="btn-block" loading={busy} onClick={doJoin}>
            {full ? "add me to the waitlist" : c.approval ? "send request" : "i'm in"}
          </Button>
        }
      >
        <div className="space-y-3 py-2">
          {data.requirements && <p className="rounded-card bg-[#FFF6E2] p-3 text-sm font-semibold">{data.requirements}</p>}
          {(c.approval || full) && (
            <textarea className="field min-h-[80px] resize-none" maxLength={200} placeholder="say hi, or why you'd like to come (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
          )}
          <p className="text-xs leading-relaxed text-muted">
            the host sees your name, photo and how often you turn up. you'll get the exact meeting point and the plan chat once you're in.{" "}
            <Link href="/safety" className="underline underline-offset-2">
              meeting people safely
            </Link>
            .
          </p>
        </div>
      </Sheet>

      {/* leave */}
      <Sheet
        open={leaveSheet}
        onClose={() => setLeaveSheet(false)}
        title="can't make it?"
        subtitle={c.startAt - now < 2 * 36e5 ? "heads up: dropping out within two hours of the start shows on your reliability." : "no problem — your spot goes to whoever's next."}
        footer={
          <div className="flex gap-2">
            <Button variant="light" className="flex-1" onClick={() => setLeaveSheet(false)}>
              stay in
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              loading={busy}
              onClick={async () => {
                await act(() => leave({ id: c._id }), "you're out — the host was told");
                setLeaveSheet(false);
              }}
            >
              leave the plan
            </Button>
          </div>
        }
      >
        <p className="py-2 text-sm text-muted">if something changed, a quick message in the plan chat goes a long way.</p>
      </Sheet>

      {/* host manage */}
      <Sheet open={manageSheet} onClose={() => setManageSheet(false)} title="manage plan">
        <div className="space-y-2 py-2">
          <Link href={`/create?edit=${c._id}`} className="btn btn-light btn-block justify-start">
            ✏️ edit the details
          </Link>
          <Button variant="light" className="btn-block justify-start" onClick={() => (setManageSheet(false), setInviteSheet(true))}>
            👋 invite friends
          </Button>
          <Button
            variant="light"
            className="btn-block justify-start"
            onClick={async () => {
              const r = await share(shareUrl, c.title, `${formatWhen(c.startAt, now, c.tz ?? undefined)} · ${c.placeName}`);
              if (r === "copied") toast("link copied");
            }}
          >
            🔗 copy the link
          </Button>
          <Button variant="danger" className="btn-block justify-start" onClick={() => (setManageSheet(false), setCancelSheet(true))}>
            ✖️ cancel this plan
          </Button>
        </div>
      </Sheet>

      <Sheet
        open={cancelSheet}
        onClose={() => setCancelSheet(false)}
        title="cancel the plan?"
        subtitle={`${c.goingCount} ${c.goingCount === 1 ? "person is" : "people are"} counting on this. they'll be told right away.`}
        footer={
          <div className="flex gap-2">
            <Button variant="light" className="flex-1" onClick={() => setCancelSheet(false)}>
              keep it
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              loading={busy}
              onClick={async () => {
                await act(() => cancelPlan({ id: c._id, reason: reason.trim() || undefined }), "plan cancelled — everyone was told");
                setCancelSheet(false);
              }}
            >
              cancel plan
            </Button>
          </div>
        }
      >
        <input className="field my-2" placeholder="why? (optional, they'll see this)" maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Sheet>

      {/* invite */}
      <Sheet open={inviteSheet} onClose={() => setInviteSheet(false)} title="invite friends" subtitle="people you're friends with on pap. free-right-now first.">
        <div className="space-y-2 py-2">
          {candidates === undefined ? (
            <Spinner />
          ) : candidates.length === 0 ? (
            <p className="text-sm text-muted">no friends on pap yet — share the link instead and whoever opens it can join.</p>
          ) : (
            candidates.map((u) => (
              <button
                key={u._id}
                onClick={() => setInvited((v) => (v.includes(u._id) ? v.filter((x) => x !== u._id) : [...v, u._id]))}
                className={`flex w-full items-center gap-3 rounded-2xl p-2 text-left ${invited.includes(u._id) ? "bg-ink text-white" : "bg-white"}`}
              >
                <Avatar user={u} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{u.name}</span>
                  <span className={`block truncate text-xs ${invited.includes(u._id) ? "text-white/70" : "text-muted"}`}>
                    {u.free ? "free right now" : u.likes ? `into ${cat.label}` : `@${u.handle}`}
                  </span>
                </span>
                <span>{invited.includes(u._id) ? "✓" : "+"}</span>
              </button>
            ))
          )}
        </div>
        <div className="pb-2 pt-3">
          <Button
            className="btn-block"
            disabled={!invited.length}
            loading={busy}
            onClick={async () => {
              await act(async () => {
                const sent = await invite({ id: c._id, userIds: invited as Id<"users">[] });
                toast(`invited ${sent} ${sent === 1 ? "person" : "people"}`);
              });
              setInvited([]);
              setInviteSheet(false);
            }}
          >
            send {invited.length ? `${invited.length} ` : ""}invites
          </Button>
        </div>
      </Sheet>

      {/* report */}
      <Sheet open={reportSheet} onClose={() => setReportSheet(false)} title="report this plan" subtitle="a human reads every report. plans get paused automatically when a few people flag them.">
        <div className="flex flex-col gap-2 py-2">
          {REPORT_REASONS.map((r) => (
            <Button
              key={r}
              variant="light"
              className="btn-block justify-start"
              onClick={async () => {
                await act(() => report({ targetType: "plan", targetId: c._id, reason: r }), "thanks — we're on it");
                setReportSheet(false);
              }}
            >
              {r}
            </Button>
          ))}
        </div>
      </Sheet>

      {/* just posted */}
      <Sheet
        open={postedSheet}
        onClose={() => setPostedSheet(false)}
        title="it's up 🎉"
        subtitle="plans fill up when someone's asked. send it to two people who'd actually come."
        footer={
          <div className="flex gap-2">
            <Button variant="light" className="flex-1" onClick={() => setPostedSheet(false)}>
              done
            </Button>
            <Button
              className="flex-1"
              onClick={async () => {
                const r = await share(shareUrl, c.title, `${formatWhen(c.startAt, now, c.tz ?? undefined)} · ${c.placeName}. join me on pap.`);
                if (r === "copied") toast("link copied — paste it in your group chat");
                if (r !== "cancelled") logShare({ id: c._id, channel: r });
                setPostedSheet(false);
              }}
            >
              share the plan
            </Button>
          </div>
        }
      >
        <p className="py-2 text-sm text-muted">
          people nearby who are into {cat.label} will see it in discover, and anyone who follows you just got a nudge.
        </p>
      </Sheet>
    </div>
  );
}

/** Getting it into someone's calendar is the cheapest thing we can do for attendance. */
function calendarUrl(c: { title: string; startAt: number; endAt: number; placeName: string; _id: string }) {
  const stamp = (t: number) => new Date(t).toISOString().replace(/[-:]|\.\d{3}/g, "");
  const p = new URLSearchParams({
    action: "TEMPLATE",
    text: c.title,
    dates: `${stamp(c.startAt)}/${stamp(c.endAt)}`,
    location: c.placeName,
    details: `on pap — ${typeof location !== "undefined" ? location.origin : ""}/p/${c._id}`,
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

function Row({ emoji, title, sub }: { emoji: string; title: string; sub?: string }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5">
      <span className="text-xl">{emoji}</span>
      <span className="min-w-0">
        <span className="block truncate font-extrabold tracking-tight">{title}</span>
        {sub && <span className="block truncate text-xs text-muted">{sub}</span>}
      </span>
    </div>
  );
}

function PersonRow({
  user,
  caption,
  right,
}: {
  user: { _id: string; name: string; handle: string; emoji: string; color: string; image: string | null; verifiedHost?: boolean; reliability?: number | null; attended?: number } | null;
  caption?: string;
  right?: React.ReactNode;
}) {
  if (!user) return null;
  const body = (
    <>
      <Avatar user={user} size={40} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1 truncate text-sm font-bold">
          {user.name || "someone"}
          {user.verifiedHost && <span title="verified host">✅</span>}
        </span>
        <span className="block truncate text-xs text-muted">
          {caption ? `${caption} · ` : ""}
          {user.reliability != null ? `shows up ${user.reliability}% of the time` : `${user.attended ?? 0} plans done`}
        </span>
      </span>
      {right}
    </>
  );
  return user.handle ? (
    <Link href={`/u/${user.handle}`} className="flex items-center gap-3 rounded-2xl bg-white p-2.5">
      {body}
    </Link>
  ) : (
    <div className="flex items-center gap-3 rounded-2xl bg-white p-2.5">{body}</div>
  );
}
