import { internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";


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
