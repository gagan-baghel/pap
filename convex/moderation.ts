import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { notify, publicUser, publicUserById, rateLimit, requireAdmin, requireViewer, track } from "./lib";
import { REPORT_REASONS } from "./shared";

const AUTO_HIDE_AT = 3;

export const report = mutation({
  args: {
    targetType: v.union(v.literal("plan"), v.literal("user"), v.literal("message"), v.literal("circle")),
    targetId: v.string(),
    reason: v.string(),
    details: v.optional(v.string()),
  },
  handler: async (ctx, a) => {
    const me = await requireViewer(ctx);
    if (!REPORT_REASONS.includes(a.reason)) throw new ConvexError("pick a reason");
    await rateLimit(ctx, `report:${me._id}`, 15, 864e5, "you've sent a lot of reports today — our team is on it");
    const table =
      a.targetType === "plan" ? "plans" : a.targetType === "user" ? "users" : a.targetType === "circle" ? "circles" : "messages";
    const id = ctx.db.normalizeId(table, a.targetId);
    if (!id || !(await ctx.db.get(id))) throw new ConvexError("couldn't find what you're reporting");
    const dupe = await ctx.db.query("reports").withIndex("by_reporter_target", (q) => q.eq("reporterId", me._id).eq("targetId", a.targetId)).first();
    if (dupe && dupe.status === "open") return;
    await ctx.db.insert("reports", { reporterId: me._id, targetType: a.targetType, targetId: a.targetId, reason: a.reason, details: a.details?.slice(0, 1000), status: "open" });

    // Enough independent reports pause a plan automatically until a human reviews it.
    if (a.targetType === "plan") {
      const planId = ctx.db.normalizeId("plans", a.targetId)!;
      const plan = (await ctx.db.get(planId))!;
      const open = await ctx.db.query("reports").withIndex("by_target", (q) => q.eq("targetId", a.targetId).eq("status", "open")).take(AUTO_HIDE_AT);
      await ctx.db.patch(planId, { reportCount: (plan.reportCount ?? 0) + 1 });
      if (open.length >= AUTO_HIDE_AT && plan.status === "active") {
        await ctx.db.patch(planId, { status: "hidden" });
        await notify(ctx, plan.hostId, { kind: "moderation", text: `${plan.title} is paused while we review some reports`, planId });
      }
    }
    if (a.targetType === "circle") {
      const circleId = ctx.db.normalizeId("circles", a.targetId)!;
      const circle = (await ctx.db.get(circleId))!;
      const open = await ctx.db.query("reports").withIndex("by_target", (q) => q.eq("targetId", a.targetId).eq("status", "open")).take(AUTO_HIDE_AT);
      await ctx.db.patch(circleId, { reportCount: (circle.reportCount ?? 0) + 1 });
      if (open.length >= AUTO_HIDE_AT && circle.status !== "hidden") {
        await ctx.db.patch(circleId, { status: "hidden" });
        await notify(ctx, circle.createdBy, { kind: "moderation", text: `${circle.name} is paused while we review some reports` });
      }
    }
    await track(ctx, "report_filed", me._id, { targetType: a.targetType, reason: a.reason });
  },
});

export const queue = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.query("reports").withIndex("by_status", (q) => q.eq("status", "open")).order("desc").take(100);
    return Promise.all(
      rows.map(async (r) => {
        let target: { title: string; subtitle: string; link: string | null; userId: string | null } = { title: "(gone)", subtitle: "", link: null, userId: null };
        if (r.targetType === "plan") {
          const p = await ctx.db.get(ctx.db.normalizeId("plans", r.targetId)!);
          const host = p && (await ctx.db.get(p.hostId));
          if (p) target = { title: p.title, subtitle: `hosted by @${host?.handle} · ${p.status}`, link: `/p/${p._id}`, userId: p.hostId };
        } else if (r.targetType === "user") {
          const u = await ctx.db.get(ctx.db.normalizeId("users", r.targetId)!);
          if (u) target = { title: u.name ?? "", subtitle: `@${u.handle}${u.suspendedUntil && u.suspendedUntil > Date.now() ? " · suspended" : ""}`, link: `/u/${u.handle}`, userId: u._id };
        } else if (r.targetType === "circle") {
          const c = await ctx.db.get(ctx.db.normalizeId("circles", r.targetId)!);
          const organiser = c && (await ctx.db.get(c.createdBy));
          if (c)
            target = {
              title: `${c.emoji} ${c.name}`,
              subtitle: `organised by @${organiser?.handle} · ${c.memberCount} members · ${c.status === "hidden" ? "paused" : "active"}`,
              link: `/c/${c.slug}`,
              userId: c.createdBy,
            };
        } else {
          const m = await ctx.db.get(ctx.db.normalizeId("messages", r.targetId)!);
          const u = m && (await ctx.db.get(m.authorId));
          if (m) target = { title: `“${m.body.slice(0, 140)}”`, subtitle: `by @${u?.handle}`, link: null, userId: m.authorId };
        }
        return { _id: r._id, at: r._creationTime, targetType: r.targetType, targetId: r.targetId, reason: r.reason, details: r.details ?? null, reporter: await publicUserById(ctx, r.reporterId), target };
      }),
    );
  },
});

