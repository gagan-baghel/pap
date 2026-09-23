import { ConvexError, v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import {
  blockedIds,
  follows,
  friendIds,
  notify,
  publicUser,
  rateLimit,
  requireActive,
  requireViewer,
  toCard,
  track,
  viewer,
} from "./lib";
import { AVAILABILITY, CATEGORIES, approx, reliability } from "./shared";

const RESERVED = new Set(["admin", "pap", "support", "help", "settings", "me", "discover", "plans", "inbox", "create", "api"]);
const normHandle = (h: string) => h.trim().toLowerCase().replace(/^@/, "");
const handleError = (h: string) =>
  !/^[a-z0-9_.]{3,20}$/.test(h)
    ? "3–20 characters: letters, numbers, dots or underscores"
    : RESERVED.has(h)
      ? "that handle is reserved"
      : null;

const cleanList = (list: string[], allowed: readonly { key: string }[]) =>
  [...new Set(list)].filter((k) => allowed.some((a) => a.key === k)).slice(0, 12);

export const me = query({
  args: {},
  handler: async (ctx) => {
    const u = await viewer(ctx);
    if (!u) return null;
    return {
      ...u,
      image: u.imageId ? await ctx.storage.getUrl(u.imageId) : null,
      reliability: reliability(u),
      isAdmin: u.role === "admin",
    };
  },
});

export const handleAvailable = query({
  args: { handle: v.string() },
  handler: async (ctx, { handle }) => {
    const h = normHandle(handle);
    const err = handleError(h);
    if (err) return { ok: false, reason: err };
    const me = await viewer(ctx);
    const taken = await ctx.db.query("users").withIndex("by_handle", (q) => q.eq("handle", h)).unique();
    return taken && taken._id !== me?._id ? { ok: false, reason: "taken — try another" } : { ok: true, reason: null };
  },
});

export const completeOnboarding = mutation({
  args: {
    name: v.string(),
    handle: v.string(),
    emoji: v.string(),
    color: v.string(),
    interests: v.array(v.string()),
    availability: v.array(v.string()),
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
    areaName: v.optional(v.string()),
    heardFrom: v.optional(v.string()),
    ref: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    const me = await requireViewer(ctx);
    const name = a.name.trim().replace(/\s+/g, " ");
    if (name.length < 1 || name.length > 40) throw new ConvexError("what should people call you?");
    const handle = normHandle(a.handle);
    const err = handleError(handle);
    if (err) throw new ConvexError(err);
    const taken = await ctx.db.query("users").withIndex("by_handle", (q) => q.eq("handle", handle)).unique();
    if (taken && taken._id !== me._id) throw new ConvexError("that handle is taken");
    const interests = cleanList(a.interests, CATEGORIES);
    if (interests.length < 1) throw new ConvexError("pick at least one thing you like doing");

    const refId = a.ref ? ctx.db.normalizeId("users", a.ref) : null;
    const refUser = refId && refId !== me._id ? await ctx.db.get(refId) : null;
    const referrer = refUser && !refUser.deletedAt && refUser.onboardedAt ? refUser._id : null;
    const firstTime = !me.onboardedAt;
    await ctx.db.patch(me._id, {
      name,
      handle,
      searchName: `${name} ${handle}`.toLowerCase(),
      emoji: [...a.emoji].slice(0, 2).join("") || "🙂",
      color: /^#[0-9a-f]{6}$/i.test(a.color) ? a.color : "#A0C4FF",
      interests,
      availability: cleanList(a.availability, AVAILABILITY),
      homeLat: a.lat !== undefined ? approx(a.lat) : me.homeLat,
      homeLng: a.lng !== undefined ? approx(a.lng) : me.homeLng,
      areaName: a.areaName?.trim().slice(0, 60) || me.areaName,
      heardFrom: a.heardFrom?.slice(0, 20),
      onboardedAt: me.onboardedAt ?? Date.now(),
      dmPolicy: me.dmPolicy ?? "planned",
      showFreeToFriends: me.showFreeToFriends ?? true,
      notifyFollowing: me.notifyFollowing ?? true,
      radiusKm: me.radiusKm ?? 10,
      ...(firstTime && referrer ? { referredBy: referrer } : {}),
    });

    // Invite loop: you follow whoever brought you here, and they get a one-tap "follow back".
    // Never an automatic friendship — a ref is just a URL param, and friendship unlocks
    // free-now status and friends-only plans, so both sides have to choose it.
    if (firstTime && referrer) {
      if (!(await follows(ctx, me._id, referrer))) await ctx.db.insert("follows", { followerId: me._id, followeeId: referrer });
      await notify(ctx, referrer, { kind: "referral", text: `${name} joined PAP from your link — follow back to be friends`, actorId: me._id });
    }
    if (firstTime) await track(ctx, "onboarding_completed", me._id, { interests: interests.length, heardFrom: a.heardFrom, referred: !!referrer });
  },
});

export const updateProfile = mutation({
  args: {
    name: v.optional(v.string()),
    handle: v.optional(v.string()),
    bio: v.optional(v.string()),
    emoji: v.optional(v.string()),
    color: v.optional(v.string()),
    interests: v.optional(v.array(v.string())),
    availability: v.optional(v.array(v.string())),
  },
  handler: async (ctx, a) => {
    const me = await requireViewer(ctx);
    const patch: Record<string, unknown> = {};
    if (a.name !== undefined) {
      const name = a.name.trim();
      if (!name || name.length > 40) throw new ConvexError("name must be 1–40 characters");
      patch.name = name;
    }
    if (a.handle !== undefined) {
      const h = normHandle(a.handle);
      const err = handleError(h);
      if (err) throw new ConvexError(err);
      const taken = await ctx.db.query("users").withIndex("by_handle", (q) => q.eq("handle", h)).unique();
      if (taken && taken._id !== me._id) throw new ConvexError("that handle is taken");
      patch.handle = h;
    }
    if (a.bio !== undefined) {
      if (a.bio.length > 160) throw new ConvexError("keep your bio under 160 characters");
      patch.bio = a.bio.trim();
    }
    if (a.emoji !== undefined) patch.emoji = [...a.emoji].slice(0, 2).join("") || "🙂";
    if (a.color !== undefined && /^#[0-9a-f]{6}$/i.test(a.color)) patch.color = a.color;
    if (a.interests !== undefined) patch.interests = cleanList(a.interests, CATEGORIES);
    if (a.availability !== undefined) patch.availability = cleanList(a.availability, AVAILABILITY);
    patch.searchName = `${(patch.name as string) ?? me.name ?? ""} ${(patch.handle as string) ?? me.handle ?? ""}`.toLowerCase();
    await ctx.db.patch(me._id, patch);
  },
});

export const updateLocation = mutation({
  args: { lat: v.number(), lng: v.number(), areaName: v.optional(v.string()) },
  handler: async (ctx, a) => {
    const me = await requireViewer(ctx);
    if (Math.abs(a.lat) > 90 || Math.abs(a.lng) > 180) throw new ConvexError("that location doesn't look right");
    await ctx.db.patch(me._id, {
      homeLat: approx(a.lat),
      homeLng: approx(a.lng),
      ...(a.areaName ? { areaName: a.areaName.slice(0, 60) } : {}),
    });
  },
});

export const updateSettings = mutation({
  args: {
    dmPolicy: v.optional(v.union(v.literal("planned"), v.literal("friends"), v.literal("none"))),
    showFreeToFriends: v.optional(v.boolean()),
    notifyFollowing: v.optional(v.boolean()),
    radiusKm: v.optional(v.number()),
  },
  handler: async (ctx, a) => {
    const me = await requireViewer(ctx);
    if (a.radiusKm !== undefined && (a.radiusKm < 1 || a.radiusKm > 80)) throw new ConvexError("radius must be 1–80 km");
    await ctx.db.patch(me._id, a);
  },
});

export const setFree = mutation({
  args: { minutes: v.union(v.number(), v.null()), note: v.optional(v.string()) },
  handler: async (ctx, { minutes, note }) => {
    const me = await requireViewer(ctx);
    if (minutes === null) return void (await ctx.db.patch(me._id, { freeUntil: undefined, freeNote: undefined }));
    if (minutes < 15 || minutes > 12 * 60) throw new ConvexError("free time can be between 15 minutes and 12 hours");
    await ctx.db.patch(me._id, { freeUntil: Date.now() + minutes * 60e3, freeNote: note?.trim().slice(0, 60) || undefined });
    await track(ctx, "free_now_set", me._id, { minutes });
  },
});

export const friendsFree = query({
  args: {},
  handler: async (ctx) => {
    const me = await viewer(ctx);
    if (!me) return [];
    const now = Date.now();
    const out = [];
    for (const id of await friendIds(ctx, me._id)) {
      const u = await ctx.db.get(id as Id<"users">);
      if (u && !u.deletedAt && u.showFreeToFriends !== false && (u.freeUntil ?? 0) > now)
        out.push({ ...(await publicUser(ctx, u)), freeUntil: u.freeUntil!, freeNote: u.freeNote ?? null });
    }
    return out;
  },
});

export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    const me = await requireViewer(ctx);
    await rateLimit(ctx, `upload:${me._id}`, 20, 864e5);
    return ctx.storage.generateUploadUrl();
  },
});

