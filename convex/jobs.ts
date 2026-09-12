import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { addThreadMember, goingRows, notify, postMessage, schedulePlanJobs } from "./lib";
import { category, formatWhen, threadKeyForPlan } from "./shared";

// Jobs carry the start/end time they were scheduled for; if the host moved the plan since, they no-op.

export const remind = internalMutation({
  args: { planId: v.id("plans"), startAt: v.number() },
  handler: async (ctx, { planId, startAt }) => {
    const plan = await ctx.db.get(planId);
    if (!plan || plan.status !== "active" || plan.startAt !== startAt) return;
    const text = `${category(plan.category).emoji} ${plan.title} starts in an hour · ${plan.placeName}`;
    await notify(ctx, plan.hostId, { kind: "reminder", text, planId });
    for (const g of await goingRows(ctx, planId)) await notify(ctx, g.userId, { kind: "reminder", text, planId });
  },
});

export const complete = internalMutation({
  args: { planId: v.id("plans"), endAt: v.number() },
  handler: async (ctx, { planId, endAt }) => {
    const plan = await ctx.db.get(planId);
    if (!plan || plan.endAt !== endAt) return;
    const going = await goingRows(ctx, planId);
    if (plan.status === "active" && going.length) {
      await notify(ctx, plan.hostId, { kind: "feedback", text: `how did ${plan.title} go? let us know who made it`, planId });
      for (const g of going) await notify(ctx, g.userId, { kind: "feedback", text: `how was ${plan.title}? takes 5 seconds`, planId });
    }
    await ctx.scheduler.runAfter(48 * 36e5, internal.jobs.finalize, { planId });

    // Recurring plans roll forward by a week so a circle never runs dry.
    // Cancelled or paused ones stop here — nobody wants a cancelled plan reappearing.
    if (plan.recurrence === "weekly" && plan.status === "active" && !plan.spawnedNext) {
      await ctx.db.patch(planId, { spawnedNext: true });
      const week = 7 * 864e5;
      let startAt = plan.startAt + week;
      while (startAt + (plan.endAt - plan.startAt) < Date.now()) startAt += week;
      const {
        _id, _creationTime, goingCount: _g, waitCount: _w, status: _s, cancelReason: _c, reportCount: _r, spawnedNext: _n, finalized: _f, isNow: _i,
        ...rest
      } = plan;
      const nextId = await ctx.db.insert("plans", {
        ...rest,
        startAt,
        endAt: startAt + (plan.endAt - plan.startAt),
        goingCount: 0,
        waitCount: 0,
        status: "active",
      });
      const key = threadKeyForPlan(nextId);
      await addThreadMember(ctx, key, plan.hostId);
      await postMessage(ctx, key, plan.hostId, "plan chat is open — only people who are in can see this", "system");
      await schedulePlanJobs(ctx, nextId, startAt, startAt + (plan.endAt - plan.startAt));
      const text = `next ${plan.title} is up — ${formatWhen(startAt, Date.now(), plan.tz)}. grab your spot`;
      for (const g of going) await notify(ctx, g.userId, { kind: "new_plan", text, planId: nextId, actorId: plan.hostId });
      if (plan.circleId) await ctx.scheduler.runAfter(0, internal.jobs.fanoutNewPlan, { planId: nextId });
    }
  },
});

// Reliability is tallied 48h after a plan, giving hosts time to mark no-shows.
// Default is generous: you count as attended unless the host said you didn't come.
export const finalize = internalMutation({
  args: { planId: v.id("plans") },
  handler: async (ctx, { planId }) => {
    const plan = await ctx.db.get(planId);
    if (!plan || plan.finalized) return;
    await ctx.db.patch(planId, { finalized: true });
    if (plan.status !== "active") return;
    const going = await goingRows(ctx, planId);
    for (const g of going) {
      const u = await ctx.db.get(g.userId);
      if (!u) continue;
      if (g.attended === false) await ctx.db.patch(u._id, { noShows: (u.noShows ?? 0) + 1 });
      else await ctx.db.patch(u._id, { attended: (u.attended ?? 0) + 1 });
    }
    if (going.length) {
      const host = await ctx.db.get(plan.hostId);
      if (host) await ctx.db.patch(host._id, { hosted: (host.hosted ?? 0) + 1, attended: (host.attended ?? 0) + 1 });
    }
  },
});

/**
 * Maintenance: `npx convex run jobs:recount`. goingCount/waitCount are denormalised so
 * every card read stays cheap; this repairs them if a deploy or a bug ever lets them drift.
 * ponytail: full table scan, run by hand — page it if plans ever outgrow one transaction.
 */
export const recount = internalMutation({
  args: {},
  handler: async (ctx) => {
    const plans = await ctx.db.query("plans").collect();
    let fixed = 0;
    for (const p of plans) {
      const [going, waiting] = await Promise.all([
        ctx.db.query("participants").withIndex("by_plan_status", (q) => q.eq("planId", p._id).eq("status", "going")).collect(),
        ctx.db.query("participants").withIndex("by_plan_status", (q) => q.eq("planId", p._id).eq("status", "waitlist")).collect(),
      ]);
      if (going.length !== p.goingCount || waiting.length !== p.waitCount) {
        await ctx.db.patch(p._id, { goingCount: going.length, waitCount: waiting.length });
        fixed++;
      }
    }
    console.log(JSON.stringify({ event: "recount", plans: plans.length, fixed }));
    return { plans: plans.length, fixed };
  },
});

// "Tell me when they post": followers (or circle members) hear about new plans.
export const fanoutNewPlan = internalMutation({
  args: { planId: v.id("plans") },
  handler: async (ctx, { planId }) => {
    const plan = await ctx.db.get(planId);
    if (!plan || plan.status !== "active" || plan.visibility === "private") return;
    const host = await ctx.db.get(plan.hostId);
    if (!host) return;
    const emoji = category(plan.category).emoji;
    const when = formatWhen(plan.startAt, Date.now(), plan.tz);
    const recipients = new Set<string>();
    if (plan.visibility === "circle" && plan.circleId) {
      const circle = await ctx.db.get(plan.circleId);
      // ponytail: single-pass fan-out capped at 1000; page through with the scheduler for bigger circles
      for (const m of await ctx.db.query("circleMembers").withIndex("by_circle", (q) => q.eq("circleId", plan.circleId!)).take(1000))
        recipients.add(m.userId);
      recipients.delete(plan.hostId);
      for (const uid of recipients)
        await notify(ctx, uid as typeof plan.hostId, { kind: "new_plan", text: `${emoji} new in ${circle?.name}: ${plan.title} · ${when}`, planId, actorId: plan.hostId });
      return;
    }
    const followers = await ctx.db.query("follows").withIndex("by_followee", (q) => q.eq("followeeId", plan.hostId)).take(1000);
    for (const f of followers) {
      if (plan.visibility === "friends") {
        const back = await ctx.db.query("follows").withIndex("by_pair", (q) => q.eq("followerId", plan.hostId).eq("followeeId", f.followerId)).unique();
        if (!back) continue;
      }
      const u = await ctx.db.get(f.followerId);
      if (!u || u.notifyFollowing === false) continue;
      await notify(ctx, u._id, { kind: "new_plan", text: `${emoji} ${host.name} posted a plan: ${plan.title} · ${when}`, planId, actorId: plan.hostId });
    }
  },
});
