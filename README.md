# PAP — post a plan

**Social networking for things you actually do.** You post what you're doing — badminton at 7, coffee in twenty minutes, dinner on Saturday — and people nearby who are free join in one tap. The object in this product is a **plan**, never a post. There is no feed, no likes, no follower counts.

The whole loop is: **see → join → meet → show up.**

---

## Why it exists

Every group chat has the same dead thread: *"anyone free tonight?"* → forty messages → nobody goes anywhere. PAP replaces that thread with one structured plan and one **i'm in** button: what, where, when, how many spots, roughly what it costs.

## Product decisions worth knowing

These were judgement calls, not spec-following:

| Decision | Why |
|---|---|
| **No feed, no likes, no follower counts** | The metric that matters is whether people met. Vanity numbers invite spam and posturing. Profiles show *plans done* and *shows up X% of the time* instead. |
| **Follow = "tell me when they post a plan"**; mutual follow = **friends** | One relation, two useful meanings. No friend requests, no follower leaderboard. Creators get an audience that converts to attendance, not views. |
| **DMs unlock after a shared plan** (configurable) | Kills the "strangers sliding into your DMs" problem that sinks location-based social apps. You talk in the plan chat first. |
| **Exact location is opt-in per plan** | Hosts choose "show the spot to everyone" or "only once you join". Users' own coordinates are stored rounded to ~1 km, never precisely. |
| **Reliability, not ratings** | 48h after a plan, attendance tallies. You count as attended unless the host marks you absent. No public star ratings — that breeds a toxic scoring culture; post-plan feedback is private and only feeds recommendations. |
| **Circles** (recurring communities) | The cold-start engine. One run club keeps a neighbourhood alive when there aren't enough spontaneous plans. Weekly plans respawn automatically when they end. |
| **Transparent recommendations** | Every boost is shown as a chip on the card: "2 friends going", "you're into coffee", "fits your free time". Personalization you can read is personalization people trust. |
| **"I'm free for 2 hours"** is visible to friends only | The useful half of broadcasting availability, without the creepy half. |

## What's built

**Discover** — location-aware ranking (time proximity, distance, interests, friends going, followed hosts, free-window fit), list + map views, search, filters (cost, group size, spots available, friends going), time windows (now / tonight / tomorrow / weekend / week), category chips, automatic widening when a window is empty, nearby circles, demo-seeding fallback.

**Plans** — create (≈15 seconds: title with category auto-guess, time presets, place search or map pin, spots, cost, visibility; pre-filled when posting a circle session), edit, cancel with reason, join / waitlist with auto-promotion / request+approval, leave (late drop-outs counted), participant management, host attendance marking, check-in, invites to friends, save-for-later from any card, add-to-calendar, share links with OG images, recurring weekly plans, and "post it again" — any plan you hosted becomes the template for the next one.

**Circles** — create, edit, archive (blocked while sessions are still scheduled, so nobody turns up to nothing), join/leave, member list, per-circle sessions, and reporting.

**People & safety** — profiles with trust signals, universal search (people / plans / circles), follow/friends, blocking, reporting on plans, profiles, circles *and* individual messages, auto-pause at 3 reports, a moderation queue where admins can pause/restore plans and circles, remove messages, suspend and un-suspend accounts, an in-app banner telling a suspended person exactly where they stand, rate limits on every write path, new-account link restrictions, DM policies, a written [safety page](app/safety/page.tsx) and [privacy page](app/privacy/page.tsx), account deletion.

**Talking** — per-plan group chat (members only, system messages for joins/changes/cancellations), DMs, unread state, inbox with a separate activity feed.

**Automated** — reminders an hour before, "how did it go?" prompts at the end, reliability finalized after 48h, next week's recurring plan spawned automatically, fan-out to followers and circle members on new plans.

## Stack

- **Next.js 16** (App Router, Turbopack) + **Tailwind v4**
- **Convex** — database, queries/mutations, realtime subscriptions, scheduler (reminders, completion, recurrence), file storage, full-text search
- **Convex Auth** (email + password, with emailed reset codes via Resend when `AUTH_RESEND_KEY` is set)
- **Leaflet** + CARTO tiles (no key), **Photon** geocoding (no key)

### Architecture notes

- **Geo indexing**: plans carry a `cell` (0.25° grid, ~28 km). Discovery reads only the cells around the viewer, so a query costs the same in one city as it does globally — no rewrite needed to expand from one neighbourhood to many cities.
- **Threads**: one `threadMembers` row per person per conversation powers the inbox, unread state *and* chat access control.
- **Scheduled jobs carry the time they were scheduled for** — if a host moves a plan, stale jobs no-op instead of needing cancellation bookkeeping.
- **Everything user-facing throws `ConvexError` with a written sentence**, so the UI never shows a raw error.
- Deliberate simplifications are marked with `ponytail:` comments naming the ceiling and the upgrade path.

