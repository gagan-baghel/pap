import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { AVATAR_COLORS } from "./shared";

/**
 * Two independent locks, because a passwordless login leaking into production would be
 * the worst bug this codebase could ship:
 *   1. ALLOW_DEV_LOGIN must be "true" on the deployment, and
 *   2. SITE_URL must point at localhost — a real deployment never does.
 * Setting the flag on a production deployment by accident therefore still does nothing.
 */
export function assertDevDeployment() {
  if (process.env.ALLOW_DEV_LOGIN !== "true") throw new Error("dev login is disabled on this deployment");
  const site = process.env.SITE_URL ?? "";
  if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(site.trim().replace(/\/$/, "")))
    throw new Error("dev login only works against a localhost deployment");
}

// Development identity shortcut. It only ever hands back a user id — the session, tokens
// and refresh flow are still Convex Auth's, so swapping this for a real provider changes
// nothing else in the app.
export const ensureDevUser = internalMutation({
  args: { handle: v.optional(v.string()) },
  handler: async (ctx, { handle }) => {
    assertDevDeployment();
    const wanted = handle?.trim().toLowerCase().replace(/^@/, "");
    if (wanted) {
      const existing = await ctx.db.query("users").withIndex("by_handle", (q) => q.eq("handle", wanted)).unique();
      if (existing && !existing.deletedAt) return existing._id;
    }
    const tag = Math.random().toString(36).slice(2, 6);
    const name = `Tester ${tag}`;
    const h = `tester_${tag}`;
    // a brand new account so the onboarding flow is testable too
    return ctx.db.insert("users", {
      name,
      handle: h,
      searchName: `${name} ${h}`.toLowerCase(),
      emoji: "🧪",
      color: AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)],
      dmPolicy: "planned",
      showFreeToFriends: true,
      notifyFollowing: true,
      radiusKm: 10,
      isSeed: true,
    });
  },
});
