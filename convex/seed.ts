import { ConvexError, v } from "convex/values";
import { Id } from "./_generated/dataModel";
import { MutationCtx, internalMutation, mutation } from "./_generated/server";
import { addThreadMember, postMessage, rateLimit, requireViewer, schedulePlanJobs, track } from "./lib";
import { category, cellOf, threadKeyForPlan } from "./shared";

// Demo data. PAP launches city by city, so the seed doubles as the "day one in a new
// city" playbook: a handful of hosts, a few circles, and a week of plans that already
// look alive. `demoHere` lets you drop the same shape around any coordinates.

const PEOPLE: [string, string, string, string, string, string[], number, number][] = [
  ["Aanya Rao", "aanya", "🌸", "#FFC6FF", "coffee first, badminton after. always up for a last-minute plan.", ["coffee", "badminton", "food"], 14, 0],
  ["Rohan Mehta", "rohan", "🏸", "#9BF6FF", "shuttler. 6am courts. i bring spare rackets.", ["badminton", "gym", "run"], 22, 1],
  ["Meera Iyer", "meera", "📚", "#FDFFB6", "phd by day, quiz nights by night.", ["study", "cowork", "drinks", "movie"], 9, 0],
  ["Kabir Sharma", "kabir", "📷", "#A0C4FF", "street photographer. i host the golden hour walks.", ["photo", "explore", "coffee"], 31, 0],
  ["Zoya Khan", "zoya", "🎧", "#BDB2FF", "gig-hopper. tell me about your favourite small venue.", ["music", "drinks", "event"], 18, 1],
  ["Arjun Nair", "arjun", "⚽", "#CAFFBF", "5-a-side every sunday. defender, sadly.", ["football", "gym", "food"], 27, 0],
  ["Ishita Bose", "ishita", "🍜", "#FFD6A5", "eating my way through the city, one new place a week.", ["food", "coffee", "explore"], 20, 1],
  ["Dev Patel", "dev", "🎮", "#FFADAD", "board games, co-op campaigns, terrible at chess.", ["gaming", "movie", "hangout"], 11, 0],
  ["Tara Menon", "tara", "🏃", "#CAFFBF", "run club host. easy pace, no one gets dropped.", ["run", "hike", "coffee"], 44, 0],
  ["Nikhil Verma", "nikhil", "💻", "#9BF6FF", "building something small. cowork fridays regular.", ["cowork", "network", "coffee"], 16, 0],
  ["Sana Farooq", "sana", "🎨", "#FFC6FF", "sketchbook in bag at all times.", ["hangout", "explore", "photo"], 8, 0],
  ["Vikram Singh", "vikram", "🥾", "#FDFFB6", "weekend trails. early starts, no complaints.", ["hike", "run", "gym"], 25, 1],
  ["Priya Das", "priya", "🎬", "#BDB2FF", "late shows and worse popcorn opinions.", ["movie", "food", "drinks"], 13, 0],
  ["Aditya Kulkarni", "aditya", "🎾", "#A0C4FF", "tennis, intermediate, looking for a regular hitting partner.", ["tennis", "gym", "coffee"], 19, 0],
  ["Leah Cohen", "leah", "🌍", "#FFD6A5", "new in town. say hi, i'll come to anything.", ["explore", "food", "network", "music"], 5, 0],
  ["Omar Sheikh", "omar", "☕", "#FFADAD", "flat white and a long walk. that's the whole personality.", ["coffee", "explore", "hangout"], 17, 1],
];

const HOME = { lat: 12.9719, lng: 77.6412, area: "Indiranagar", city: "Bengaluru", tz: "Asia/Kolkata", currency: "INR" };

type SeedPlan = {
  t: string;
  cat: string;
  host: number;
  inH: number;
  dur: number;
  spots: number;
  going: number[];
  cost: number;
  place: string;
  generic: string;
  d: [number, number];
  desc?: string;
  bring?: string;
  req?: string;
  approval?: boolean;
  weekly?: boolean;
  circle?: string;
  exactJoined?: boolean;
  isNow?: boolean;
  wait?: number;
};

