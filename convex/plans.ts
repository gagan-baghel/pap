import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { MutationCtx, mutation, query } from "./_generated/server";
import {
  addThreadMember,
  blockedIds,
  friendIds,
  followingIds,
  goingRows,
  isBlocked,
  isFriend,
  notify,
  participation,
  planAccess,
  postMessage,
  publicUser,
  publicUserById,
  rateLimit,
  removeThreadMember,
  requireActive,
  requireViewer,
  schedulePlanJobs,
  toCard,
  track,
  viewer,
} from "./lib";
import { visibility } from "./schema";
import { CATEGORIES, category, cellOf, cellsAround, clock, distanceKm, threadKeyForPlan } from "./shared";

const planFields = {
  title: v.string(),
  category: v.string(),
  description: v.optional(v.string()),
  bring: v.optional(v.string()),
  requirements: v.optional(v.string()),
  placeName: v.string(),
  areaName: v.optional(v.string()),
  lat: v.number(),
  lng: v.number(),
  exactFor: v.union(v.literal("everyone"), v.literal("joined")),
  startAt: v.number(),
  durationMin: v.number(),
  tz: v.optional(v.string()),
  isNow: v.optional(v.boolean()),
  spots: v.number(),
  cost: v.number(),
  currency: v.optional(v.string()),
  visibility,
  circleId: v.optional(v.id("circles")),
  approval: v.boolean(),
  recurrence: v.optional(v.literal("weekly")),
};

type PlanInput = {
  title: string;
  category: string;
  description?: string;
  bring?: string;
  requirements?: string;
  placeName: string;
  areaName?: string;
  lat: number;
  lng: number;
  startAt: number;
  durationMin: number;
  spots: number;
  cost: number;
  visibility: Doc<"plans">["visibility"];
  circleId?: Id<"circles">;
  currency?: string;
  tz?: string;
};

function clean(a: PlanInput, me: Doc<"users">, isNew: boolean) {
  const title = a.title.trim().replace(/\s+/g, " ");
  const now = Date.now();
  const fail = (m: string) => {
    throw new ConvexError(m);
  };
  if (title.length < 3) fail("give your plan a name — at least 3 characters");
  if (title.length > 80) fail("keep the name under 80 characters");
  if (!CATEGORIES.some((c) => c.key === a.category)) fail("pick what kind of plan this is");
  if (!a.placeName.trim()) fail("where's it happening?");
  if (Math.abs(a.lat) > 90 || Math.abs(a.lng) > 180) fail("that location doesn't look right");
  if (isNew && a.startAt < now - 15 * 60e3) fail("that time has already passed");
  if (a.startAt > now + 90 * 864e5) fail("plans can be up to 90 days out");
  if (a.durationMin < 15 || a.durationMin > 24 * 60) fail("plans can run from 15 minutes to 24 hours");
  const maxSpots = me.verifiedHost ? 500 : 50;
  if (!Number.isInteger(a.spots) || a.spots < 1 || a.spots > maxSpots) fail(`spots must be between 1 and ${maxSpots}`);
  if (!(a.cost >= 0 && a.cost <= 1_000_000)) fail("cost doesn't look right");
  if ((a.description?.length ?? 0) > 1500) fail("description is too long (1500 max)");
  if ((a.bring?.length ?? 0) > 200 || (a.requirements?.length ?? 0) > 200) fail("keep 'bring' and 'requirements' short");
  if (a.visibility === "circle" && !a.circleId) fail("pick which circle this is for");
  if (a.currency !== undefined && !/^[A-Z]{3}$/.test(a.currency)) fail("that currency doesn't look right");
  if (a.tz !== undefined && !/^[A-Za-z0-9_+\-/]{1,40}$/.test(a.tz)) fail("that time zone doesn't look right");
  return {
    title,
    placeName: a.placeName.trim().slice(0, 120),
    areaName: a.areaName?.trim().slice(0, 60) || undefined,
    description: a.description?.trim() || undefined,
    bring: a.bring?.trim() || undefined,
    requirements: a.requirements?.trim() || undefined,
    endAt: a.startAt + a.durationMin * 60e3,
    cell: cellOf(a.lat, a.lng),
    searchText: `${title} ${category(a.category).label} ${a.placeName} ${a.areaName ?? ""}`.toLowerCase(),
  };
}

