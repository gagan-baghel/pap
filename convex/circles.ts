import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { notify, publicUserById, rateLimit, requireActive, requireViewer, toCard, track, viewer } from "./lib";
import { CATEGORIES, category, cellOf, cellsAround, distanceKm } from "./shared";

// Circles = recurring, local communities (sunday football, run club, cowork fridays).
// They exist to keep a steady supply of plans in an area — the cold-start engine.

export const nearby = query({
  args: { lat: v.number(), lng: v.number() },
  handler: async (ctx, { lat, lng }) => {
    const me = await viewer(ctx);
    const now = Date.now();
    const circles = [];
    for (const cell of cellsAround(lat, lng, 30)) circles.push(...(await ctx.db.query("circles").withIndex("by_cell", (q) => q.eq("cell", cell)).take(50)));
    const out = [];
    for (const c of circles) {
      if (c.status === "hidden") continue;
      const d = distanceKm(lat, lng, c.lat, c.lng);
      if (d > 40) continue;
      const next = (await ctx.db.query("plans").withIndex("by_circle_start", (q) => q.eq("circleId", c._id).gte("startAt", now - 3 * 36e5)).take(5)).find(
        (p) => p.status === "active" && p.endAt > now,
      );
      const member = me
        ? !!(await ctx.db.query("circleMembers").withIndex("by_pair", (q) => q.eq("circleId", c._id).eq("userId", me._id)).unique())
        : false;
      out.push({ _id: c._id, name: c.name, slug: c.slug, emoji: c.emoji, category: c.category, schedule: c.schedule, areaName: c.areaName, memberCount: c.memberCount, distanceKm: d, member, nextStartAt: next?.startAt ?? null, nextTz: next?.tz });
    }
    return out.sort((a, b) => Number(b.member) - Number(a.member) || a.distanceKm - b.distanceKm);
  },
});

export const mine = query({
  args: {},
  handler: async (ctx) => {
    const me = await viewer(ctx);
    if (!me) return [];
    const rows = await ctx.db.query("circleMembers").withIndex("by_user", (q) => q.eq("userId", me._id)).collect();
    return (await Promise.all(rows.map((r) => ctx.db.get(r.circleId)))).filter((c) => c !== null).map((c) => ({ _id: c._id, name: c.name, emoji: c.emoji, slug: c.slug }));
  },
});

export const get = query({
  args: { slug: v.string() },
  handler: async (ctx, { slug }) => {
    const me = await viewer(ctx);
    const c = await ctx.db.query("circles").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
    if (!c) return null;
    // paused or archived circles stay visible to their organiser and to moderators only
    if (c.status === "hidden" && me?._id !== c.createdBy && me?.role !== "admin") return null;
    const now = Date.now();
    const members = await ctx.db.query("circleMembers").withIndex("by_circle", (q) => q.eq("circleId", c._id)).take(12);
    const plans = (await ctx.db.query("plans").withIndex("by_circle_start", (q) => q.eq("circleId", c._id).gte("startAt", now - 3 * 36e5)).take(20)).filter(
      (p) => p.status === "active" && p.endAt > now,
    );
    const member = me ? !!(await ctx.db.query("circleMembers").withIndex("by_pair", (q) => q.eq("circleId", c._id).eq("userId", me._id)).unique()) : false;
    return {
      circle: { _id: c._id, name: c.name, slug: c.slug, emoji: c.emoji, category: c.category, description: c.description, schedule: c.schedule, areaName: c.areaName, memberCount: c.memberCount, lat: c.lat, lng: c.lng, hidden: c.status === "hidden" },
      organizer: await publicUserById(ctx, c.createdBy),
      members: (await Promise.all(members.map((m) => publicUserById(ctx, m.userId)))).filter((m) => m !== null),
      member,
      isOrganizer: me?._id === c.createdBy,
      plans: await Promise.all(plans.map((p) => toCard(ctx, p, me))),
    };
  },
});

