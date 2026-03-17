import { v } from "convex/values";
// @ts-ignore
import { internalQuery, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

export const getForActivity = query({
  args: {
    activityId: v.id("activities"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) return null;

    return await ctx.db
      .query("aiAnalyses")
      .withIndex("by_userId_activityId", (q) =>
        q.eq("userId", user._id).eq("activityId", args.activityId)
      )
      .order("desc")
      .first();
  },
});

export const getLatestInsight = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) return null;

    return await ctx.db
      .query("aiAnalyses")
      .withIndex("by_userId_activityId", (q) => q.eq("userId", user._id))
      .order("desc")
      .first();
  },
});

export const getLatestProgressOverview = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) return null;

    return await ctx.db
      .query("aiAnalyses")
      .withIndex("by_userId_activityId", (q) => q.eq("userId", user._id))
      .order("desc")
      .filter((q) => q.eq(q.field("type"), "progress_overview"))
      .first();
  },
});

export const countSince = internalQuery({
  args: {
    userId: v.id("users"),
    since: v.number(),
  },
  handler: async (ctx, args) => {
    const analyses = await ctx.db
      .query("aiAnalyses")
      .withIndex("by_userId_activityId", (q) => q.eq("userId", args.userId))
      .filter((q) => q.gte(q.field("createdAt"), args.since))
      .collect();

    return analyses.length;
  },
});