async function assertCircleMember(ctx: MutationCtx, circleId: Id<"circles"> | undefined, userId: Id<"users">) {
  if (!circleId) return;
  const m = await ctx.db
    .query("circleMembers")
    .withIndex("by_pair", (q) => q.eq("circleId", circleId).eq("userId", userId))
    .unique();
  if (!m) throw new ConvexError("join the circle before posting plans to it");
}

async function getPlanOr404(ctx: MutationCtx, id: Id<"plans">) {
  const plan = await ctx.db.get(id);
  if (!plan) throw new ConvexError("this plan doesn't exist anymore");
  return plan;
}

const hostOnly = (plan: Doc<"plans">, me: Doc<"users">) => {
  if (plan.hostId !== me._id) throw new ConvexError("only the host can do that");
};

// Move people off the waitlist while there's room.
async function promote(ctx: MutationCtx, plan: Doc<"plans">) {
  let going = plan.goingCount;
  let waiting = plan.waitCount;
  const queue = await ctx.db
    .query("participants")
    .withIndex("by_plan_status", (q) => q.eq("planId", plan._id).eq("status", "waitlist"))
    .take(Math.max(0, plan.spots - going));
  for (const w of queue) {
    await ctx.db.patch(w._id, { status: "going" });
    going++;
    waiting--;
    await addThreadMember(ctx, threadKeyForPlan(plan._id), w.userId);
    await notify(ctx, w.userId, { kind: "promoted", text: `a spot opened up — you're in for ${plan.title} 🎉`, planId: plan._id });
    const u = await ctx.db.get(w.userId);
    await postMessage(ctx, threadKeyForPlan(plan._id), w.userId, `${u?.name ?? "someone"} is in (off the waitlist)`, "system");
  }
  await ctx.db.patch(plan._id, { goingCount: going, waitCount: Math.max(0, waiting) });
}

async function notifyAll(
  ctx: MutationCtx,
  plan: Doc<"plans">,
  statuses: Doc<"participants">["status"][],
  n: { kind: string; text: string; actorId?: Id<"users"> },
) {
  for (const status of statuses) {
    const rows = await ctx.db
      .query("participants")
      .withIndex("by_plan_status", (q) => q.eq("planId", plan._id).eq("status", status))
      .collect();
    for (const r of rows) await notify(ctx, r.userId, { ...n, planId: plan._id });
  }
}

// ---------------- queries ----------------