const PLANS: SeedPlan[] = [
  { t: "badminton doubles — need 2 more", cat: "badminton", host: 1, inH: 0.9, dur: 90, spots: 3, going: [0], cost: 200, place: "Game Theory, Koramangala", generic: "the sports complex", d: [-0.04, -0.014], desc: "booked court 3 for 90 minutes. casual doubles, all levels. court fee split between whoever turns up.", bring: "a racket if you have one — i carry two spares" },
  { t: "coffee + side project work", cat: "coffee", host: 9, inH: -0.3, dur: 150, spots: 4, going: [2, 14], cost: 0, place: "Third Wave Coffee, 12th Main", generic: "the corner café", d: [0.0, -0.001], desc: "i'm here with a laptop and no agenda. join for an hour, say hi, get something done.", isNow: true },
  { t: "sunset walk around the lake", cat: "explore", host: 15, inH: 3, dur: 75, spots: 6, going: [10, 4], cost: 0, place: "Ulsoor Lake, east gate", generic: "the lake, main gate", d: [0.01, -0.022], desc: "one slow loop, phones in pockets. we usually end at a chai stall." },
  { t: "trying the new ramen place", cat: "food", host: 6, inH: 5.5, dur: 120, spots: 4, going: [12], cost: 600, place: "Naru Noodle Bar, Basavanagudi", generic: "the new noodle place", d: [-0.045, -0.05], desc: "seats are limited so i'll hold the table. roughly ₹600 a head.", req: "please only join if you're sure — no-shows lose the table for everyone" },
  { t: "late show, whatever's good", cat: "movie", host: 12, inH: 7, dur: 165, spots: 3, going: [7], cost: 400, place: "PVR Forum, Koramangala", generic: "the multiplex", d: [-0.037, -0.03], desc: "we pick at the counter. popcorn is non-negotiable." },
  { t: "craft beer, slow evening", cat: "drinks", host: 4, inH: 6, dur: 150, spots: 5, going: [3, 11], cost: 800, place: "Toit, 100 Feet Road", generic: "the brewpub", d: [0.007, -0.0004], desc: "grabbing the corner table upstairs. come as you are." },
  { t: "gym buddy for leg day", cat: "gym", host: 1, inH: 15, dur: 75, spots: 1, going: [], cost: 0, place: "Cult Fit, Indiranagar", generic: "the neighbourhood gym", d: [0.004, 0.003], desc: "6:30am. i need someone to keep me honest on squats." },
  { t: "cubbon park run club · 5k easy", cat: "run", host: 8, inH: 13, dur: 60, spots: 20, going: [11, 5, 1, 9], cost: 0, place: "Cubbon Park, bandstand", generic: "the big park, main gate", d: [-0.005, -0.048], desc: "easy 5k, 6:30 pace, nobody gets dropped. coffee after for whoever's around.", weekly: true, circle: "run" },
  { t: "study session — quiet table", cat: "study", host: 2, inH: 19, dur: 180, spots: 4, going: [14], cost: 150, place: "Atta Galatta, Koramangala", generic: "the bookshop café", d: [-0.039, -0.028], desc: "pomodoro-ish. we take a break every hour and complain about our reading lists." },
  { t: "board games night", cat: "gaming", host: 7, inH: 27, dur: 180, spots: 5, going: [12, 2], cost: 150, place: "Dice N Dine, Indiranagar", generic: "the board game café", d: [0.002, 0.005], desc: "wingspan, codenames, whatever you bring. beginners genuinely welcome." },
  { t: "tennis rally, intermediate", cat: "tennis", host: 13, inH: 22, dur: 90, spots: 1, going: [1], cost: 300, place: "KSLTA Courts", generic: "the tennis courts", d: [-0.01, -0.03], desc: "hitting for an hour, then a set if we're both still standing.", wait: 1 },
  { t: "5-a-side football", cat: "football", host: 5, inH: 33, dur: 90, spots: 9, going: [1, 11, 13, 3], cost: 250, place: "Turf Sarjapur", generic: "the turf ground", d: [-0.05, 0.03], desc: "regular sunday game. turf split between everyone who plays.", bring: "dark and light shirt", weekly: true, circle: "footy" },
  { t: "photo walk: golden hour on the old street", cat: "photo", host: 3, inH: 30, dur: 120, spots: 10, going: [10, 14, 6], cost: 0, place: "Church Street, near Blossom", generic: "the old high street", d: [-0.002, -0.035], desc: "phones are fine, film is welcome. we stop a lot. i'll show a couple of composition things as we go.", weekly: true, circle: "photo" },
  { t: "cowork friday", cat: "cowork", host: 9, inH: 44, dur: 240, spots: 8, going: [2, 14, 4], cost: 0, place: "BHIVE Workspace, HSR", generic: "the coworking floor", d: [-0.06, 0.0], desc: "heads-down till 1pm, lunch together after. bring headphones.", weekly: true, circle: "cowork" },
  { t: "sunrise hike, leave at 4am", cat: "hike", host: 11, inH: 52, dur: 360, spots: 6, going: [8, 5], cost: 400, place: "meeting point: Hebbal flyover", generic: "meeting point: the north exit", d: [0.08, -0.05], desc: "we cab-pool up, watch the sun come over the hills, back by 10. cost is the cab split.", bring: "water, shoes with grip, a jacket", req: "be at the meeting point by 3:55am — we can't wait", exactJoined: true },
  { t: "open mic — bring a song or just ears", cat: "music", host: 4, inH: 58, dur: 150, spots: 25, going: [10, 12, 2, 6], cost: 300, place: "The Humming Tree, Indiranagar", generic: "the music venue", d: [0.006, -0.004], desc: "signup sheet opens at 7. half the room is first-timers." },
  { t: "brunch & sketching", cat: "hangout", host: 10, inH: 74, dur: 150, spots: 5, going: [0], cost: 500, place: "Lalbagh, west gate lawn", generic: "the botanical garden", d: [-0.02, -0.055], desc: "eat, draw badly, no one comments on anyone's work unless asked." },
  { t: "founders & builders, small table", cat: "network", host: 9, inH: 80, dur: 120, spots: 30, going: [2, 14, 3], cost: 0, place: "Church Street Social", generic: "the bar on the high street", d: [-0.003, -0.034], desc: "no pitching, no badges. just what you're building and what's stuck.", approval: true },
  { t: "language exchange: spanish ↔ kannada", cat: "other", host: 14, inH: 96, dur: 90, spots: 8, going: [6], cost: 0, place: "Cubbon Park, near the library", generic: "the big park, by the library", d: [-0.006, -0.046], desc: "half an hour each way. absolute beginners are the point." },
  { t: "late night chai + dosa run", cat: "food", host: 15, inH: 9, dur: 60, spots: 6, going: [7, 0], cost: 120, place: "CTR, Malleshwaram", generic: "the all-night chai place", d: [0.025, -0.07], desc: "the queue is half the fun." },
];

