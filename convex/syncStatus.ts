import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";

export const getSyncStatus = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) return null;

    return await ctx.db
      .query("syncStatus")
      .withIndex("by_userId", (q) => q.eq("userId", user._id))
      .unique();
  },
});

export const upsertSyncStatus = internalMutation({
  args: {
    userId: v.id("users"),
    status: v.union(
      v.literal("idle"),
      v.literal("syncing"),
      v.literal("completed"),
      v.literal("error")
    ),
    syncedActivities: v.optional(v.number()),
    lastError: v.optional(v.string()),
    completedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("syncStatus")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .unique();

    const now = Date.now();

    if (existing) {
      const patch: Record<string, unknown> = { status: args.status };
      if (args.syncedActivities !== undefined) {
        patch.syncedActivities = args.syncedActivities;
      }
      if (args.lastError !== undefined) patch.lastError = args.lastError;
      if (args.completedAt !== undefined) patch.completedAt = args.completedAt;
      await ctx.db.patch(existing._id, patch);
    } else {
      await ctx.db.insert("syncStatus", {
        userId: args.userId,
        status: args.status,
        syncedActivities: args.syncedActivities ?? 0,
        lastError: args.lastError,
        completedAt: args.completedAt,
        startedAt: now,
      });
    }
  },
});