export const discover = query({
  args: {
    lat: v.number(),
    lng: v.number(),
    radiusKm: v.number(),
    from: v.number(),
    to: v.number(),
    category: v.optional(v.string()),
    q: v.optional(v.string()),
    maxCost: v.optional(v.number()),
    size: v.optional(v.union(v.literal("small"), v.literal("big"))),
    openOnly: v.optional(v.boolean()),
    friends: v.optional(v.boolean()),
    freeWindow: v.optional(v.boolean()),
    sort: v.optional(v.union(v.literal("best"), v.literal("soon"), v.literal("near"))),
  },
  handler: async (ctx, a) => {
    const me = await viewer(ctx);
    const now = Date.now();
    const radius = Math.min(Math.max(a.radiusKm, 1), 80);
    const q = a.q?.trim().toLowerCase();
    const candidates: Doc<"plans">[] = [];
    for (const cell of cellsAround(a.lat, a.lng, radius)) {
      // ponytail: reads each nearby cell's next 300 plans and filters in memory; add a time-bucketed index when a cell outgrows that
      candidates.push(
        ...(q
          ? await ctx.db
              .query("plans")
              .withSearchIndex("search", (s) => s.search("searchText", q).eq("cell", cell).eq("status", "active"))
              .take(50)
          : await ctx.db
              .query("plans")
              .withIndex("by_cell_start", (i) => i.eq("cell", cell).gte("startAt", now - 12 * 36e5).lte("startAt", a.to))
              .take(300)),
      );
    }

    const [blocked, friends, following, circles] = me
      ? await Promise.all([
          blockedIds(ctx, me._id),
          friendIds(ctx, me._id),
          followingIds(ctx, me._id),
          ctx.db.query("circleMembers").withIndex("by_user", (q) => q.eq("userId", me._id)).collect(),
        ])
      : [new Set<string>(), new Set<string>(), new Set<string>(), []];
    const myCircles = new Set<string>(circles.map((c) => c.circleId));
    const interests = new Set(me?.interests ?? []);

    const scored: { p: Doc<"plans">; score: number; reasons: string[]; d: number }[] = [];
    for (const p of candidates) {
      if (p.status !== "active" || p.endAt <= now || p.startAt > a.to || p.endAt < a.from) continue;
      if (blocked.has(p.hostId)) continue;
      const mine = p.hostId === me?._id;
      if (p.visibility === "private" && !mine) continue;
      if (p.visibility === "friends" && !mine && !friends.has(p.hostId)) continue;
      if (p.visibility === "circle" && !mine && !(p.circleId && myCircles.has(p.circleId))) continue;
      const d = distanceKm(a.lat, a.lng, p.lat, p.lng);
      if (d > radius) continue;
      if (a.category && p.category !== a.category) continue;
      if (a.maxCost !== undefined && p.cost > a.maxCost) continue;
      if (a.size === "small" && p.spots > 5) continue;
      if (a.size === "big" && p.spots <= 5) continue;
      if (a.openOnly && p.goingCount >= p.spots) continue;
      if (a.freeWindow && p.startAt > a.to - 30 * 60e3) continue;

      // Transparent scoring: every boost that matters is surfaced to the user as a reason.
      const hours = Math.max(0, (p.startAt - now) / 36e5);
      let score = 3 / (1 + hours / 6) + 2.5 / (1 + d / 2);
      const reasons: string[] = [];
      if (a.freeWindow) reasons.push("fits your free time");
      if (p.startAt <= now) {
        score += 1;
        reasons.push("happening now");
      }
      if (interests.has(p.category)) {
        score += 2;
        reasons.push(`you're into ${category(p.category).label}`);
      }
      if (following.has(p.hostId)) {
        score += 1.2;
        reasons.push(friends.has(p.hostId) ? "your friend is hosting" : "you follow the host");
      }
      if (p.goingCount >= p.spots) score -= 1.5;
      else if (p.spots - p.goingCount === 1) reasons.push("last spot");
      scored.push({ p, score, reasons, d });
    }
    scored.sort(
      a.sort === "soon"
        ? (x, y) => x.p.startAt - y.p.startAt
        : a.sort === "near"
          ? (x, y) => x.d - y.d
          : (x, y) => y.score - x.score,
    );

    const cards = [];
    for (const { p, score, reasons } of scored.slice(0, 60)) {
      const friendCount = me ? (await goingRows(ctx, p._id)).filter((r) => friends.has(r.userId)).length : 0;
      if (a.friends && !friendCount && !friends.has(p.hostId)) continue;
      if (friendCount) reasons.unshift(`${friendCount} friend${friendCount > 1 ? "s" : ""} going`);
      const card = await toCard(ctx, p, me, a);
      const unreliable = card.host?.reliability != null && card.host.reliability < 70;
      cards.push({ ...card, reasons: reasons.slice(0, 2), score: score + friendCount * 1.5 - (unreliable ? 1 : 0) });
    }
    if (a.sort === "soon") return cards.sort((x, y) => x.startAt - y.startAt);
    if (a.sort === "near") return cards.sort((x, y) => (x.distanceKm ?? 0) - (y.distanceKm ?? 0));
    return cards.sort((x, y) => y.score - x.score);
  },
});

// Public teaser for the landing page: soonest open public plans anywhere.
export const featured = query({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const rows = await ctx.db
      .query("plans")
      .withIndex("by_start", (q) => q.gte("startAt", now - 3 * 36e5))
      .take(80);
    const picks = rows
      .filter((p) => p.status === "active" && p.visibility === "public" && p.endAt > now && p.goingCount < p.spots)
      .slice(0, 8);
    return Promise.all(picks.map((p) => toCard(ctx, p, null)));
  },
});