const CIRCLES: Record<string, { name: string; cat: string; schedule: string; desc: string; host: number }> = {
  run: { name: "cubbon run club", cat: "run", schedule: "every tuesday & saturday, 6:30am", desc: "an easy 5k and coffee after. we've been running since 2023 and nobody has ever been dropped.", host: 8 },
  footy: { name: "sunday footy", cat: "football", schedule: "sundays, 7am", desc: "regular 5-a-side. turf split, rotating teams, everyone plays.", host: 5 },
  photo: { name: "city photo walkers", cat: "photo", schedule: "saturdays, golden hour", desc: "slow walks with cameras. all gear, all levels.", host: 3 },
  cowork: { name: "cowork fridays", cat: "cowork", schedule: "fridays, 9am–1pm", desc: "freelancers and founders working in the same room. quiet till lunch.", host: 9 },
};

const CHATTER: Record<string, [number, string][]> = {
  "badminton doubles — need 2 more": [
    [0, "i'm in! do i need to bring my own shuttle?"],
    [1, "nope, i've got a tube of feathers. just bring shoes with grip 🙏"],
    [0, "perfect, see you at 3 🏸"],
  ],
  "cubbon park run club · 5k easy": [
    [11, "first time joining — is 6:30/km ok?"],
    [8, "that's exactly our pace. we regroup at every water point."],
    [5, "bringing a friend, hope that's alright"],
  ],
};

