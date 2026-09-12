import { ConvexError, v } from "convex/values";
import { Doc, Id } from "./_generated/dataModel";
import { QueryCtx, mutation, query } from "./_generated/server";
import {
  addThreadMember,
  blockedIds,
  isBlocked,
  isFriend,
  postMessage,
  publicUser,
  publicUserById,
  rateLimit,
  requireActive,
  threadMember,
  track,
  viewer,
} from "./lib";
import { category, threadKeyForDm } from "./shared";

type Thread =
  | { kind: "plan"; plan: Doc<"plans"> }
  | { kind: "dm"; otherId: Id<"users"> };

async function resolveThread(ctx: QueryCtx, key: string, me: Doc<"users">): Promise<Thread | null> {
  if (key.startsWith("p:")) {
    const id = ctx.db.normalizeId("plans", key.slice(2));
    const plan = id && (await ctx.db.get(id));
    return plan ? { kind: "plan", plan } : null;
  }
  const [a, b] = key.slice(2).split(":");
  if (a !== me._id && b !== me._id) return null;
  const otherId = ctx.db.normalizeId("users", a === me._id ? b : a);
  return otherId ? { kind: "dm", otherId } : null;
}

// Can `me` message `target` directly? Default: only people you've been on a plan with, or friends.
async function dmAllowed(ctx: QueryCtx, me: Doc<"users">, target: Doc<"users">) {
  if (target.deletedAt || target._id === me._id) return "you can't message this account";
  if (await isBlocked(ctx, me._id, target._id)) return "you can't message this person";
  const policy = target.dmPolicy ?? "planned";
  if (policy === "none") return `${target.name} isn't taking direct messages`;
  if (await isFriend(ctx, me._id, target._id)) return null;
  if (policy === "friends") return `${target.name} only takes messages from friends`;
  const mine = await ctx.db
    .query("participants")
    .withIndex("by_user_status", (q) => q.eq("userId", me._id).eq("status", "going"))
    .take(300);
  const myPlans = new Set<string>(mine.map((p) => p.planId));
  (await ctx.db.query("plans").withIndex("by_host_start", (q) => q.eq("hostId", me._id)).take(300)).forEach((p) => myPlans.add(p._id));
  const theirs = await ctx.db
    .query("participants")
    .withIndex("by_user_status", (q) => q.eq("userId", target._id).eq("status", "going"))
    .take(300);
  if (theirs.some((p) => myPlans.has(p.planId))) return null;
  const theirHosted = await ctx.db.query("plans").withIndex("by_host_start", (q) => q.eq("hostId", target._id)).take(300);
  if (theirHosted.some((p) => myPlans.has(p._id))) return null;
  return `you can message ${target.name} once you've been on a plan together`;
}

export const list = query({
  args: { threadKey: v.string() },
  handler: async (ctx, { threadKey }) => {
    const me = await viewer(ctx);
    if (!me) return null;
    const thread = await resolveThread(ctx, threadKey, me);
    const member = await threadMember(ctx, threadKey, me._id);
    if (!thread || !member) return null;
    const blocked = await blockedIds(ctx, me._id);
    const rows = (await ctx.db.query("messages").withIndex("by_thread", (q) => q.eq("threadKey", threadKey)).order("desc").take(150)).reverse();
    const authors = new Map<string, Awaited<ReturnType<typeof publicUserById>>>();
    for (const m of rows) if (!authors.has(m.authorId)) authors.set(m.authorId, await publicUserById(ctx, m.authorId));
    const messages = rows
      .filter((m) => m.kind === "system" || !blocked.has(m.authorId))
      .map((m) => ({ _id: m._id, body: m.body, kind: m.kind, at: m._creationTime, mine: m.authorId === me._id, author: authors.get(m.authorId) ?? null }));

    if (thread.kind === "plan") {
      const p = thread.plan;
      return {
        kind: "plan" as const,
        messages,
        planId: p._id,
        title: p.title,
        emoji: category(p.category).emoji,
        startAt: p.startAt,
        endAt: p.endAt,
        status: p.status,
        tz: p.tz,
        readOnly: p.status === "cancelled" || p.endAt < Date.now() - 7 * 864e5,
        members: (await ctx.db.query("threadMembers").withIndex("by_thread", (q) => q.eq("threadKey", threadKey)).collect()).length,
      };
    }
    const other = await publicUserById(ctx, thread.otherId);
    return {
      kind: "dm" as const,
      messages,
      other,
      readOnly: blocked.has(thread.otherId),
    };
  },
});