export const get = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const planId = ctx.db.normalizeId("plans", id);
    const plan = planId && (await ctx.db.get(planId));
    if (!plan) return null;
    const me = await viewer(ctx);
    const access = await planAccess(ctx, plan, me);
    if (access === "none") return null;
    const card = await toCard(ctx, plan, me);
    const circle = plan.circleId ? await ctx.db.get(plan.circleId) : null;
    const circleInfo = circle ? { name: circle.name, slug: circle.slug, emoji: circle.emoji } : null;
    if (access === "restricted")
      return { restricted: true as const, card: { ...card, placeName: card.areaName ?? "", going: [] }, circle: circleInfo };

    const isHost = me?._id === plan.hostId;
    const going = await goingRows(ctx, plan._id);
    const friends = me ? await friendIds(ctx, me._id) : new Set<string>();
    const people = await Promise.all(
      going.map(async (g) => {
        const u = await publicUserById(ctx, g.userId);
        return u && { ...u, friend: friends.has(g.userId), checkedIn: !!g.checkedInAt, showedUp: g.attended ?? null };
      }),
    );
    const requests = isHost
      ? await Promise.all(
          (
            await ctx.db
              .query("participants")
              .withIndex("by_plan_status", (q) => q.eq("planId", plan._id).eq("status", "requested"))
              .collect()
          ).map(async (r) => ({ user: await publicUserById(ctx, r.userId), note: r.note ?? null })),
        )
      : [];
    // hosts need to see who's waiting, not just how many
    const waitlist = isHost
      ? await Promise.all(
          (
            await ctx.db
              .query("participants")
              .withIndex("by_plan_status", (q) => q.eq("planId", plan._id).eq("status", "waitlist"))
              .collect()
          ).map(async (r) => ({ user: await publicUserById(ctx, r.userId), note: r.note ?? null })),
        )
      : [];
    const mine = me ? await participation(ctx, plan._id, me._id) : null;
    return {
      restricted: false as const,
      waitlist: waitlist.filter((w) => w.user),
      card,
      description: plan.description ?? null,
      bring: plan.bring ?? null,
      requirements: plan.requirements ?? null,
      cancelReason: plan.cancelReason ?? null,
      hidden: plan.status === "hidden",
      circle: circleInfo,
      // signed-out visitors see who's going as avatars only
      going: me ? people.filter((p) => p !== null) : people.filter((p) => p !== null).map((p) => ({ ...p, name: "", handle: "" })),
      requests: requests.filter((r) => r.user),
      viewer: me
        ? {
            isHost,
            status: card.viewerStatus,
            checkedIn: !!mine?.checkedInAt,
            canChat: isHost || mine?.status === "going",
            followsHost: !isHost && (await isFriend(ctx, me._id, plan.hostId)) ? "friend" : null,
          }
        : null,
      // editable fields for the host
      raw: isHost
        ? {
            description: plan.description,
            bring: plan.bring,
            requirements: plan.requirements,
            placeName: plan.placeName,
            lat: plan.lat,
            lng: plan.lng,
            exactFor: plan.exactFor,
          }
        : null,
    };
  },
});

export const mine = query({
  args: { tab: v.union(v.literal("upcoming"), v.literal("hosting"), v.literal("saved"), v.literal("past")) },
  handler: async (ctx, { tab }) => {
    const me = await viewer(ctx);
    if (!me) return [];
    const now = Date.now();
    const hosted = () =>
      ctx.db
        .query("plans")
        .withIndex("by_host_start", (q) => q.eq("hostId", me._id))
        .order("desc")
        .take(100);
    const joined = async (statuses: Doc<"participants">["status"][]) => {
      const rows = (
        await Promise.all(
          statuses.map((s) =>
            ctx.db
              .query("participants")
              .withIndex("by_user_status", (q) => q.eq("userId", me._id).eq("status", s))
              .order("desc")
              .take(150),
          ),
        )
      ).flat();
      return (await Promise.all(rows.map((r) => ctx.db.get(r.planId)))).filter((p) => p !== null);
    };
    let plans: Doc<"plans">[] = [];
    if (tab === "upcoming") {
      plans = [...(await hosted()), ...(await joined(["going", "waitlist", "requested"]))].filter(
        (p) => p.endAt > now && p.status !== "hidden",
      );
      plans.sort((a, b) => a.startAt - b.startAt);
    } else if (tab === "hosting") {
      plans = (await hosted()).filter((p) => p.endAt > now - 864e5);
      plans.sort((a, b) => a.startAt - b.startAt);
    } else if (tab === "saved") {
      const saves = await ctx.db.query("saves").withIndex("by_user", (q) => q.eq("userId", me._id)).order("desc").take(100);
      plans = (await Promise.all(saves.map((s) => ctx.db.get(s.planId)))).filter(
        (p): p is Doc<"plans"> => !!p && p.endAt > now && p.status !== "hidden",
      );
    } else {
      plans = [...(await hosted()), ...(await joined(["going"]))].filter((p) => p.endAt <= now || p.status === "cancelled");
      plans.sort((a, b) => b.startAt - a.startAt);
    }
    const seen = new Set<string>();
    plans = plans.filter((p) => !seen.has(p._id) && seen.add(p._id));
    return Promise.all(plans.slice(0, 60).map((p) => toCard(ctx, p, me)));
  },
});

