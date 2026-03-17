import { v } from "convex/values";
// @ts-ignore
import { internalQuery, query } from "./_generated/server";
import { Id } from "./_generated/dataModel";

export const getActive = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("trainingPlans")
      .withIndex("by_userId_status", (q) =>
        q.eq("userId", args.userId).eq("status", "active")
      )
      .first();
  },
});

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
      .query("trainingPlans")
      .withIndex("by_userId_status", (q) => q.eq("userId", user._id))
      .order("desc")
      .collect();
  },
});