export const setMember = mutation({
  args: { circleId: v.id("circles"), on: v.boolean() },
  handler: async (ctx, { circleId, on }) => {
    const me = on ? await requireActive(ctx) : await requireViewer(ctx);
    const c = await ctx.db.get(circleId);
    if (!c) throw new ConvexError("this circle doesn't exist");
    const row = await ctx.db.query("circleMembers").withIndex("by_pair", (q) => q.eq("circleId", circleId).eq("userId", me._id)).unique();
    if (on && !row) {
      await ctx.db.insert("circleMembers", { circleId, userId: me._id });
      await ctx.db.patch(circleId, { memberCount: c.memberCount + 1 });
      await track(ctx, "circle_joined", me._id, { circleId });
    } else if (!on && row) {
      if (c.createdBy === me._id) throw new ConvexError("organizers can't leave their own circle");
      await ctx.db.delete(row._id);
      await ctx.db.patch(circleId, { memberCount: Math.max(0, c.memberCount - 1) });
    }
  },
});

export const update = mutation({
  args: {
    circleId: v.id("circles"),
    name: v.string(),
    category: v.string(),
    description: v.string(),
    schedule: v.string(),
  },
  handler: async (ctx, a) => {
    const me = await requireActive(ctx);
    const c = await ctx.db.get(a.circleId);
    if (!c) throw new ConvexError("this circle doesn't exist");
    if (c.createdBy !== me._id) throw new ConvexError("only the organiser can edit this circle");
    const name = a.name.trim();
    if (name.length < 3 || name.length > 50) throw new ConvexError("circle names are 3–50 characters");
    if (!CATEGORIES.some((x) => x.key === a.category)) throw new ConvexError("pick an activity");
    if (a.description.length > 500 || a.schedule.length > 60) throw new ConvexError("keep it short");
    await ctx.db.patch(a.circleId, {
      name,
      category: a.category,
      emoji: category(a.category).emoji,
      description: a.description.trim(),
      schedule: a.schedule.trim(),
    });
  },
});

// Soft archive: the link keeps working for the organiser, and members stop being pestered.
// Upcoming sessions have to be dealt with first — no silently orphaned plans.
export const archive = mutation({
  args: { circleId: v.id("circles") },
  handler: async (ctx, { circleId }) => {
    const me = await requireViewer(ctx);
    const c = await ctx.db.get(circleId);
    if (!c) return;
    if (c.createdBy !== me._id && me.role !== "admin") throw new ConvexError("only the organiser can archive this circle");
    const now = Date.now();
    const upcoming = (await ctx.db.query("plans").withIndex("by_circle_start", (q) => q.eq("circleId", circleId).gte("startAt", now - 3 * 36e5)).take(20)).filter(
      (p) => p.status === "active" && p.endAt > now,
    );
    if (upcoming.length)
      throw new ConvexError(`cancel the ${upcoming.length} upcoming ${upcoming.length === 1 ? "session" : "sessions"} first, so nobody turns up to nothing`);
    await ctx.db.patch(circleId, { status: "hidden" });
    for (const m of await ctx.db.query("circleMembers").withIndex("by_circle", (q) => q.eq("circleId", circleId)).take(500))
      if (m.userId !== me._id) await notify(ctx, m.userId, { kind: "circle_archived", text: `${c.name} was archived by its organiser`, actorId: me._id });
    await track(ctx, "circle_archived", me._id, { circleId });
  },
});

export const create = mutation({
  args: { name: v.string(), category: v.string(), description: v.string(), schedule: v.string() },
  handler: async (ctx, a) => {
    const me = await requireActive(ctx);
    const name = a.name.trim();
    if (name.length < 3 || name.length > 50) throw new ConvexError("circle names are 3–50 characters");
    if (!CATEGORIES.some((c) => c.key === a.category)) throw new ConvexError("pick an activity");
    if (a.description.length > 500 || a.schedule.length > 60) throw new ConvexError("keep it short");
    if (me.homeLat === undefined || me.homeLng === undefined) throw new ConvexError("set your area in settings first");
    await rateLimit(ctx, `circle:${me._id}`, 3, 7 * 864e5, "you can start up to 3 circles a week");
    const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32)}-${Math.random().toString(36).slice(2, 6)}`;
    const circleId = await ctx.db.insert("circles", {
      name,
      slug,
      emoji: category(a.category).emoji,
      category: a.category,
      description: a.description.trim(),
      schedule: a.schedule.trim(),
      areaName: me.areaName ?? "nearby",
      lat: me.homeLat,
      lng: me.homeLng,
      cell: cellOf(me.homeLat, me.homeLng),
      memberCount: 1,
      createdBy: me._id,
    });
    await ctx.db.insert("circleMembers", { circleId, userId: me._id });
    await track(ctx, "circle_created", me._id, { category: a.category });
    return slug;
  },
});