export const setAvatar = mutation({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, { storageId }) => {
    const me = await requireViewer(ctx);
    // storage ids appear in public avatar URLs — never let someone claim (and later delete) a file that's already in use
    const owner = await ctx.db.query("users").withIndex("by_image", (q) => q.eq("imageId", storageId)).first();
    if (owner && owner._id !== me._id) throw new ConvexError("that photo didn't upload properly — try again");
    if (owner) return;
    const meta = await ctx.db.system.get(storageId);
    if (!meta || meta._creationTime < Date.now() - 36e5) throw new ConvexError("that photo didn't upload properly — try again");
    if (!meta.contentType?.startsWith("image/") || meta.size > 5_000_000) {
      await ctx.storage.delete(storageId);
      throw new ConvexError("photos must be images under 5 MB");
    }
    if (me.imageId) await ctx.storage.delete(me.imageId);
    await ctx.db.patch(me._id, { imageId: storageId });
  },
});

export const removeAvatar = mutation({
  args: {},
  handler: async (ctx) => {
    const me = await requireViewer(ctx);
    if (me.imageId) await ctx.storage.delete(me.imageId);
    await ctx.db.patch(me._id, { imageId: undefined });
  },
});

export const profile = query({
  args: { handle: v.string() },
  handler: async (ctx, { handle }) => {
    const me = await viewer(ctx);
    const u = await ctx.db.query("users").withIndex("by_handle", (q) => q.eq("handle", normHandle(handle))).unique();
    if (!u || u.deletedAt || !u.onboardedAt) return null;
    const isMe = me?._id === u._id;
    let blockedByMe = false;
    if (me && !isMe) {
      const iBlocked = await ctx.db
        .query("blocks")
        .withIndex("by_pair", (q) => q.eq("blockerId", me._id).eq("blockedId", u._id))
        .unique();
      const theyBlocked = await ctx.db
        .query("blocks")
        .withIndex("by_pair", (q) => q.eq("blockerId", u._id).eq("blockedId", me._id))
        .unique();
      if (theyBlocked) return null;
      blockedByMe = !!iBlocked;
    }
    const [iFollow, followsMe] = me && !isMe ? await Promise.all([follows(ctx, me._id, u._id), follows(ctx, u._id, me._id)]) : [false, false];

    // plans you've actually been on together — the most meaningful trust signal between two people
    let together = 0;
    if (me && !isMe) {
      const mine = await ctx.db
        .query("participants")
        .withIndex("by_user_status", (q) => q.eq("userId", me._id).eq("status", "going"))
        .take(300);
      const myPlans = new Set<string>(mine.map((p) => p.planId));
      const hostedByMe = await ctx.db.query("plans").withIndex("by_host_start", (q) => q.eq("hostId", me._id)).take(300);
      hostedByMe.forEach((p) => myPlans.add(p._id));
      const theirs = await ctx.db
        .query("participants")
        .withIndex("by_user_status", (q) => q.eq("userId", u._id).eq("status", "going"))
        .take(300);
      const hostedByThem = await ctx.db.query("plans").withIndex("by_host_start", (q) => q.eq("hostId", u._id)).take(300);
      together = new Set([...theirs.map((p) => p.planId), ...hostedByThem.map((p) => p._id)].filter((id) => myPlans.has(id))).size;
    }
    const circleRows = await ctx.db.query("circleMembers").withIndex("by_user", (q) => q.eq("userId", u._id)).take(12);
    const circles = (await Promise.all(circleRows.map((c) => ctx.db.get(c.circleId)))).filter((c) => c !== null);
    return {
      user: await publicUser(ctx, u),
      bio: u.bio ?? "",
      interests: u.interests ?? [],
      availability: u.availability ?? [],
      areaName: u.areaName ?? null,
      memberSince: u._creationTime,
      hosted: u.hosted ?? 0,
      attended: u.attended ?? 0,
      isMe,
      blockedByMe,
      iFollow,
      followsMe,
      friends: iFollow && followsMe,
      together,
      canMessage:
        !isMe && !blockedByMe && u.dmPolicy !== "none" && (u.dmPolicy === "friends" ? iFollow && followsMe : (iFollow && followsMe) || together > 0),
      circles: circles.map((c) => ({ name: c.name, slug: c.slug, emoji: c.emoji })),
    };
  },
});

