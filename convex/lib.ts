import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import { Doc, Id } from "./_generated/dataModel";
import { MutationCtx, QueryCtx } from "./_generated/server";
import { approx, distanceKm, reliability } from "./shared";

// ---------- identity ----------

export async function viewer(ctx: QueryCtx) {
  const id = await getAuthUserId(ctx);
  if (!id) return null;
  const u = await ctx.db.get(id);
  return u && !u.deletedAt ? u : null;
}

export async function requireViewer(ctx: QueryCtx) {
  const u = await viewer(ctx);
  if (!u) throw new ConvexError("please sign in first");
  return u;
}

// Anything that creates content or reaches other people goes through here.
export async function requireActive(ctx: QueryCtx) {
  const u = await requireViewer(ctx);
  if (!u.onboardedAt) throw new ConvexError("finish setting up your profile first");
  if (u.suspendedUntil && u.suspendedUntil > Date.now())
    throw new ConvexError("your account is paused while we review a report. we'll email you soon.");
  return u;
}

export async function requireAdmin(ctx: QueryCtx) {
  const u = await requireViewer(ctx);
  if (u.role !== "admin") throw new ConvexError("admins only");
  return u;
}

export async function publicUser(ctx: QueryCtx, u: Doc<"users">) {
  return {
    _id: u._id,
    name: u.deletedAt ? "deleted account" : (u.name ?? "someone"),
    handle: u.handle ?? "",
    emoji: u.emoji ?? "🙂",
    color: u.color ?? "#A0C4FF",
    image: u.imageId ? await ctx.storage.getUrl(u.imageId) : null,
    verifiedHost: !!u.verifiedHost,
    reliability: reliability(u),
    attended: u.attended ?? 0,
    isNew: Date.now() - u._creationTime < 14 * 864e5,
  };
}
export type PublicUser = Awaited<ReturnType<typeof publicUser>>;

export async function publicUserById(ctx: QueryCtx, id: Id<"users">) {
  const u = await ctx.db.get(id);
  return u ? publicUser(ctx, u) : null;
}

// ---------- abuse protection ----------

// ponytail: fixed-window counter in a table; swap for @convex-dev/rate-limiter if we need token buckets/sharding
export async function rateLimit(
  ctx: MutationCtx,
  key: string,
  max: number,
  windowMs: number,
  message = "easy there — give it a minute and try again",
) {
  const now = Date.now();
  const row = await ctx.db
    .query("rateLimits")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  if (!row) return void (await ctx.db.insert("rateLimits", { key, windowStart: now, count: 1 }));
  if (now - row.windowStart > windowMs) return void (await ctx.db.patch(row._id, { windowStart: now, count: 1 }));
  if (row.count >= max) throw new ConvexError(message);
  await ctx.db.patch(row._id, { count: row.count + 1 });
}

// ---------- graph ----------

export async function blockedIds(ctx: QueryCtx, userId: Id<"users">) {
  const [mine, theirs] = await Promise.all([
    ctx.db.query("blocks").withIndex("by_blocker", (q) => q.eq("blockerId", userId)).collect(),
    ctx.db.query("blocks").withIndex("by_blocked", (q) => q.eq("blockedId", userId)).collect(),
  ]);
  return new Set<string>([...mine.map((b) => b.blockedId), ...theirs.map((b) => b.blockerId)]);
}

export async function isBlocked(ctx: QueryCtx, a: Id<"users">, b: Id<"users">) {
  const [x, y] = await Promise.all([
    ctx.db.query("blocks").withIndex("by_pair", (q) => q.eq("blockerId", a).eq("blockedId", b)).unique(),
    ctx.db.query("blocks").withIndex("by_pair", (q) => q.eq("blockerId", b).eq("blockedId", a)).unique(),
  ]);
  return !!(x || y);
}