export const byHost = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const me = await viewer(ctx);
    const now = Date.now();
    const rows = await ctx.db
      .query("plans")
      .withIndex("by_host_start", (q) => q.eq("hostId", userId).gte("startAt", now - 12 * 36e5))
      .take(30);
    const visible = [];
    for (const p of rows) {
      if (p.status !== "active" || p.endAt <= now || p.visibility === "private") continue;
      if ((await planAccess(ctx, p, me)) === "full") visible.push(await toCard(ctx, p, me));
    }
    return visible;
  },
});

// ---------------- mutations ----------------

export const create = mutation({
  args: planFields,
  handler: async (ctx, a) => {
    const me = await requireActive(ctx);
    const c = clean(a, me, true);
    const isNewAccount = Date.now() - me._creationTime < 864e5;
    await rateLimit(ctx, `plan:${me._id}`, isNewAccount ? 3 : 12, 864e5, "that's a lot of plans for one day — try again tomorrow");
    if (a.visibility === "circle") await assertCircleMember(ctx, a.circleId, me._id);
    const { durationMin: _d, ...rest } = a;
    const planId = await ctx.db.insert("plans", {
      ...rest,
      ...c,
      hostId: me._id,
      currency: a.currency ?? "INR",
      circleId: a.visibility === "circle" ? a.circleId : undefined,
      goingCount: 0,
      waitCount: 0,
      status: "active",
    });
    const key = threadKeyForPlan(planId);
    await addThreadMember(ctx, key, me._id);
    await postMessage(ctx, key, me._id, "plan chat is open — only people who are in can see this", "system");
    await schedulePlanJobs(ctx, planId, a.startAt, c.endAt);
    await ctx.scheduler.runAfter(0, internal.jobs.fanoutNewPlan, { planId });
    await track(ctx, "plan_created", me._id, { category: a.category, visibility: a.visibility, isNow: !!a.isNow });
    return planId;
  },
});

export const update = mutation({
  args: { id: v.id("plans"), ...planFields },
  handler: async (ctx, { id, ...a }) => {
    const me = await requireActive(ctx);
    const plan = await getPlanOr404(ctx, id);
    hostOnly(plan, me);
    if (plan.status === "cancelled" || plan.endAt < Date.now()) throw new ConvexError("this plan has already wrapped up");
    const c = clean(a, me, a.startAt !== plan.startAt);
    if (a.spots < plan.goingCount)
      throw new ConvexError(`${plan.goingCount} people are already in — you can't go below that. remove someone first.`);
    if (a.visibility === "circle") await assertCircleMember(ctx, a.circleId, me._id);
    const { durationMin: _d, ...rest } = a;
    await ctx.db.patch(id, { ...rest, ...c, circleId: a.visibility === "circle" ? a.circleId : undefined });

    const changes: string[] = [];
    if (a.startAt !== plan.startAt) changes.push(`now ${clock(a.startAt, a.tz ?? plan.tz)}`);
    if (a.placeName.trim() !== plan.placeName) changes.push(`now at ${c.placeName}`);
    if (changes.length) {
      const text = `${plan.title} changed: ${changes.join(", ")}`;
      await notifyAll(ctx, plan, ["going", "waitlist", "requested"], { kind: "changed", text, actorId: me._id });
      await postMessage(ctx, threadKeyForPlan(id), me._id, `host updated the plan — ${changes.join(", ")}`, "system");
    }
    if (a.startAt !== plan.startAt || c.endAt !== plan.endAt) await schedulePlanJobs(ctx, id, a.startAt, c.endAt);
    const fresh = (await ctx.db.get(id))!;
    if (fresh.spots > fresh.goingCount && fresh.waitCount > 0) await promote(ctx, fresh);
    await track(ctx, "plan_updated", me._id, { planId: id, changed: changes.length > 0 });
  },
});

