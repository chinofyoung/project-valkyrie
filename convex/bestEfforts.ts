import { v } from "convex/values";
import { internalMutation, internalQuery, query } from "./_generated/server";

export const listForUser = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) return [];

    return await ctx.db
      .query("bestEfforts")
      .withIndex("by_userId_name", (q) => q.eq("userId", user._id))
      .collect();
  },
});

export const listStravaActivityIds = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const efforts = await ctx.db
      .query("bestEfforts")
      .withIndex("by_userId_name", (q) => q.eq("userId", args.userId))
      .collect();

    // Return unique stravaActivityIds
    const seen = new Set<number>();
    return efforts.filter((e) => {
      if (seen.has(e.stravaActivityId)) return false;
      seen.add(e.stravaActivityId);
      return true;
    });
  },
});

export const batchUpsert = internalMutation({
  args: {
    userId: v.id("users"),
    efforts: v.array(
      v.object({
        stravaActivityId: v.number(),
        activityId: v.id("activities"),
        name: v.string(),
        distance: v.number(),
        elapsedTime: v.number(),
        movingTime: v.number(),
        startDate: v.number(),
        prRank: v.optional(v.number()),
      })
    ),
  },
  handler: async (ctx, args) => {
    let inserted = 0;

    for (const effort of args.efforts) {
      const existing = await ctx.db
        .query("bestEfforts")
        .withIndex("by_userId_stravaActivityId_name", (q) =>
          q
            .eq("userId", args.userId)
            .eq("stravaActivityId", effort.stravaActivityId)
            .eq("name", effort.name)
        )
        .unique();

      if (existing) continue;

      await ctx.db.insert("bestEfforts", {
        userId: args.userId,
        ...effort,
      });
      inserted++;
    }

    return inserted;
  },
});