export const search = query({
  args: { q: v.string() },
  handler: async (ctx, { q }) => {
    const me = await viewer(ctx);
    const term = q.trim().toLowerCase();
    if (!me || term.length < 2) return [];
    const blocked = await blockedIds(ctx, me._id);
    const rows = await ctx.db
      .query("users")
      .withSearchIndex("search_name", (s) => s.search("searchName", term))
      .take(25);
    return Promise.all(
      rows
        .filter((u) => !u.deletedAt && u.onboardedAt && !blocked.has(u._id) && u._id !== me._id)
        .map(async (u) => ({ ...(await publicUser(ctx, u)), areaName: u.areaName ?? null })),
    );
  },
});

export const follow = mutation({
  args: { userId: v.id("users"), on: v.boolean() },
  handler: async (ctx, { userId, on }) => {
    const me = await requireActive(ctx);
    if (userId === me._id) throw new ConvexError("that's you!");
    const row = await ctx.db
      .query("follows")
      .withIndex("by_pair", (q) => q.eq("followerId", me._id).eq("followeeId", userId))
      .unique();
    if (!on) return void (row && (await ctx.db.delete(row._id)));
    if (row) return;
    const target = await ctx.db.get(userId);
    if (!target || target.deletedAt || !target.onboardedAt) throw new ConvexError("that account doesn't exist");
    const blocked = (await blockedIds(ctx, me._id)).has(userId);
    if (blocked) throw new ConvexError("you can't follow this person");
    await rateLimit(ctx, `follow:${me._id}`, 100, 864e5);
    await ctx.db.insert("follows", { followerId: me._id, followeeId: userId });
    const mutual = await follows(ctx, userId, me._id);
    await notify(ctx, userId, {
      kind: "follow",
      text: mutual ? `you and ${me.name} are now friends — you'll see each other's friends-only plans` : `${me.name} will now hear when you post plans`,
      actorId: me._id,
    });
    await track(ctx, "followed", me._id, { mutual });
  },
});