const round = (t: number) => Math.round(t / (15 * 60e3)) * 15 * 60e3;

async function build(ctx: MutationCtx, opts: { lat: number; lng: number; area: string; tz: string; currency: string; generic: boolean; friendOf?: Id<"users"> }) {
  const now = Date.now();
  const users: Id<"users">[] = [];
  for (const [name, handle, emoji, color, bio, interests, attended, noShows] of PEOPLE) {
    const suffix = opts.generic ? `_${Math.random().toString(36).slice(2, 5)}` : "";
    const h = `${handle}${suffix}`;
    const existing = await ctx.db.query("users").withIndex("by_handle", (q) => q.eq("handle", h)).unique();
    if (existing) {
      users.push(existing._id);
      continue;
    }
    users.push(
      await ctx.db.insert("users", {
        name,
        handle: h,
        searchName: `${name} ${h}`.toLowerCase(),
        emoji,
        color,
        bio,
        interests,
        availability: ["evenings", "weekends"],
        homeLat: Math.round((opts.lat + (Math.random() - 0.5) * 0.05) * 100) / 100,
        homeLng: Math.round((opts.lng + (Math.random() - 0.5) * 0.05) * 100) / 100,
        areaName: opts.area,
        radiusKm: 10,
        dmPolicy: "planned",
        showFreeToFriends: true,
        notifyFollowing: true,
        onboardedAt: now - Math.floor(Math.random() * 200) * 864e5,
        attended,
        noShows,
        hosted: Math.floor(attended / 4),
        verifiedHost: ["tara", "kabir"].includes(handle),
        isSeed: true,
      }),
    );
  }

  const circleIds: Record<string, Id<"circles">> = {};
  for (const [key, c] of Object.entries(CIRCLES)) {
    const slug = opts.generic ? `${key}-${Math.random().toString(36).slice(2, 6)}` : key;
    const existing = await ctx.db.query("circles").withIndex("by_slug", (q) => q.eq("slug", slug)).unique();
    if (existing) {
      circleIds[key] = existing._id;
      continue;
    }
    const id = await ctx.db.insert("circles", {
      name: c.name,
      slug,
      emoji: category(c.cat).emoji,
      category: c.cat,
      description: c.desc,
      schedule: c.schedule,
      areaName: opts.area,
      lat: opts.lat,
      lng: opts.lng,
      cell: cellOf(opts.lat, opts.lng),
      memberCount: 0,
      createdBy: users[c.host],
    });
    circleIds[key] = id;
    let count = 0;
    for (const u of users.slice(0, 8 + Math.floor(Math.random() * 6))) {
      await ctx.db.insert("circleMembers", { circleId: id, userId: u });
      count++;
    }
    await ctx.db.patch(id, { memberCount: count });
  }

  // a couple of the locals follow the new user back, so "friends going" has something to say
  if (opts.friendOf) {
    for (const u of [users[0], users[8]]) {
      for (const [f, t] of [[opts.friendOf, u], [u, opts.friendOf]] as const) {
        const exists = await ctx.db.query("follows").withIndex("by_pair", (q) => q.eq("followerId", f).eq("followeeId", t)).unique();
        if (!exists) await ctx.db.insert("follows", { followerId: f, followeeId: t });
      }
    }
  }

  let created = 0;
  for (const p of PLANS) {
    const startAt = round(now + p.inH * 36e5);
    const endAt = startAt + p.dur * 60e3;
    if (endAt < now) continue;
    const lat = opts.lat + p.d[0];
    const lng = opts.lng + p.d[1];
    const title = p.t;
    const planId = await ctx.db.insert("plans", {
      hostId: users[p.host],
      title,
      category: p.cat,
      description: p.desc,
      bring: p.bring,
      requirements: p.req,
      placeName: opts.generic ? p.generic : p.place,
      areaName: opts.area,
      lat,
      lng,
      cell: cellOf(lat, lng),
      exactFor: p.exactJoined ? "joined" : "everyone",
      startAt,
      endAt,
      tz: opts.tz,
      isNow: p.isNow,
      spots: p.spots,
      goingCount: p.going.length,
      waitCount: p.wait ?? 0,
      cost: p.cost,
      currency: opts.currency,
      visibility: "public",
      circleId: p.circle ? circleIds[p.circle] : undefined,
      approval: !!p.approval,
      recurrence: p.weekly ? "weekly" : undefined,
      status: "active",
      searchText: `${title} ${category(p.cat).label} ${opts.generic ? p.generic : p.place} ${opts.area}`.toLowerCase(),
    });
    created++;
    const key = threadKeyForPlan(planId);
    await addThreadMember(ctx, key, users[p.host]);
    for (const g of p.going) {
      await ctx.db.insert("participants", { planId, userId: users[g], status: "going", joinedAt: now - Math.floor(Math.random() * 48) * 36e5 });
      await addThreadMember(ctx, key, users[g]);
    }
    for (let i = 0; i < (p.wait ?? 0); i++)
      await ctx.db.insert("participants", { planId, userId: users[(p.host + 4 + i) % users.length], status: "waitlist", joinedAt: now - 36e5 });
    for (const [who, body] of CHATTER[p.t] ?? []) await postMessage(ctx, key, users[who], body);
    await schedulePlanJobs(ctx, planId, startAt, endAt);
  }
  return { users: users.length, plans: created, circles: Object.keys(circleIds).length };
}

