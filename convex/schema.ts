import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const visibility = v.union(
  v.literal("public"),
  v.literal("friends"),
  v.literal("circle"),
  v.literal("private"),
);

export const participantStatus = v.union(
  v.literal("going"),
  v.literal("waitlist"),
  v.literal("requested"),
  v.literal("left"),
  v.literal("removed"),
  v.literal("declined"),
);

export default defineSchema({
  ...authTables,

  users: defineTable({
    // Convex Auth fields
    name: v.optional(v.string()),
    image: v.optional(v.string()),
    email: v.optional(v.string()),
    emailVerificationTime: v.optional(v.number()),
    phone: v.optional(v.string()),
    phoneVerificationTime: v.optional(v.number()),
    isAnonymous: v.optional(v.boolean()),
    // profile
    handle: v.optional(v.string()),
    searchName: v.optional(v.string()),
    bio: v.optional(v.string()),
    emoji: v.optional(v.string()),
    color: v.optional(v.string()),
    imageId: v.optional(v.id("_storage")),
    interests: v.optional(v.array(v.string())),
    availability: v.optional(v.array(v.string())),
    // approximate home area only (rounded to ~1km) — never a precise location
    homeLat: v.optional(v.number()),
    homeLng: v.optional(v.number()),
    areaName: v.optional(v.string()),
    radiusKm: v.optional(v.number()),
    // "i'm free" window
    freeUntil: v.optional(v.number()),
    freeNote: v.optional(v.string()),
    // settings
    dmPolicy: v.optional(v.union(v.literal("planned"), v.literal("friends"), v.literal("none"))),
    showFreeToFriends: v.optional(v.boolean()),
    notifyFollowing: v.optional(v.boolean()),
    // growth
    heardFrom: v.optional(v.string()),
    referredBy: v.optional(v.id("users")),
    onboardedAt: v.optional(v.number()),
    // trust
    role: v.optional(v.literal("admin")),
    verifiedHost: v.optional(v.boolean()),
    suspendedUntil: v.optional(v.number()),
    attended: v.optional(v.number()),
    noShows: v.optional(v.number()),
    lateCancels: v.optional(v.number()),
    hosted: v.optional(v.number()),
    deletedAt: v.optional(v.number()),
    isSeed: v.optional(v.boolean()),
  })
    .index("email", ["email"])
    .index("phone", ["phone"])
    .index("by_handle", ["handle"])
    .searchIndex("search_name", { searchField: "searchName" }),

  plans: defineTable({
    hostId: v.id("users"),
    title: v.string(),
    category: v.string(),
    description: v.optional(v.string()),
    bring: v.optional(v.string()),
    requirements: v.optional(v.string()),
    placeName: v.string(),
    areaName: v.optional(v.string()),
    lat: v.number(),
    lng: v.number(),
    cell: v.string(),
    exactFor: v.union(v.literal("everyone"), v.literal("joined")),
    startAt: v.number(),
    endAt: v.number(),
    tz: v.optional(v.string()),
    isNow: v.optional(v.boolean()),
    spots: v.number(),
    goingCount: v.number(),
    waitCount: v.number(),
    cost: v.number(),
    currency: v.string(),
    visibility,
    circleId: v.optional(v.id("circles")),
    approval: v.boolean(),
    recurrence: v.optional(v.literal("weekly")),
    status: v.union(v.literal("active"), v.literal("cancelled"), v.literal("hidden")),
    cancelReason: v.optional(v.string()),
    reportCount: v.optional(v.number()),
    searchText: v.string(),
    spawnedNext: v.optional(v.boolean()),
    finalized: v.optional(v.boolean()),
  })
    .index("by_cell_start", ["cell", "startAt"])
    .index("by_host_start", ["hostId", "startAt"])
    .index("by_circle_start", ["circleId", "startAt"])
    .index("by_start", ["startAt"])
    .searchIndex("search", { searchField: "searchText", filterFields: ["cell", "status"] }),

  participants: defineTable({
    planId: v.id("plans"),
    userId: v.id("users"),
    status: participantStatus,
    note: v.optional(v.string()),
    joinedAt: v.number(),
    checkedInAt: v.optional(v.number()),
    attended: v.optional(v.boolean()),
  })
    .index("by_plan_status", ["planId", "status", "joinedAt"])
    .index("by_plan_user", ["planId", "userId"])
    .index("by_user_status", ["userId", "status"]),

  saves: defineTable({ userId: v.id("users"), planId: v.id("plans") })
    .index("by_user", ["userId"])
    .index("by_plan", ["planId"])
    .index("by_user_plan", ["userId", "planId"]),

  follows: defineTable({ followerId: v.id("users"), followeeId: v.id("users") })
    .index("by_follower", ["followerId"])
    .index("by_followee", ["followeeId"])
    .index("by_pair", ["followerId", "followeeId"]),

  blocks: defineTable({ blockerId: v.id("users"), blockedId: v.id("users") })
    .index("by_blocker", ["blockerId"])
    .index("by_blocked", ["blockedId"])
    .index("by_pair", ["blockerId", "blockedId"]),

  // threadKey: "p:<planId>" for plan chats, "d:<userA>:<userB>" (sorted) for DMs
  messages: defineTable({
    threadKey: v.string(),
    authorId: v.id("users"),
    body: v.string(),
    kind: v.union(v.literal("text"), v.literal("system")),
  }).index("by_thread", ["threadKey"]),

  // one row per (thread, member): powers the inbox, unread state and chat access
  threadMembers: defineTable({
    threadKey: v.string(),
    userId: v.id("users"),
    lastMessageAt: v.number(),
    lastReadAt: v.number(),
    preview: v.optional(v.string()),
  })
    .index("by_user_last", ["userId", "lastMessageAt"])
    .index("by_thread_user", ["threadKey", "userId"])
    .index("by_thread", ["threadKey"]),

  notifications: defineTable({
    userId: v.id("users"),
    kind: v.string(),
    text: v.string(),
    planId: v.optional(v.id("plans")),
    actorId: v.optional(v.id("users")),
    read: v.boolean(),
  })
    .index("by_user", ["userId"])
    .index("by_user_read", ["userId", "read"]),

  circles: defineTable({
    name: v.string(),
    slug: v.string(),
    emoji: v.string(),
    category: v.string(),
    description: v.string(),
    schedule: v.string(),
    areaName: v.string(),
    lat: v.number(),
    lng: v.number(),
    cell: v.string(),
    memberCount: v.number(),
    createdBy: v.id("users"),
    status: v.optional(v.union(v.literal("active"), v.literal("hidden"))),
    reportCount: v.optional(v.number()),
  })
    .index("by_slug", ["slug"])
    .index("by_cell", ["cell"]),

  circleMembers: defineTable({ circleId: v.id("circles"), userId: v.id("users") })
    .index("by_circle", ["circleId"])
    .index("by_user", ["userId"])
    .index("by_pair", ["circleId", "userId"]),

  reports: defineTable({
    reporterId: v.id("users"),
    targetType: v.union(v.literal("plan"), v.literal("user"), v.literal("message"), v.literal("circle")),
    targetId: v.string(),
    reason: v.string(),
    details: v.optional(v.string()),
    status: v.union(v.literal("open"), v.literal("resolved"), v.literal("dismissed")),
    resolution: v.optional(v.string()),
  })
    .index("by_status", ["status"])
    .index("by_target", ["targetId", "status"])
    .index("by_reporter_target", ["reporterId", "targetId"]),

  // private post-plan feedback: feeds recommendations & moderation, never shown publicly
  feedback: defineTable({
    planId: v.id("plans"),
    userId: v.id("users"),
    vibe: v.union(v.literal("great"), v.literal("ok"), v.literal("bad")),
    wouldAgain: v.array(v.id("users")),
  }).index("by_plan_user", ["planId", "userId"]),

  rateLimits: defineTable({ key: v.string(), windowStart: v.number(), count: v.number() }).index(
    "by_key",
    ["key"],
  ),

  events: defineTable({
    name: v.string(),
    userId: v.optional(v.id("users")),
    props: v.optional(v.any()),
  }).index("by_name", ["name"]),
});