export const resolve = mutation({
  args: {
    reportId: v.id("reports"),
    action: v.union(
      v.literal("dismiss"),
      v.literal("hide_plan"),
      v.literal("restore_plan"),
      v.literal("suspend_user"),
      v.literal("delete_message"),
      v.literal("hide_circle"),
      v.literal("restore_circle"),
      v.literal("unsuspend_user"),
    ),
  },
  handler: async (ctx, { reportId, action }) => {
    const admin = await requireAdmin(ctx);
    const r = await ctx.db.get(reportId);
    if (!r) return;
    if (action === "hide_plan" || action === "restore_plan") {
      const id = ctx.db.normalizeId("plans", r.targetId);
      if (id) {
        const plan = await ctx.db.get(id);
        if (plan && action === "hide_plan" && plan.status === "active") await ctx.db.patch(id, { status: "hidden" });
        if (plan && action === "restore_plan" && plan.status === "hidden") await ctx.db.patch(id, { status: "active" });
      }
    }
    if (action === "hide_circle" || action === "restore_circle") {
      const id = ctx.db.normalizeId("circles", r.targetId);
      if (id) {
        const circle = await ctx.db.get(id);
        if (circle && action === "hide_circle" && circle.status !== "hidden") await ctx.db.patch(id, { status: "hidden" });
        if (circle && action === "restore_circle" && circle.status === "hidden") await ctx.db.patch(id, { status: "active" });
      }
    }
    if (action === "delete_message") {
      const id = ctx.db.normalizeId("messages", r.targetId);
      if (id) await ctx.db.patch(id, { body: "message removed by PAP moderators", kind: "system" });
    }
    if (action === "suspend_user" || action === "unsuspend_user") {
      let uid = r.targetType === "user" ? ctx.db.normalizeId("users", r.targetId) : null;
      if (!uid) {
        // suspend whoever is behind the reported thing
        const p = r.targetType === "plan" ? ctx.db.normalizeId("plans", r.targetId) : null;
        const m = r.targetType === "message" ? ctx.db.normalizeId("messages", r.targetId) : null;
        const c = r.targetType === "circle" ? ctx.db.normalizeId("circles", r.targetId) : null;
        uid = p
          ? ((await ctx.db.get(p))?.hostId ?? null)
          : m
            ? ((await ctx.db.get(m))?.authorId ?? null)
            : c
              ? ((await ctx.db.get(c))?.createdBy ?? null)
              : null;
      }
      if (uid) {
        const suspended = action === "suspend_user";
        await ctx.db.patch(uid, { suspendedUntil: suspended ? Date.now() + 30 * 864e5 : undefined });
        await notify(ctx, uid, {
          kind: "moderation",
          text: suspended
            ? "your account is paused for 30 days while we review a report."
            : "your account is active again — thanks for your patience.",
        });
      }
    }
    // close every open report about the same thing
    const open = await ctx.db.query("reports").withIndex("by_target", (q) => q.eq("targetId", r.targetId).eq("status", "open")).collect();
    for (const o of open) await ctx.db.patch(o._id, { status: action === "dismiss" ? "dismissed" : "resolved", resolution: action });
    await track(ctx, "report_resolved", admin._id, { action });
  },
});

/**
 * Who is currently paused. Resolving a report closes it, so without this list a moderator
 * would have no way back to a suspension they'd already handed out.
 * ponytail: scans up to 1000 users; add an index on suspendedUntil if pausing ever scales.
 */
export const suspended = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const now = Date.now();
    const users = await ctx.db.query("users").take(1000);
    return Promise.all(
      users
        .filter((u) => (u.suspendedUntil ?? 0) > now && !u.deletedAt)
        .map(async (u) => ({ ...(await publicUser(ctx, u)), until: u.suspendedUntil! })),
    );
  },
});

export const setSuspension = mutation({
  args: { userId: v.id("users"), on: v.boolean(), days: v.optional(v.number()) },
  handler: async (ctx, { userId, on, days }) => {
    const admin = await requireAdmin(ctx);
    const span = days ?? 30;
    await ctx.db.patch(userId, { suspendedUntil: on ? Date.now() + span * 864e5 : undefined });
    await notify(ctx, userId, {
      kind: "moderation",
      text: on
        ? `your account is paused for ${span} days while we review a report.`
        : "your account is active again — thanks for your patience.",
    });
    await track(ctx, on ? "user_suspended" : "user_unsuspended", admin._id, { userId, days: span });
  },
});

// npx convex run moderation:makeAdmin '{"email":"you@example.com"}'
export const makeAdmin = internalMutation({
  args: { email: v.string(), verifiedHost: v.optional(v.boolean()) },
  handler: async (ctx, { email, verifiedHost }) => {
    const u = await ctx.db.query("users").withIndex("email", (q) => q.eq("email", email.toLowerCase())).unique();
    if (!u) throw new Error("no user with that email");
    await ctx.db.patch(u._id, { role: "admin", ...(verifiedHost ? { verifiedHost } : {}) });
  },
});

export const setVerifiedHost = mutation({
  args: { userId: v.id("users"), on: v.boolean() },
  handler: async (ctx, { userId, on }) => {
    await requireAdmin(ctx);
    await ctx.db.patch(userId, { verifiedHost: on });
  },
});