export const send = mutation({
  args: { threadKey: v.string(), body: v.string() },
  handler: async (ctx, { threadKey, body }) => {
    const me = await requireActive(ctx);
    const text = body.trim();
    if (!text) return;
    if (text.length > 1000) throw new ConvexError("messages can be up to 1000 characters");
    const thread = await resolveThread(ctx, threadKey, me);
    if (!thread || !(await threadMember(ctx, threadKey, me._id))) throw new ConvexError("you're not part of this chat");
    await rateLimit(ctx, `msg:${me._id}`, 20, 60e3, "you're sending messages very fast — take a breath");
    if (Date.now() - me._creationTime < 864e5 && /(https?:\/\/|www\.)/i.test(text))
      throw new ConvexError("links unlock after your first day on PAP — it keeps spam out");
    if (thread.kind === "plan") {
      if (thread.plan.status === "cancelled") throw new ConvexError("this plan was cancelled, so the chat is closed");
      if (thread.plan.endAt < Date.now() - 7 * 864e5) throw new ConvexError("this chat closed a week after the plan");
    } else {
      const other = await ctx.db.get(thread.otherId);
      if (!other || (await isBlocked(ctx, me._id, thread.otherId))) throw new ConvexError("you can't message this person");
      // re-add the other side if they had left the thread
      await addThreadMember(ctx, threadKey, thread.otherId);
    }
    await postMessage(ctx, threadKey, me._id, text);
  },
});

export const markRead = mutation({
  args: { threadKey: v.string() },
  handler: async (ctx, { threadKey }) => {
    const me = await viewer(ctx);
    if (!me) return;
    const row = await threadMember(ctx, threadKey, me._id);
    if (row && row.lastReadAt < row.lastMessageAt) await ctx.db.patch(row._id, { lastReadAt: Date.now() });
  },
});

export const openDm = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, { userId }) => {
    const me = await requireActive(ctx);
    const target = await ctx.db.get(userId);
    if (!target) throw new ConvexError("that account doesn't exist");
    const key = threadKeyForDm(me._id, userId);
    if (!(await threadMember(ctx, key, me._id))) {
      const denied = await dmAllowed(ctx, me, target);
      if (denied) throw new ConvexError(denied);
      await rateLimit(ctx, `dm:${me._id}`, 20, 864e5, "you've started a lot of new conversations today — try tomorrow");
      await addThreadMember(ctx, key, me._id);
      await addThreadMember(ctx, key, userId);
      await track(ctx, "dm_opened", me._id);
    }
    return key;
  },
});

export const inbox = query({
  args: {},
  handler: async (ctx) => {
    const me = await viewer(ctx);
    if (!me) return [];
    const blocked = await blockedIds(ctx, me._id);
    const rows = await ctx.db.query("threadMembers").withIndex("by_user_last", (q) => q.eq("userId", me._id)).order("desc").take(60);
    const out = [];
    for (const r of rows) {
      const thread = await resolveThread(ctx, r.threadKey, me);
      if (!thread) continue;
      const base = { threadKey: r.threadKey, lastMessageAt: r.lastMessageAt, preview: r.preview ?? null, unread: r.lastMessageAt > r.lastReadAt };
      if (thread.kind === "plan") {
        const p = thread.plan;
        out.push({ ...base, kind: "plan" as const, title: p.title, emoji: category(p.category).emoji, startAt: p.startAt, endAt: p.endAt, status: p.status, other: null });
      } else {
        if (blocked.has(thread.otherId)) continue;
        const other = await ctx.db.get(thread.otherId);
        if (!other) continue;
        out.push({ ...base, kind: "dm" as const, title: other.name ?? "someone", emoji: other.emoji ?? "🙂", startAt: 0, endAt: 0, status: "active", other: await publicUser(ctx, other) });
      }
    }
    return out;
  },
});

export const unreadCount = query({
  args: {},
  handler: async (ctx) => {
    const me = await viewer(ctx);
    if (!me) return 0;
    const rows = await ctx.db.query("threadMembers").withIndex("by_user_last", (q) => q.eq("userId", me._id)).order("desc").take(50);
    return rows.filter((r) => r.lastMessageAt > r.lastReadAt).length;
  },
});