export const block = mutation({
  args: { userId: v.id("users"), on: v.boolean() },
  handler: async (ctx, { userId, on }) => {
    const me = await requireViewer(ctx);
    if (userId === me._id) throw new ConvexError("you can't block yourself");
    const row = await ctx.db
      .query("blocks")
      .withIndex("by_pair", (q) => q.eq("blockerId", me._id).eq("blockedId", userId))
      .unique();
    if (!on) return void (row && (await ctx.db.delete(row._id)));
    if (row) return;
    await ctx.db.insert("blocks", { blockerId: me._id, blockedId: userId });
    for (const [f, t] of [
      [me._id, userId],
      [userId, me._id],
    ] as const) {
      const fr = await ctx.db
        .query("follows")
        .withIndex("by_pair", (q) => q.eq("followerId", f).eq("followeeId", t))
        .unique();
      if (fr) await ctx.db.delete(fr._id);
    }
    await track(ctx, "user_blocked", me._id);
  },
});

export const blockedList = query({
  args: {},
  handler: async (ctx) => {
    const me = await viewer(ctx);
    if (!me) return [];
    const rows = await ctx.db.query("blocks").withIndex("by_blocker", (q) => q.eq("blockerId", me._id)).collect();
    return (await Promise.all(rows.map(async (r) => {
      const u = await ctx.db.get(r.blockedId);
      return u && publicUser(ctx, u);
    }))).filter((x) => x !== null);
  },
});

