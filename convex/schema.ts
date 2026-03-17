import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    email: v.string(),
    name: v.string(),
    avatarUrl: v.optional(v.string()),
    stravaConnected: v.boolean(),
    stravaTokens: v.optional(
      v.object({
        accessToken: v.string(),
        refreshToken: v.string(),
        expiresAt: v.number(),
      })
    ),
    lastSyncAt: v.optional(v.number()),
    createdAt: v.number(),
  }).index("by_clerkId", ["clerkId"]),

  activities: defineTable({
    userId: v.id("users"),
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
    .index("by_userId_startDate", ["userId", "startDate"])
    .index("by_userId_stravaId", ["userId", "stravaId"]),

  syncStatus: defineTable({
    userId: v.id("users"),
    status: v.union(
      v.literal("idle"),
      v.literal("syncing"),
      v.literal("completed"),
      v.literal("error")
    ),
    totalActivities: v.optional(v.number()),
    syncedActivities: v.number(),
    lastError: v.optional(v.string()),
    startedAt: v.number(),
    completedAt: v.optional(v.number()),
  }).index("by_userId", ["userId"]),

  aiAnalyses: defineTable({
    userId: v.id("users"),
    activityId: v.optional(v.id("activities")),
    type: v.union(
      v.literal("run_summary"),
      v.literal("progress_overview"),
      v.literal("training_plan")
    ),
    content: v.string(),
    model: v.string(),
    createdAt: v.number(),
  }).index("by_userId_activityId", ["userId", "activityId"]),

  chatMessages: defineTable({
    userId: v.id("users"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    createdAt: v.number(),
  }).index("by_userId_createdAt", ["userId", "createdAt"]),

  trainingPlans: defineTable({
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
    createdAt: v.number(),
  }).index("by_userId_status", ["userId", "status"]),

  bestEfforts: defineTable({
    userId: v.id("users"),
    stravaActivityId: v.number(),
    activityId: v.id("activities"),
    name: v.string(),
    distance: v.number(),
    elapsedTime: v.number(),
    movingTime: v.number(),
    startDate: v.number(),
    prRank: v.optional(v.number()),
  })
    .index("by_userId_name", ["userId", "name"])
    .index("by_userId_stravaActivityId_name", ["userId", "stravaActivityId", "name"]),
});
