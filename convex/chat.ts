import Anthropic from "@anthropic-ai/sdk";
import { action } from "./_generated/server";
// @ts-ignore
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";

// ---------------------------------------------------------------------------
// Prompt constants
// ---------------------------------------------------------------------------

const BASE_COACHING_PROMPT = `You are an expert running coach with deep knowledge of exercise physiology, training periodization, and performance optimization. You have coached athletes at all levels, from beginners to competitive runners.

Your coaching style is encouraging but honest — you celebrate progress while delivering straightforward feedback when improvements are needed. You are data-driven and always reference specific numbers from the athlete's data (paces, distances, heart rates, elevation) rather than speaking in generalities. Every observation you make is grounded in the actual numbers.

You understand training principles deeply: the importance of easy days and hard days, how periodization builds fitness over time, the role of recovery in adaptation, and how to spot signs of overtraining. You know that most aerobic improvement comes from easy, consistent mileage and that intensity should be introduced gradually.

Your recommendations are always actionable and specific. Instead of "run more," you say "aim for one additional easy 5K this week." Instead of "recover better," you say "consider moving your hard workout from Tuesday to Thursday to allow 48 hours after Monday's long run."

You keep responses focused and practical. Athletes want insights they can apply immediately.`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function metersToKm(meters: number): string {
  return (meters / 1000).toFixed(2);
}

function speedToPaceMinPerKm(speedMps: number): string {
  if (!speedMps || speedMps <= 0) return "--";
  const secondsPerKm = 1000 / speedMps;
  const minutes = Math.floor(secondsPerKm / 60);
  const seconds = Math.round(secondsPerKm % 60);
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Rate limit helper (analyses + assistant chat messages, max 20/day)
// ---------------------------------------------------------------------------

async function checkCombinedRateLimit(
  ctx: ActionCtx,
  userId: Id<"users">
): Promise<boolean> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const todayTimestamp = startOfDay.getTime();

  const [analysesCount, chatCount] = await Promise.all([
    ctx.runQuery(internal.aiAnalyses.countSince, {
      userId,
      since: todayTimestamp,
    }),
    ctx.runQuery(internal.chatMessages.countAssistantSince, {
      userId,
      since: todayTimestamp,
    }),
  ]);

  return (analysesCount as number) + (chatCount as number) < 20;
}

// ---------------------------------------------------------------------------
// sendMessage — client-callable action
// ---------------------------------------------------------------------------

export const sendMessage = action({
  args: {
    message: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    // @ts-ignore
    const user = await ctx.runQuery(api.users.currentUser, {});
    if (!user) throw new Error("User not found");

    // Rate limit check
    const withinLimit = await checkCombinedRateLimit(ctx, user._id);
    if (!withinLimit) {
      throw new Error("Rate limit exceeded: maximum 20 AI interactions per day");
    }

    // Insert the user's message
    await ctx.runMutation(internal.chatMessages.insert, {
      userId: user._id,
      role: "user",
      content: args.message,
    });

    // Gather context: last 50 chat messages
    const chatHistory: any[] = await ctx.runQuery(
      // @ts-ignore
      api.chatMessages.list,
      { limit: 50 }
    );

    // Gather context: activities in last 30 days
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const recentActivities: any[] = await ctx.runQuery(
      internal.activities.listForUserSince,
      { userId: user._id, since: thirtyDaysAgo, limit: 100 }
    );

    // Compute stats
    const totalDistance = recentActivities.reduce(
      (sum: number, a: any) => sum + a.distance,
      0
    );
    const runCount = recentActivities.length;
    const speedValues = recentActivities
      .filter((a: any) => a.averageSpeed > 0)
      .map((a: any) => a.averageSpeed);
    const avgPace =
      speedValues.length > 0
        ? speedToPaceMinPerKm(
            speedValues.reduce((a: number, b: number) => a + b, 0) /
              speedValues.length
          )
        : "--";

    // Most recent 5 activities
    const recentFive: any[] = await ctx.runQuery(
      internal.activities.listRecentForUser,
      { userId: user._id, limit: 5 }
    );

    // Active training plan
    const activePlan: any = await ctx.runQuery(
      internal.trainingPlans.getActive,
      { userId: user._id }
    );

    // Build context preamble
    const contextPreamble = `
ATHLETE CONTEXT (last 30 days):
- Total Distance: ${metersToKm(totalDistance)} km
- Total Runs: ${runCount}
- Average Pace: ${avgPace} min/km

RECENT ACTIVITIES:
${
  recentFive.length === 0
    ? "No recent activities."
    : recentFive
        .map(
          (a: any) =>
            `- ${new Date(a.startDate).toLocaleDateString()}: ${a.name} — ${metersToKm(a.distance)} km @ ${speedToPaceMinPerKm(a.averageSpeed)} min/km`
        )
        .join("\n")
}

${
  activePlan
    ? `ACTIVE TRAINING PLAN:
- Goal: ${activePlan.goal}
- Start: ${new Date(activePlan.startDate).toLocaleDateString()}
- End: ${new Date(activePlan.endDate).toLocaleDateString()}
- Weeks: ${activePlan.weeks.length}`
    : "No active training plan."
}
`.trim();

    const systemPrompt = `${BASE_COACHING_PROMPT}\n\n${contextPreamble}`;

    // Build messages for Anthropic from conversation history
    // The current user message is already at the end of chatHistory
    const conversationMessages = chatHistory.map((msg: any) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    }));

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: systemPrompt,
      messages: conversationMessages,
    });

    const responseText = response.content
      .filter((block) => block.type === "text")
      .map((block) => (block as { type: "text"; text: string }).text)
      .join("\n");

    await ctx.runMutation(internal.chatMessages.insert, {
      userId: user._id,
      role: "assistant",
      content: responseText,
    });

    return responseText;
  },
});
