import { v } from "convex/values";
// @ts-ignore
import { internalQuery, internalMutation, query, mutation } from "./_generated/server";
import { Id } from "./_generated/dataModel";

// Internal query used by chat.ts to check for active plan context
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

// Public query — returns a training plan by ID (for chat preview cards)
export const getById = query({
  args: {
    planId: v.id("trainingPlans"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) return null;

    const plan = await ctx.db.get(args.planId);
    if (!plan || plan.userId !== user._id) return null;

    return plan;
  },
});

// Public query — returns the active training plan for the authenticated user
export const getActivePlan = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) return null;

    return await ctx.db
      .query("trainingPlans")
      .withIndex("by_userId_status", (q) =>
        q.eq("userId", user._id).eq("status", "active")
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

// Internal mutation called by chat action after AI generates a plan
export const create = internalMutation({
  args: {
    userId: v.id("users"),
    goal: v.string(),
    startDate: v.number(),
    endDate: v.number(),
    weeks: v.array(
      v.object({
        weekNumber: v.number(),
        workouts: v.array(
          v.object({
            day: v.string(),
            description: v.string(),
            type: v.string(),
            completed: v.boolean(),
          })
        ),
      })
    ),
    status: v.union(
      v.literal("active"),
      v.literal("completed"),
      v.literal("abandoned")
    ),
  },
  handler: async (ctx, args) => {
    // Abandon any currently active plan before creating the new one
    const existingActive = await ctx.db
      .query("trainingPlans")
      .withIndex("by_userId_status", (q) =>
        q.eq("userId", args.userId).eq("status", "active")
      )
      .first();

    if (existingActive) {
      await ctx.db.patch(existingActive._id, { status: "abandoned" });
    }

    return await ctx.db.insert("trainingPlans", {
      userId: args.userId,
      goal: args.goal,
      startDate: args.startDate,
      endDate: args.endDate,
      weeks: args.weeks,
      status: args.status,
      createdAt: Date.now(),
    });
  },
});

// Toggle completion of a specific workout within a plan
export const toggleWorkout = mutation({
  args: {
    planId: v.id("trainingPlans"),
    weekNumber: v.number(),
    workoutIndex: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) throw new Error("User not found");

    const plan = await ctx.db.get(args.planId);
    if (!plan) throw new Error("Plan not found");
    if (plan.userId !== user._id) throw new Error("Unauthorized");

    const updatedWeeks = plan.weeks.map((week) => {
      if (week.weekNumber !== args.weekNumber) return week;

      const updatedWorkouts = week.workouts.map((workout, idx) => {
        if (idx !== args.workoutIndex) return workout;
        return { ...workout, completed: !workout.completed };
      });

      return { ...week, workouts: updatedWorkouts };
    });

    await ctx.db.patch(args.planId, { weeks: updatedWeeks });
  },
});

// Update plan details (goal, dates, workouts)
export const updatePlan = mutation({
  args: {
    planId: v.id("trainingPlans"),
    goal: v.optional(v.string()),
    startDate: v.optional(v.number()),
    endDate: v.optional(v.number()),
    weeks: v.optional(
      v.array(
        v.object({
          weekNumber: v.number(),
          workouts: v.array(
            v.object({
              day: v.string(),
              description: v.string(),
              type: v.string(),
              completed: v.boolean(),
            })
          ),
        })
      )
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) throw new Error("User not found");

    const plan = await ctx.db.get(args.planId);
    if (!plan) throw new Error("Plan not found");
    if (plan.userId !== user._id) throw new Error("Unauthorized");

    const patch: Record<string, any> = {};
    if (args.goal !== undefined) patch.goal = args.goal;
    if (args.startDate !== undefined) patch.startDate = args.startDate;
    if (args.endDate !== undefined) patch.endDate = args.endDate;
    if (args.weeks !== undefined) patch.weeks = args.weeks;

    await ctx.db.patch(args.planId, patch);
  },
});

// Update the status of a training plan (e.g., abandon it)
export const updateStatus = mutation({
  args: {
    planId: v.id("trainingPlans"),
    status: v.union(
      v.literal("active"),
      v.literal("completed"),
      v.literal("abandoned")
    ),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) throw new Error("User not found");

    const plan = await ctx.db.get(args.planId);
    if (!plan) throw new Error("Plan not found");
    if (plan.userId !== user._id) throw new Error("Unauthorized");

    await ctx.db.patch(args.planId, { status: args.status });
  },
});