## Running it

```bash
npm install
npx convex dev        # in one terminal — deploys functions, watches for changes
npm run dev           # in another
```

Environment (`.env.local` is written by `npx convex dev`):

```
NEXT_PUBLIC_CONVEX_URL=…          # set by convex
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_ALLOW_DEMO_SEED=true  # shows the "load demo plans near me" fallback
```

Convex deployment env vars: `JWT_PRIVATE_KEY`, `JWKS`, `SITE_URL` (auth), `ALLOW_DEMO_SEED`.

### Demo data

```bash
npx convex run seed:run                                  # a live week in Bengaluru
npx convex run seed:run '{"lat":51.5,"lng":-0.12,"area":"Soho"}'   # anywhere else
```

In-app, an empty discover screen offers **load demo plans near me** when `ALLOW_DEMO_SEED=true`.

### Signing in during development

Set `ALLOW_DEV_LOGIN=true` (Convex) and `NEXT_PUBLIC_ALLOW_DEV_LOGIN=true` (`.env.local`) and the sign-in screen grows a dev panel: one tap enters PAP as a seeded local (**aanya**, **rohan**, **tara**, **meera**) with their plans, friends, chats and history — or as a brand-new account if you want to walk onboarding again.

It's a `ConvexCredentials` provider ([convex/auth.ts](convex/auth.ts) → [convex/devauth.ts](convex/devauth.ts)) that returns a user id and nothing else; sessions, tokens and refresh are still Convex Auth's. Delete the provider (or leave the flag off) and production is unchanged — the email/password flow is already wired.

### Admin

```bash
npx convex run moderation:makeAdmin '{"email":"you@example.com"}'
```

Then `/admin` shows the report queue.

## Deploying

```bash
npm run verify                 # typecheck → lint → logic checks → production build
npm run preflight -- --prod    # refuses if any dev switch could reach real users
npm run deploy                 # preflight, then `convex deploy` with the Next build
```

**Production environment**

| Where | Key | Notes |
|---|---|---|
| Host (Vercel) | `NEXT_PUBLIC_CONVEX_URL` | your **prod** Convex deployment |
| Host | `NEXT_PUBLIC_SITE_URL` | `https://…` — drives `metadataBase`, OG image URLs, sitemap |
| Host | `NEXT_PUBLIC_MAP_TILES` | optional; a keyed tile provider once OSM's fair-use limits bite |
| Convex | `JWT_PRIVATE_KEY`, `JWKS` | generate once per deployment (see [convex/auth.ts](convex/auth.ts)) |
| Convex | `SITE_URL` | your https site |
| Convex | `AUTH_RESEND_KEY` | optional — turns on password-reset emails; without it the reset screen says so plainly instead of failing |
| Convex | `AUTH_EMAIL_FROM` | sender for those emails, e.g. `PAP <hello@pap.app>` |

`.env.example` lists the lot. Nothing else is required, and **no development switch may be set**: `ALLOW_DEV_LOGIN` and `ALLOW_DEMO_SEED` must be unset in production — preflight fails the deploy if they aren't.

**Why the dev login can't leak.** It needs `ALLOW_DEV_LOGIN=true` *and* a `SITE_URL` pointing at localhost ([convex/devauth.ts](convex/devauth.ts)); demo seeding is gated the same way. Setting the flag on a real deployment still does nothing, and preflight catches the mistake before the deploy runs.

**Security posture:** security headers (HSTS, nosniff, frame, referrer, a `geolocation=(self)` permissions policy) in [next.config.ts](next.config.ts); every mutation goes through `requireViewer`/`requireActive`/`requireAdmin` with per-user rate limits; validation and user-facing `ConvexError` messages on every write; profiles and app routes are `noindex` ([app/robots.ts](app/robots.ts)) so only the landing, safety page and shared plan links are crawlable.

**Maintenance:** `npx convex run jobs:recount` repairs the denormalised participant counters if they ever drift.

## Not built (and why)

- **Push notifications** — needs VAPID keys + a service worker; in-app notifications and scheduled reminders cover the core loop today.
- **Payments** — plans show a cost so nobody's surprised; splitting money is a worse product than letting people sort it out in person.
- **Phone/ID verification** — real friction, marginal safety gain at this stage. The safety model leans on public meeting points, reporting, blocking, reliability and moderation instead.
- **Native apps** — the PWA installs and covers the mobile-first experience.