export async function followingIds(ctx: QueryCtx, userId: Id<"users">) {
  const rows = await ctx.db.query("follows").withIndex("by_follower", (q) => q.eq("followerId", userId)).collect();
  return new Set<string>(rows.map((r) => r.followeeId));
}

// "friends" = mutual follows. No friend requests, no counts — just who you'd plan with.
export async function friendIds(ctx: QueryCtx, userId: Id<"users">) {
  const [following, followers] = await Promise.all([
    followingIds(ctx, userId),
    ctx.db.query("follows").withIndex("by_followee", (q) => q.eq("followeeId", userId)).collect(),
  ]);
  return new Set<string>(followers.map((f) => f.followerId).filter((id) => following.has(id)));
}

export async function follows(ctx: QueryCtx, a: Id<"users">, b: Id<"users">) {
  return !!(await ctx.db
    .query("follows")
    .withIndex("by_pair", (q) => q.eq("followerId", a).eq("followeeId", b))
    .unique());
}

export async function isFriend(ctx: QueryCtx, a: Id<"users">, b: Id<"users">) {
  return (await follows(ctx, a, b)) && (await follows(ctx, b, a));
}

// ---------- side effects ----------

export async function notify(
  ctx: MutationCtx,
  userId: Id<"users">,
  n: { kind: string; text: string; planId?: Id<"plans">; actorId?: Id<"users"> },
) {
  if (n.actorId && n.actorId === userId) return;
  await ctx.db.insert("notifications", { userId, read: false, ...n });
}

export async function track(ctx: MutationCtx, name: string, userId?: Id<"users">, props?: Record<string, unknown>) {
  await ctx.db.insert("events", { name, userId, props });
  console.log(JSON.stringify({ event: name, userId, ...props }));
}

// ---------- threads ----------

export async function threadMember(ctx: QueryCtx, threadKey: string, userId: Id<"users">) {
  return ctx.db
    .query("threadMembers")
    .withIndex("by_thread_user", (q) => q.eq("threadKey", threadKey).eq("userId", userId))
    .unique();
}

export async function addThreadMember(ctx: MutationCtx, threadKey: string, userId: Id<"users">) {
  if (await threadMember(ctx, threadKey, userId)) return;
  const now = Date.now();
  await ctx.db.insert("threadMembers", { threadKey, userId, lastMessageAt: now, lastReadAt: now });
}

export async function removeThreadMember(ctx: MutationCtx, threadKey: string, userId: Id<"users">) {
  const row = await threadMember(ctx, threadKey, userId);
  if (row) await ctx.db.delete(row._id);
}

export async function postMessage(
  ctx: MutationCtx,
  threadKey: string,
  authorId: Id<"users">,
  body: string,
  kind: "text" | "system" = "text",
) {
  await ctx.db.insert("messages", { threadKey, authorId, body, kind });
  const now = Date.now();
  const members = await ctx.db.query("threadMembers").withIndex("by_thread", (q) => q.eq("threadKey", threadKey)).collect();
  // ponytail: fan-out on write to every member row; fine for plan-sized groups, move to a scheduled fan-out for 1k+ member threads
  for (const m of members) {
    if (kind === "system") await ctx.db.patch(m._id, { preview: body.slice(0, 90) });
    else
      await ctx.db.patch(m._id, {
        lastMessageAt: now,
        preview: body.slice(0, 90),
        ...(m.userId === authorId ? { lastReadAt: now } : {}),
      });
  }
}

// ---------- plans ----------

export async function participation(ctx: QueryCtx, planId: Id<"plans">, userId: Id<"users">) {
  return ctx.db
    .query("participants")
    .withIndex("by_plan_user", (q) => q.eq("planId", planId).eq("userId", userId))
    .unique();
}

export async function goingRows(ctx: QueryCtx, planId: Id<"plans">) {
  return ctx.db
    .query("participants")
    .withIndex("by_plan_status", (q) => q.eq("planId", planId).eq("status", "going"))
    .collect();
}

