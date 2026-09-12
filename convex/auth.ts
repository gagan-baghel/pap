import { ConvexCredentials } from "@convex-dev/auth/providers/ConvexCredentials";
import { Password } from "@convex-dev/auth/providers/Password";
import { convexAuth } from "@convex-dev/auth/server";
import { ConvexError } from "convex/values";
import { internal } from "./_generated/api";
import { ResetOTP } from "./passwordReset";

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile(params) {
        const email = String(params.email ?? "").trim().toLowerCase();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new ConvexError("that email doesn't look right");
        return { email };
      },
      validatePasswordRequirements(password) {
        if (password.length < 8) throw new ConvexError("use at least 8 characters");
      },
      reset: ResetOTP,
    }),

    // Development only — see convex/devauth.ts. Needs ALLOW_DEV_LOGIN=true *and* a
    // localhost SITE_URL, so it cannot come alive on a real deployment.
    ConvexCredentials({
      id: "dev",
      authorize: async (params, ctx) => {
        if (process.env.ALLOW_DEV_LOGIN !== "true") throw new ConvexError("dev login is off on this deployment");
        const site = (process.env.SITE_URL ?? "").trim().replace(/\/$/, "");
        if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(site)) throw new ConvexError("dev login is off on this deployment");
        const userId = await ctx.runMutation(internal.devauth.ensureDevUser, {
          handle: params.handle ? String(params.handle) : undefined,
        });
        return { userId };
      },
    }),
  ],
});
