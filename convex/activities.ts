import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

export const list = query({
  args: {
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) return [];

    const limit = args.limit ?? 50;

    return await ctx.db
      .query("activities")
      .withIndex("by_userId_startDate", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(limit);
  },
});

export const getById = query({
  args: {
    id: v.id("activities"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) return null;

    const activity = await ctx.db.get(args.id);
    if (!activity || activity.userId !== user._id) return null;

    return activity;
  },
});

export const batchInsert = internalMutation({
  args: {
    userId: v.id("users"),
    activities: v.array(
      v.object({
        stravaId: v.number(),
        type: v.string(),
        name: v.string(),
        description: v.optional(v.string()),
        startDate: v.number(),
        distance: v.number(),
        movingTime: v.number(),
        elapsedTime: v.number(),
        totalElevationGain: v.number(),
        averageSpeed: v.number(),
        maxSpeed: v.number(),
        averageHeartrate: v.optional(v.number()),
        maxHeartrate: v.optional(v.number()),
        averageCadence: v.optional(v.number()),
        calories: v.optional(v.number()),
        splits: v.optional(v.array(v.any())),
        startLatlng: v.optional(v.array(v.number())),
        endLatlng: v.optional(v.array(v.number())),
        map: v.optional(v.object({ summaryPolyline: v.optional(v.string()) })),
        raw: v.any(),
      })
    ),
  },
  handler: async (ctx, args) => {
    let inserted = 0;

    for (const activity of args.activities) {
      const existing = await ctx.db
        .query("activities")
        .withIndex("by_userId_stravaId", (q) =>
          q.eq("userId", args.userId).eq("stravaId", activity.stravaId)
        )
        .unique();

      if (existing) continue;

      await ctx.db.insert("activities", {
        userId: args.userId,
        ...activity,
      });
      inserted++;
    }

    return inserted;
  },
});
