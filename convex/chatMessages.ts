import { v } from "convex/values";
// @ts-ignore
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
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
      .query("chatMessages")
      .withIndex("by_userId_createdAt", (q) => q.eq("userId", user._id))
      .order("asc")
      .take(limit);
  },
});

export const insert = internalMutation({
  args: {
    userId: v.id("users"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    displayText: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const content =
      args.role === "user" ? args.content.slice(0, 2000) : args.content;

    return await ctx.db.insert("chatMessages", {
      userId: args.userId,
      role: args.role,
      content,
      ...(args.displayText ? { displayText: args.displayText } : {}),
      createdAt: Date.now(),
    });
  },
});

export const isAiResponding = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return false;

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) return false;

    const lastMessage = await ctx.db
      .query("chatMessages")
      .withIndex("by_userId_createdAt", (q) => q.eq("userId", user._id))
      .order("desc")
      .first();

    // Consider AI as responding only if the last message is from the user
    // and was sent within the last 2 minutes (prevents permanent stuck state)
    const TWO_MINUTES = 2 * 60 * 1000;
    return (
      lastMessage != null &&
      lastMessage.role === "user" &&
      Date.now() - lastMessage.createdAt < TWO_MINUTES
    );
  },
});

export const countAssistantSince = internalQuery({
  args: {
    userId: v.id("users"),
    since: v.number(),
  },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_userId_createdAt", (q) =>
        q.eq("userId", args.userId).gte("createdAt", args.since)
      )
      .filter((q) => q.eq(q.field("role"), "assistant"))
      .collect();

    return messages.length;
  },
});

export const countForUser = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_userId_createdAt", (q) => q.eq("userId", args.userId))
      .collect();
    return messages.length;
  },
});

export const listAllForUser = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("chatMessages")
      .withIndex("by_userId_createdAt", (q) => q.eq("userId", args.userId))
      .order("asc")
      .collect();
  },
});

export const deleteMessages = internalMutation({
  args: {
    messageIds: v.array(v.id("chatMessages")),
  },
  handler: async (ctx, args) => {
    for (const id of args.messageIds) {
      await ctx.db.delete(id);
    }
  },
});

export const addToChat = mutation({
  args: {
    content: v.string(),
    displayText: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) throw new Error("User not found");

    // Insert as "assistant" so the typing indicator doesn't get stuck
    // waiting for an AI reply. The analysis is AI-generated content that
    // becomes part of the conversation context for future messages.
    return await ctx.db.insert("chatMessages", {
      userId: user._id,
      role: "assistant",
      content: args.content,
      displayText: args.displayText,
      createdAt: Date.now(),
    });
  },
});