export const cancel = mutation({
  args: { id: v.id("plans"), reason: v.optional(v.string()) },
  handler: async (ctx, { id, reason }) => {
    const me = await requireViewer(ctx);
    const plan = await getPlanOr404(ctx, id);
    hostOnly(plan, me);
    if (plan.status === "cancelled") return;
    const r = reason?.trim().slice(0, 200) || undefined;
    await ctx.db.patch(id, { status: "cancelled", cancelReason: r });
    await notifyAll(ctx, plan, ["going", "waitlist", "requested"], {
      kind: "cancelled",
      text: `${plan.title} was cancelled${r ? `: “${r}”` : ""}`,
      actorId: me._id,
    });
    await postMessage(ctx, threadKeyForPlan(id), me._id, `the host cancelled this plan${r ? ` — ${r}` : ""}`, "system");
    await track(ctx, "plan_cancelled", me._id, { planId: id, hoursBefore: (plan.startAt - Date.now()) / 36e5 });
  },
});

export const join = mutation({
  args: { id: v.id("plans"), note: v.optional(v.string()), ref: v.optional(v.string()) },
  handler: async (ctx, { id, note, ref }) => {
    const me = await requireActive(ctx);
    const plan = await getPlanOr404(ctx, id);
    if (plan.hostId === me._id) throw new ConvexError("you're hosting this one");
    if (plan.status !== "active") throw new ConvexError("this plan isn't taking people anymore");
    if (plan.endAt <= Date.now()) throw new ConvexError("this plan already wrapped up");
    if (await isBlocked(ctx, me._id, plan.hostId)) throw new ConvexError("you can't join this plan");
    if ((await planAccess(ctx, plan, me)) !== "full") throw new ConvexError("this plan is only open to the host's friends or circle");
    await rateLimit(ctx, `join:${me._id}`, 25, 36e5);

    const existing = await participation(ctx, id, me._id);
    if (existing && ["going", "waitlist", "requested"].includes(existing.status)) return existing.status;
    if (existing?.status === "removed") throw new ConvexError("the host removed you from this plan");

    const status: Doc<"participants">["status"] = plan.approval
      ? "requested"
      : plan.goingCount < plan.spots
        ? "going"
        : "waitlist";
    const fields = { status, note: note?.trim().slice(0, 200) || undefined, joinedAt: Date.now(), checkedInAt: undefined };
    if (existing) await ctx.db.patch(existing._id, fields);
    else await ctx.db.insert("participants", { planId: id, userId: me._id, ...fields });

    const name = me.name ?? "someone";
    if (status === "going") {
      const goingCount = plan.goingCount + 1;
      await ctx.db.patch(id, { goingCount });
      await addThreadMember(ctx, threadKeyForPlan(id), me._id);
      await postMessage(ctx, threadKeyForPlan(id), me._id, `${name} is in 🙌`, "system");
      await notify(ctx, plan.hostId, {
        kind: "joined",
        text: `${name} is in for ${plan.title} · ${goingCount}/${plan.spots}`,
        planId: id,
        actorId: me._id,
      });
      if (plan.spots - goingCount === 1) {
        const savers = await ctx.db.query("saves").withIndex("by_plan", (q) => q.eq("planId", id)).take(200);
        for (const s of savers)
          if (s.userId !== me._id)
            await notify(ctx, s.userId, { kind: "almost_full", text: `last spot left on ${plan.title}`, planId: id });
      }
    } else if (status === "waitlist") {
      await ctx.db.patch(id, { waitCount: plan.waitCount + 1 });
    } else {
      await notify(ctx, plan.hostId, {
        kind: "request",
        text: `${name} wants to join ${plan.title}${fields.note ? `: “${fields.note}”` : ""}`,
        planId: id,
        actorId: me._id,
      });
    }
    await track(ctx, "plan_joined", me._id, { planId: id, status, ref: ref ?? null });
    return status;
  },
});