export const friends = query({
  args: {},
  handler: async (ctx) => {
    const me = await viewer(ctx);
    if (!me) return [];
    const ids = [...(await friendIds(ctx, me._id))];
    return (await Promise.all(ids.map(async (id) => {
      const u = await ctx.db.get(id as Id<"users">);
      return u && !u.deletedAt ? publicUser(ctx, u) : null;
    }))).filter((x) => x !== null);
  },
});

// Soft-delete: we scrub the profile, cancel hosted plans, sign out everywhere. Messages remain as "deleted account".
export const deleteAccount = mutation({
  args: { confirm: v.literal("delete") },
  handler: async (ctx) => {
    const me = await requireViewer(ctx);
    const now = Date.now();
    const hosted = await ctx.db
      .query("plans")
      .withIndex("by_host_start", (q) => q.eq("hostId", me._id).gte("startAt", now - 864e5))
      .collect();
    for (const p of hosted) {
      if (p.status === "cancelled" || p.endAt <= now) continue;
      await ctx.db.patch(p._id, { status: "cancelled", cancelReason: "the host deleted their account" });
      const rows = await ctx.db.query("participants").withIndex("by_plan_status", (q) => q.eq("planId", p._id).eq("status", "going")).collect();
      for (const r of rows) await notify(ctx, r.userId, { kind: "cancelled", text: `${p.title} was cancelled`, planId: p._id });
    }
    for (const status of ["going", "waitlist", "requested"] as const) {
      const rows = await ctx.db.query("participants").withIndex("by_user_status", (q) => q.eq("userId", me._id).eq("status", status)).collect();
      for (const r of rows) {
        await ctx.db.patch(r._id, { status: "left" });
        const plan = await ctx.db.get(r.planId);
        if (plan && status === "going") await ctx.db.patch(plan._id, { goingCount: Math.max(0, plan.goingCount - 1) });
        if (plan && status === "waitlist") await ctx.db.patch(plan._id, { waitCount: Math.max(0, plan.waitCount - 1) });
      }
    }
    for (const m of await ctx.db.query("circleMembers").withIndex("by_user", (q) => q.eq("userId", me._id)).collect()) {
      await ctx.db.delete(m._id);
      const c = await ctx.db.get(m.circleId);
      if (c) await ctx.db.patch(c._id, { memberCount: Math.max(0, c.memberCount - 1) });
    }
    for (const f of await ctx.db.query("follows").withIndex("by_follower", (q) => q.eq("followerId", me._id)).collect()) await ctx.db.delete(f._id);
    for (const f of await ctx.db.query("follows").withIndex("by_followee", (q) => q.eq("followeeId", me._id)).collect()) await ctx.db.delete(f._id);
    if (me.imageId) await ctx.storage.delete(me.imageId);
    await ctx.db.replace(me._id, { deletedAt: now, name: "deleted account" });
    for (const s of await ctx.db.query("authSessions").withIndex("userId", (q) => q.eq("userId", me._id)).collect()) {
      for (const t of await ctx.db.query("authRefreshTokens").withIndex("sessionId", (q) => q.eq("sessionId", s._id)).collect())
        await ctx.db.delete(t._id);
      await ctx.db.delete(s._id);
    }
    for (const a of await ctx.db.query("authAccounts").withIndex("userIdAndProvider", (q) => q.eq("userId", me._id)).collect())
      await ctx.db.delete(a._id);
    await track(ctx, "account_deleted", me._id);
  },
});

export const hostedPast = query({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const me = await viewer(ctx);
    const rows = await ctx.db
      .query("plans")
      .withIndex("by_host_start", (q) => q.eq("hostId", userId).lt("startAt", Date.now()))
      .order("desc")
      .take(6);
    return Promise.all(rows.filter((p) => p.visibility === "public" && p.status !== "hidden").map((p) => toCard(ctx, p, me)));
  },
});
