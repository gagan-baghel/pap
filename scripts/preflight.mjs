#!/usr/bin/env node
// Deployment guard. `npm run preflight` checks a preview build; `npm run preflight -- --prod`
// is what you run before shipping: it refuses to pass while any development-only switch
// could reach real users.
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";

const prod = process.argv.includes("--prod");
const errors = [];
const notes = [];

// .env.local is what `next build` reads locally; in CI these come from the platform.
if (existsSync(".env.local")) {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
  }
}

const required = ["NEXT_PUBLIC_CONVEX_URL", "NEXT_PUBLIC_SITE_URL"];
for (const key of required) if (!process.env[key]) errors.push(`${key} is not set`);

if (prod) {
  const site = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  if (!site.startsWith("https://")) errors.push(`NEXT_PUBLIC_SITE_URL must be https in production (got "${site}")`);
  if (/localhost|127\.0\.0\.1/.test(site)) errors.push("NEXT_PUBLIC_SITE_URL still points at localhost");
  // deployments may or may not carry a region segment: <name>.convex.cloud / <name>.<region>.convex.cloud
  if (!/^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)?\.convex\.cloud$/.test(process.env.NEXT_PUBLIC_CONVEX_URL ?? ""))
    errors.push("NEXT_PUBLIC_CONVEX_URL doesn't look like a Convex deployment URL");

  for (const flag of ["NEXT_PUBLIC_ALLOW_DEV_LOGIN", "NEXT_PUBLIC_ALLOW_DEMO_SEED"])
    if (process.env[flag] === "true") errors.push(`${flag}=true must never ship to production — remove it`);

  // the same switches on the Convex side
  try {
    const list = execFileSync("npx", ["convex", "env", "list", "--prod"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
    for (const flag of ["ALLOW_DEV_LOGIN", "ALLOW_DEMO_SEED"])
      if (new RegExp(`^${flag}=true$`, "m").test(list)) errors.push(`${flag}=true is set on the production Convex deployment — unset it`);
    for (const key of ["JWT_PRIVATE_KEY", "JWKS", "SITE_URL"])
      if (!new RegExp(`^${key}=`, "m").test(list)) errors.push(`${key} is missing on the production Convex deployment`);
    const siteUrl = list.match(/^SITE_URL=(.*)$/m)?.[1];
    if (siteUrl && !siteUrl.startsWith("https://")) errors.push(`Convex SITE_URL must be your https site (got "${siteUrl}")`);
  } catch {
    notes.push("couldn't read the production Convex env (not linked yet?) — check JWT_PRIVATE_KEY, JWKS, SITE_URL and that ALLOW_DEV_LOGIN is unset");
  }
}

for (const n of notes) console.log(`•  ${n}`);
if (errors.length) {
  console.error(`\n✖ preflight failed (${errors.length}):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(prod ? "✓ preflight passed — safe to deploy to production" : "✓ preflight passed");
