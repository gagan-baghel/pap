import { Email } from "@convex-dev/auth/providers/Email";
import { ConvexError } from "convex/values";

// Password reset by emailed code. Uses Resend's HTTP API directly — no extra dependency.
// Unconfigured deployments fail with a sentence a human can act on rather than a stack trace.
export const ResetOTP = Email({
  id: "password-reset",
  maxAge: 15 * 60,
  async generateVerificationToken() {
    const digits = new Uint32Array(8);
    crypto.getRandomValues(digits);
    return Array.from(digits, (d) => (d % 10).toString()).join("");
  },
  async sendVerificationRequest({ identifier: email, token }) {
    const key = process.env.AUTH_RESEND_KEY;
    if (!key)
      throw new ConvexError("password resets aren't switched on for this deployment yet — email us and we'll sort it out by hand");
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.AUTH_EMAIL_FROM ?? "PAP <onboarding@resend.dev>",
        to: [email],
        subject: `${token} is your pap reset code`,
        text: [
          `your pap reset code is ${token}`,
          "",
          "it works for the next 15 minutes. if you didn't ask for this, ignore this email — nothing changes.",
          "",
          "— pap",
        ].join("\n"),
      }),
    });
    if (!res.ok) {
      console.error("resend failed", res.status, await res.text().catch(() => ""));
      throw new ConvexError("we couldn't send that email just now. try again in a minute?");
    }
  },
});
