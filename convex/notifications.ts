import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { publicUserById, viewer } from "./lib";
import { category } from "./shared";

export const list = query({
  args: {},
  handler: async (ctx) => {
    const me = await viewer(ctx);
    if (!me) return [];
    const rows = await ctx.db.query("notifications").withIndex("by_user", (q) => q.eq("userId", me._id)).order("desc").take(60);
    return Promise.all(
      rows.map(async (n) => {
        const plan = n.planId ? await ctx.db.get(n.planId) : null;
        return {
          _id: n._id,
          kind: n.kind,
          text: n.text,
          read: n.read,
          at: n._creationTime,
          planId: n.planId ?? null,
          emoji: plan ? category(plan.category).emoji : null,
          actor: n.actorId ? await publicUserById(ctx, n.actorId) : null,
        };
      }),
    );
  },
});

export const unreadCount = query({
  args: {},
  handler: async (ctx) => {
    const me = await viewer(ctx);
    if (!me) return 0;
    return (await ctx.db.query("notifications").withIndex("by_user_read", (q) => q.eq("userId", me._id).eq("read", false)).take(99)).length;
  },
});

export const markAllRead = mutation({
  args: {},
  handler: async (ctx) => {
    const me = await viewer(ctx);
    if (!me) return;
    const rows = await ctx.db.query("notifications").withIndex("by_user_read", (q) => q.eq("userId", me._id).eq("read", false)).take(200);
    for (const n of rows) await ctx.db.patch(n._id, { read: true });
  },
});

export const markRead = mutation({
  args: { id: v.id("notifications") },
  handler: async (ctx, { id }) => {
    const me = await viewer(ctx);
    const n = await ctx.db.get(id);
    if (me && n && n.userId === me._id && !n.read) await ctx.db.patch(id, { read: true });
  },
});
