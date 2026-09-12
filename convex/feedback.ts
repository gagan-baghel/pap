import { ConvexError, v } from "convex/values";
import { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { goingRows, participation, publicUserById, requireViewer, track, viewer } from "./lib";
import { category } from "./shared";

// After a plan: one tiny private check-in. No stars, no public ratings — just
// "how was it", who you'd plan with again, and (for hosts) who didn't make it.

export const pending = query({
  args: {},
  handler: async (ctx) => {
    const me = await viewer(ctx);
    if (!me) return [];
    const now = Date.now();
    const joined = await ctx.db.query("participants").withIndex("by_user_status", (q) => q.eq("userId", me._id).eq("status", "going")).order("desc").take(40);
    const hosted = await ctx.db.query("plans").withIndex("by_host_start", (q) => q.eq("hostId", me._id).gte("startAt", now - 8 * 864e5)).take(40);
    const plans = [...hosted, ...(await Promise.all(joined.map((j) => ctx.db.get(j.planId)))).filter((p): p is Doc<"plans"> => !!p)];
    const out = [];
    const seen = new Set<string>();
    for (const p of plans) {
      if (seen.has(p._id) || p.status !== "active" || p.endAt > now || p.endAt < now - 7 * 864e5) continue;
      seen.add(p._id);
      const done = await ctx.db.query("feedback").withIndex("by_plan_user", (q) => q.eq("planId", p._id).eq("userId", me._id)).unique();
      if (done) continue;
      const isHost = p.hostId === me._id;
      const others = (await goingRows(ctx, p._id)).filter((g) => g.userId !== me._id);
      if (!isHost && others.length === 0 && p.hostId === me._id) continue;
      const people = (await Promise.all([...(isHost ? [] : [p.hostId]), ...others.map((o) => o.userId)].map((id) => publicUserById(ctx, id)))).filter((x) => x !== null);
      if (isHost && people.length === 0) continue; // nobody came along, nothing to ask
      out.push({ planId: p._id, title: p.title, emoji: category(p.category).emoji, endAt: p.endAt, isHost, people, finalized: !!p.finalized });
      if (out.length >= 3) break;
    }
    return out;
  },
});

export const submit = mutation({
  args: {
    planId: v.id("plans"),
    vibe: v.union(v.literal("great"), v.literal("ok"), v.literal("bad")),
    wouldAgain: v.array(v.id("users")),
    noShows: v.optional(v.array(v.id("users"))),
  },
  handler: async (ctx, { planId, vibe, wouldAgain, noShows }) => {
    const me = await requireViewer(ctx);
    const plan = await ctx.db.get(planId);
    if (!plan || plan.endAt > Date.now()) throw new ConvexError("you can share how it went once the plan is over");
    const isHost = plan.hostId === me._id;
    const mine = await participation(ctx, planId, me._id);
    if (!isHost && mine?.status !== "going") throw new ConvexError("you weren't on this plan");
    const existing = await ctx.db.query("feedback").withIndex("by_plan_user", (q) => q.eq("planId", planId).eq("userId", me._id)).unique();
    if (existing) return;
    await ctx.db.insert("feedback", { planId, userId: me._id, vibe, wouldAgain: wouldAgain.slice(0, 50) });
    if (isHost && noShows?.length && !plan.finalized) {
      for (const uid of noShows) {
        const p = await participation(ctx, planId, uid);
        if (p?.status === "going" && !p.checkedInAt) await ctx.db.patch(p._id, { attended: false });
      }
    }
    await track(ctx, "feedback_submitted", me._id, { planId, vibe, isHost, wouldAgain: wouldAgain.length });
  },
});
