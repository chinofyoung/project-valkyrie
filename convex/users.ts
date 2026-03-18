import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import { ALLOWED_CREDIT_LIMITS, DEFAULT_CREDIT_LIMIT, SAFETY_CAP, WARNING_THRESHOLD } from "./constants";


export const syncUser = mutation({
  args: {
    clerkId: v.string(),
    email: v.string(),
    name: v.string(),
    avatarUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        email: args.email,
        name: args.name,
        avatarUrl: args.avatarUrl,
      });
      return existing._id;
    }

    return await ctx.db.insert("users", {
      clerkId: args.clerkId,
      email: args.email,
      name: args.name,
      avatarUrl: args.avatarUrl,
      stravaConnected: false,
      createdAt: Date.now(),
    });
  },
});

export const currentUser = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    return await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) =>
        q.eq("clerkId", identity.subject)
      )
      .unique();
  },
});

export const getById = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.userId);
  },
});

// Called from the Strava OAuth callback API route (server-side, already authed via Clerk).
// No Convex auth check needed — the route handler verifies the user.
export const connectStravaInternal = mutation({
  args: {
    clerkId: v.string(),
    accessToken: v.string(),
    refreshToken: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    let user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    // User record may not exist yet if syncUser hasn't fired —
    // create it now so the Strava connection isn't lost.
    if (!user) {
      const userId = await ctx.db.insert("users", {
        clerkId: args.clerkId,
        email: "",
        name: "Runner",
        stravaConnected: true,
        stravaTokens: {
          accessToken: args.accessToken,
          refreshToken: args.refreshToken,
          expiresAt: args.expiresAt,
        },
        createdAt: Date.now(),
      });
      return;
    }

    await ctx.db.patch(user._id, {
      stravaConnected: true,
      stravaTokens: {
        accessToken: args.accessToken,
        refreshToken: args.refreshToken,
        expiresAt: args.expiresAt,
      },
    });
  },
});

export const connectStrava = mutation({
  args: {
    clerkId: v.string(),
    accessToken: v.string(),
    refreshToken: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) throw new Error("User not found");

    await ctx.db.patch(user._id, {
      stravaConnected: true,
      stravaTokens: {
        accessToken: args.accessToken,
        refreshToken: args.refreshToken,
        expiresAt: args.expiresAt,
      },
    });
  },
});

export const updateChatSummary = internalMutation({
  args: {
    userId: v.id("users"),
    chatSummary: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, { chatSummary: args.chatSummary });
  },
});

export const updateDailyCreditLimit = mutation({
  args: { limit: v.number() },
  handler: async (ctx, args) => {
    if (!ALLOWED_CREDIT_LIMITS.includes(args.limit as any)) {
      throw new Error(`Invalid credit limit. Allowed values: ${ALLOWED_CREDIT_LIMITS.join(", ")}`);
    }
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) throw new Error("User not found");
    await ctx.db.patch(user._id, { dailyCreditLimit: args.limit });
  },
});

export const getCreditStatus = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) return null;

    const limit = user.dailyCreditLimit ?? DEFAULT_CREDIT_LIMIT;
    const effectiveLimit = limit === 0 ? SAFETY_CAP : limit;

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const todayTimestamp = startOfDay.getTime();

    const allAnalyses = await ctx.db
      .query("aiAnalyses")
      .withIndex("by_userId_activityId", (q) => q.eq("userId", user._id))
      .filter((q) => q.gte(q.field("createdAt"), todayTimestamp))
      .collect();
    const analysisCount = allAnalyses.length;

    const allMessages = await ctx.db
      .query("chatMessages")
      .withIndex("by_userId_createdAt", (q) =>
        q.eq("userId", user._id).gte("createdAt", todayTimestamp)
      )
      .filter((q) => q.eq(q.field("role"), "assistant"))
      .collect();
    const chatCount = allMessages.length;

    const used = analysisCount + chatCount;
    const warning = used >= effectiveLimit - WARNING_THRESHOLD && used < effectiveLimit;
    const limitReached = used >= effectiveLimit;

    return {
      used,
      limit,
      effectiveLimit,
      warning,
      limitReached,
      chatCount,
      analysisCount,
    };
  },
});

export const getUsageHistory = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) return [];

    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    const [analyses, messages] = await Promise.all([
      ctx.db
        .query("aiAnalyses")
        .withIndex("by_userId_activityId", (q) => q.eq("userId", user._id))
        .filter((q) => q.gte(q.field("createdAt"), sevenDaysAgo))
        .collect(),
      ctx.db
        .query("chatMessages")
        .withIndex("by_userId_createdAt", (q) =>
          q.eq("userId", user._id).gte("createdAt", sevenDaysAgo)
        )
        .filter((q) => q.eq(q.field("role"), "assistant"))
        .collect(),
    ]);

    // Group by date (UTC)
    const byDate: Record<string, { chatCount: number; analysisCount: number }> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      byDate[key] = { chatCount: 0, analysisCount: 0 };
    }
    for (const a of analyses) {
      const key = new Date(a.createdAt).toISOString().slice(0, 10);
      if (byDate[key]) byDate[key].analysisCount++;
    }
    for (const m of messages) {
      const key = new Date(m.createdAt).toISOString().slice(0, 10);
      if (byDate[key]) byDate[key].chatCount++;
    }

    return Object.entries(byDate).map(([date, counts]) => ({
      date,
      ...counts,
      total: counts.chatCount + counts.analysisCount,
    }));
  },
});