export async function schedulePlanJobs(ctx: MutationCtx, planId: Id<"plans">, startAt: number, endAt: number) {
  const remindAt = startAt - 60 * 60 * 1000;
  if (remindAt > Date.now()) await ctx.scheduler.runAt(remindAt, internal.jobs.remind, { planId, startAt });
  await ctx.scheduler.runAt(endAt, internal.jobs.complete, { planId, endAt });
}

// Can this viewer see the plan at all ("full"), only a teaser ("restricted"), or nothing ("none")?
export async function planAccess(ctx: QueryCtx, plan: Doc<"plans">, me: Doc<"users"> | null) {
  if (me?.role === "admin") return "full" as const;
  const isHost = me?._id === plan.hostId;
  if (plan.status === "hidden" && !isHost) return "none" as const;
  if (me && !isHost && (await isBlocked(ctx, me._id, plan.hostId))) return "none" as const;
  if (plan.visibility === "public" || plan.visibility === "private" || isHost) return "full" as const;
  if (!me) return "restricted" as const;
  const p = await participation(ctx, plan._id, me._id);
  if (p && ["going", "waitlist", "requested"].includes(p.status)) return "full" as const;
  if (plan.visibility === "friends") return (await isFriend(ctx, me._id, plan.hostId)) ? "full" : "restricted";
  if (plan.visibility === "circle" && plan.circleId) {
    const member = await ctx.db
      .query("circleMembers")
      .withIndex("by_pair", (q) => q.eq("circleId", plan.circleId!).eq("userId", me._id))
      .unique();
    return member ? "full" : "restricted";
  }
  return "restricted" as const;
}

// The card shape used everywhere a plan is listed. Exact spot is hidden until you join when the host asked for that.
export async function toCard(
  ctx: QueryCtx,
  plan: Doc<"plans">,
  me: Doc<"users"> | null,
  from?: { lat: number; lng: number },
) {
  const [host, going, mine, saved] = await Promise.all([
    publicUserById(ctx, plan.hostId),
    ctx.db
      .query("participants")
      .withIndex("by_plan_status", (q) => q.eq("planId", plan._id).eq("status", "going"))
      .take(4),
    me ? participation(ctx, plan._id, me._id) : null,
    me
      ? ctx.db
          .query("saves")
          .withIndex("by_user_plan", (q) => q.eq("userId", me._id).eq("planId", plan._id))
          .unique()
      : null,
  ]);
  const isHost = me?._id === plan.hostId;
  const exact = plan.exactFor === "everyone" || isHost || mine?.status === "going";
  return {
    _id: plan._id,
    title: plan.title,
    category: plan.category,
    startAt: plan.startAt,
    endAt: plan.endAt,
    tz: plan.tz,
    isNow: !!plan.isNow,
    status: plan.status,
    spots: plan.spots,
    goingCount: plan.goingCount,
    waitCount: plan.waitCount,
    cost: plan.cost,
    currency: plan.currency,
    visibility: plan.visibility,
    approval: plan.approval,
    hasRequirements: !!plan.requirements,
    recurrence: plan.recurrence ?? null,
    circleId: plan.circleId ?? null,
    exact,
    placeName: exact ? plan.placeName : (plan.areaName ?? "exact spot shared after you join"),
    areaName: plan.areaName ?? null,
    lat: exact ? plan.lat : approx(plan.lat),
    lng: exact ? plan.lng : approx(plan.lng),
    distanceKm: from ? distanceKm(from.lat, from.lng, plan.lat, plan.lng) : null,
    host,
    going: (await Promise.all(going.map((g) => publicUserById(ctx, g.userId)))).filter((x) => x !== null),
    viewerStatus: isHost ? ("host" as const) : (mine?.status ?? null),
    saved: !!saved,
    reasons: [] as string[],
  };
}
export type PlanCard = Awaited<ReturnType<typeof toCard>>;