export const leave = mutation({
  args: { id: v.id("plans") },
  handler: async (ctx, { id }) => {
    const me = await requireViewer(ctx);
    const plan = await getPlanOr404(ctx, id);
    const p = await participation(ctx, id, me._id);
    if (!p || !["going", "waitlist", "requested"].includes(p.status)) return;
    await ctx.db.patch(p._id, { status: "left" });
    if (p.status === "waitlist") return void (await ctx.db.patch(id, { waitCount: Math.max(0, plan.waitCount - 1) }));
    if (p.status === "requested") return;

    // dropping out close to start time counts (lightly) against reliability
    const hoursLeft = (plan.startAt - Date.now()) / 36e5;
    if (plan.status === "active" && hoursLeft > 0 && hoursLeft < 2) await ctx.db.patch(me._id, { lateCancels: (me.lateCancels ?? 0) + 1 });
    await ctx.db.patch(id, { goingCount: Math.max(0, plan.goingCount - 1) });
    await removeThreadMember(ctx, threadKeyForPlan(id), me._id);
    await postMessage(ctx, threadKeyForPlan(id), me._id, `${me.name ?? "someone"} can't make it anymore`, "system");
    await notify(ctx, plan.hostId, { kind: "left", text: `${me.name ?? "someone"} dropped out of ${plan.title}`, planId: id, actorId: me._id });
    if (plan.status === "active") await promote(ctx, (await ctx.db.get(id))!);
    await track(ctx, "plan_left", me._id, { planId: id, hoursLeft });
  },
});

export const respond = mutation({
  args: { id: v.id("plans"), userId: v.id("users"), accept: v.boolean() },
  handler: async (ctx, { id, userId, accept }) => {
    const me = await requireViewer(ctx);
    const plan = await getPlanOr404(ctx, id);
    hostOnly(plan, me);
    if (accept && (plan.status !== "active" || plan.endAt <= Date.now())) throw new ConvexError("this plan isn't taking people anymore");
    const p = await participation(ctx, id, userId);
    if (!p || p.status !== "requested") return;
    if (!accept) {
      await ctx.db.patch(p._id, { status: "declined" });
      return void (await notify(ctx, userId, {
        kind: "declined",
        text: `${plan.title} is full up this time — plenty more plans nearby`,
        planId: id,
      }));
    }
    const u = await ctx.db.get(userId);
    if (plan.goingCount < plan.spots) {
      await ctx.db.patch(p._id, { status: "going" });
      await ctx.db.patch(id, { goingCount: plan.goingCount + 1 });
      await addThreadMember(ctx, threadKeyForPlan(id), userId);
      await postMessage(ctx, threadKeyForPlan(id), userId, `${u?.name ?? "someone"} is in 🙌`, "system");
      await notify(ctx, userId, { kind: "approved", text: `you're in for ${plan.title} 🎉`, planId: id, actorId: me._id });
    } else {
      await ctx.db.patch(p._id, { status: "waitlist" });
      await ctx.db.patch(id, { waitCount: plan.waitCount + 1 });
      await notify(ctx, userId, {
        kind: "approved",
        text: `approved for ${plan.title} — you're first in line if a spot opens`,
        planId: id,
        actorId: me._id,
      });
    }
  },
});

export const removeParticipant = mutation({
  args: { id: v.id("plans"), userId: v.id("users") },
  handler: async (ctx, { id, userId }) => {
    const me = await requireViewer(ctx);
    const plan = await getPlanOr404(ctx, id);
    hostOnly(plan, me);
    const p = await participation(ctx, id, userId);
    if (!p || !["going", "waitlist", "requested"].includes(p.status)) return;
    await ctx.db.patch(p._id, { status: "removed" });
    if (p.status === "going") {
      await ctx.db.patch(id, { goingCount: Math.max(0, plan.goingCount - 1) });
      await removeThreadMember(ctx, threadKeyForPlan(id), userId);
      await promote(ctx, (await ctx.db.get(id))!);
    } else if (p.status === "waitlist") await ctx.db.patch(id, { waitCount: Math.max(0, plan.waitCount - 1) });
    await notify(ctx, userId, { kind: "removed", text: `the host made a change — you're no longer on ${plan.title}`, planId: id });
    await track(ctx, "participant_removed", me._id, { planId: id });
  },
});

export const toggleSave = mutation({
  args: { id: v.id("plans") },
  handler: async (ctx, { id }) => {
    const me = await requireViewer(ctx);
    if (!(await ctx.db.get(id))) throw new ConvexError("this plan doesn't exist anymore");
    const row = await ctx.db
      .query("saves")
      .withIndex("by_user_plan", (q) => q.eq("userId", me._id).eq("planId", id))
      .unique();
    if (row) return void (await ctx.db.delete(row._id));
    await ctx.db.insert("saves", { userId: me._id, planId: id });
    return true;
  },
});