// npx convex run seed:run
export const run = internalMutation({
  args: { lat: v.optional(v.number()), lng: v.optional(v.number()), area: v.optional(v.string()) },
  handler: async (ctx, a) =>
    build(ctx, {
      lat: a.lat ?? HOME.lat,
      lng: a.lng ?? HOME.lng,
      area: a.area ?? HOME.area,
      tz: HOME.tz,
      currency: HOME.currency,
      generic: a.lat !== undefined,
    }),
});

// Demo-only: fills the map around wherever the viewer is. Off unless ALLOW_DEMO_SEED=true.
export const demoHere = mutation({
  args: { lat: v.number(), lng: v.number(), areaName: v.optional(v.string()), tz: v.optional(v.string()), currency: v.optional(v.string()) },
  handler: async (ctx, a) => {
    if (process.env.ALLOW_DEMO_SEED !== "true") throw new ConvexError("demo seeding is off on this deployment");
    const site = (process.env.SITE_URL ?? "").trim().replace(/\/$/, "");
    if (!/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(site)) throw new ConvexError("demo seeding is off on this deployment");
    const me = await requireViewer(ctx);
    await rateLimit(ctx, `demoseed:${me._id}`, 3, 864e5, "you've already filled this neighbourhood with demo plans today");
    const res = await build(ctx, {
      lat: a.lat,
      lng: a.lng,
      area: a.areaName ?? me.areaName ?? "your area",
      tz: a.tz ?? "UTC",
      currency: a.currency ?? "INR",
      generic: true,
      friendOf: me._id,
    });
    await track(ctx, "demo_seeded", me._id, res);
    return res;
  },
});