export const checkIn = mutation({
  args: { id: v.id("plans") },
  handler: async (ctx, { id }) => {
    const me = await requireViewer(ctx);
    const plan = await getPlanOr404(ctx, id);
    const now = Date.now();
    if (now < plan.startAt - 30 * 60e3) throw new ConvexError("check-in opens 30 minutes before the plan starts");
    if (now > plan.endAt + 60 * 60e3 || plan.status !== "active") throw new ConvexError("check-in for this plan has closed");
    const p = await participation(ctx, id, me._id);
    if (!p || p.status !== "going") throw new ConvexError("you're not on this plan");
    await ctx.db.patch(p._id, { checkedInAt: now, attended: true });
    await postMessage(ctx, threadKeyForPlan(id), me._id, `${me.name ?? "someone"} is here 📍`, "system");
    await track(ctx, "checked_in", me._id, { planId: id });
  },
});

export const markAttendance = mutation({
  args: { id: v.id("plans"), userId: v.id("users"), attended: v.boolean() },
  handler: async (ctx, { id, userId, attended }) => {
    const me = await requireViewer(ctx);
    const plan = await getPlanOr404(ctx, id);
    hostOnly(plan, me);
    if (Date.now() < plan.startAt) throw new ConvexError("you can mark attendance once the plan starts");
    if (plan.finalized) throw new ConvexError("attendance for this plan is already locked in");
    const p = await participation(ctx, id, userId);
    if (!p || p.status !== "going") return;
    await ctx.db.patch(p._id, { attended });
  },
});

export const invite = mutation({
  args: { id: v.id("plans"), userIds: v.array(v.id("users")) },
  handler: async (ctx, { id, userIds }) => {
    const me = await requireActive(ctx);
    const plan = await getPlanOr404(ctx, id);
    if (plan.status !== "active" || plan.endAt <= Date.now()) throw new ConvexError("this plan isn't taking people anymore");
    const mine = await participation(ctx, id, me._id);
    if (plan.hostId !== me._id && mine?.status !== "going") throw new ConvexError("join the plan before inviting people");
    if (userIds.length > 20) throw new ConvexError("invite up to 20 people at a time");
    await rateLimit(ctx, `invite:${me._id}`, 60, 864e5);
    const friends = await friendIds(ctx, me._id);
    let sent = 0;
    for (const uid of userIds) {
      if (!friends.has(uid) || (await isBlocked(ctx, uid, plan.hostId))) continue;
      const existing = await participation(ctx, id, uid);
      if (existing && ["going", "waitlist", "requested"].includes(existing.status)) continue;
      await notify(ctx, uid, { kind: "invite", text: `${me.name} invited you to ${plan.title}`, planId: id, actorId: me._id });
      sent++;
    }
    await track(ctx, "plan_invited", me._id, { planId: id, sent });
    return sent;
  },
});

export const shared = mutation({
  args: { id: v.id("plans"), channel: v.string() },
  handler: async (ctx, { id, channel }) => {
    // signed-in only: an open endpoint that writes a row per call is a free way to fill our tables
    const me = await viewer(ctx);
    if (!me) return;
    await rateLimit(ctx, `share:${me._id}`, 60, 36e5);
    await track(ctx, "plan_shared", me._id, { planId: id, channel: channel.slice(0, 20) });
  },
});

// People who could fill the plan: friends who are free right now, or who are into this activity.
export const inviteCandidates = query({
  args: { id: v.id("plans") },
  handler: async (ctx, { id }) => {
    const me = await viewer(ctx);
    const plan = await ctx.db.get(id);
    if (!me || !plan) return [];
    const now = Date.now();
    const out = [];
    for (const fid of await friendIds(ctx, me._id)) {
      const u = await ctx.db.get(fid as Id<"users">);
      if (!u || u.deletedAt || fid === plan.hostId) continue;
      const p = await participation(ctx, id, u._id);
      if (p && ["going", "waitlist", "requested"].includes(p.status)) continue;
      const free = u.showFreeToFriends !== false && (u.freeUntil ?? 0) > now;
      out.push({ ...(await publicUser(ctx, u)), free, likes: (u.interests ?? []).includes(plan.category) });
    }
    return out.sort((a, b) => Number(b.free) - Number(a.free) || Number(b.likes) - Number(a.likes));
  },
});
