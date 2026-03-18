import Anthropic from "@anthropic-ai/sdk";
import { action, internalAction } from "./_generated/server";
import { ALLOWED_EMAILS } from "./constants";
// @ts-ignore
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { checkCreditLimit } from "./creditLimit";

// ---------------------------------------------------------------------------
// Prompt constants
// ---------------------------------------------------------------------------

const BASE_COACHING_PROMPT = `You are an expert endurance coach with deep knowledge of exercise physiology, training periodization, and performance optimization for running, cycling, walking, and hiking. You have coached athletes at all levels, from beginners to competitive athletes.

Your coaching style is encouraging but honest — you celebrate progress while delivering straightforward feedback when improvements are needed. You are data-driven and always reference specific numbers from the athlete's data (paces, speeds, distances, heart rates, elevation) rather than speaking in generalities. Every observation you make is grounded in the actual numbers.

IMPORTANT — Activity type distinction:
- "Run" = road running. Use pace (min/km) as the primary metric.
- "TrailRun" = trail running. Use pace (min/km) but factor in elevation heavily; slower paces are expected on technical/hilly terrain.
- "Ride"/"VirtualRide"/"MountainBikeRide"/"GravelRide"/"EBikeRide" = cycling. Use speed (km/h) as the primary metric, NEVER pace. Cycling efforts are fundamentally different from running.
- "Walk" = walking. Use pace (min/km) but recognize walking paces are naturally slower.
- "Hike" = hiking. Similar to walking but factor in elevation gain/loss significantly.

Never confuse cycling with running. Never report pace for cycling activities — always use speed in km/h. When analyzing mixed training, treat each activity type on its own terms.

You understand training principles deeply: the importance of easy days and hard days, how periodization builds fitness over time, the role of recovery in adaptation, and how to spot signs of overtraining. You know that most aerobic improvement comes from easy, consistent mileage and that intensity should be introduced gradually.

Your recommendations are always actionable and specific. Instead of "run more," you say "aim for one additional easy 5K this week." Instead of "recover better," you say "consider moving your hard workout from Tuesday to Thursday to allow 48 hours after Monday's long run."

You keep responses focused and practical. Athletes want insights they can apply immediately.

When the user asks you to create a training plan, include a JSON block in your response with this exact format:
\`\`\`json
{"trainingPlan": {"goal": "...", "weeks": [{"weekNumber": 1, "workouts": [{"day": "Monday", "description": "...", "type": "easy/tempo/interval/long/rest/ride/walk", "completed": false}]}]}}
\`\`\`
Place this JSON block at the very end of your message, after your conversational explanation of the plan. Use workout types: "easy", "tempo", "interval", "long", "rest", "ride", or "walk".`;

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

function speedToKmh(speedMps: number): string {
  if (!speedMps || speedMps <= 0) return "--";
  return (speedMps * 3.6).toFixed(1);
}

const CYCLING_TYPES = ["Ride", "VirtualRide", "MountainBikeRide", "GravelRide", "EBikeRide"];

function isCycling(type: string): boolean {
  return CYCLING_TYPES.includes(type);
}

function formatSpeedMetric(type: string, speedMps: number): string {
  if (isCycling(type)) return `${speedToKmh(speedMps)} km/h`;
  return `${speedToPaceMinPerKm(speedMps)} min/km`;
}

function activityTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    Run: "Run", TrailRun: "Trail Run", Walk: "Walk", Hike: "Hike",
    Ride: "Ride", VirtualRide: "Virtual Ride", MountainBikeRide: "MTB Ride",
    GravelRide: "Gravel Ride", EBikeRide: "E-Bike Ride",
  };
  return labels[type] ?? type;
}

const COMPACT_THRESHOLD = 30;
const KEEP_RECENT = 20;

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
    if (!ALLOWED_EMAILS.includes((identity.email as string)?.toLowerCase())) {
      throw new Error("Unauthorized");
    }

    // @ts-ignore
    const user = await ctx.runQuery(api.users.currentUser, {});
    if (!user) throw new Error("User not found");

    // Rate limit check
    const creditStatus = await checkCreditLimit(ctx, user._id);
    if (!creditStatus.allowed) {
      throw new Error(
        `Daily credit limit reached (${creditStatus.used}/${creditStatus.effectiveLimit}). Resets daily.`
      );
    }

    // Insert the user's message
    await ctx.runMutation(internal.chatMessages.insert, {
      userId: user._id,
      role: "user",
      content: args.message,
    });

    // Outer try/catch ensures an assistant message is always inserted so the
    // typing indicator never gets permanently stuck in the UI.
    try {
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

      // Compute stats by type
      const runTypeActivities = recentActivities.filter((a: any) => a.type === "Run" || a.type === "TrailRun");
      const cycleTypeActivities = recentActivities.filter((a: any) => isCycling(a.type));

      const totalRunDistance = runTypeActivities.reduce((sum: number, a: any) => sum + a.distance, 0);
      const totalCycleDistance = cycleTypeActivities.reduce((sum: number, a: any) => sum + a.distance, 0);

      const runSpeedValues = runTypeActivities.filter((a: any) => a.averageSpeed > 0).map((a: any) => a.averageSpeed);
      const avgRunPace = runSpeedValues.length > 0
        ? speedToPaceMinPerKm(runSpeedValues.reduce((a: number, b: number) => a + b, 0) / runSpeedValues.length)
        : "--";
      const cycleSpeedValues = cycleTypeActivities.filter((a: any) => a.averageSpeed > 0).map((a: any) => a.averageSpeed);
      const avgCycleSpeed = cycleSpeedValues.length > 0
        ? speedToKmh(cycleSpeedValues.reduce((a: number, b: number) => a + b, 0) / cycleSpeedValues.length)
        : "--";

      // Most recent 5 activities
      const recentFive: any[] = await ctx.runQuery(
        internal.activities.listRecentForUser,
        { userId: user._id, limit: 5 }
      );

      // Best efforts (personal records per distance)
      const bestEfforts: any[] = await ctx.runQuery(
        internal.bestEfforts.listForUserInternal,
        { userId: user._id }
      );

      // Active training plan
      const activePlan: any = await ctx.runQuery(
        internal.trainingPlans.getActive,
        { userId: user._id }
      );

      // Build context preamble
      const contextPreamble = `
ATHLETE CONTEXT (last 30 days):
- Total Activities: ${recentActivities.length}
${runTypeActivities.length > 0 ? `- Running: ${metersToKm(totalRunDistance)} km across ${runTypeActivities.length} run(s), avg pace ${avgRunPace} min/km` : "- Running: No runs"}
${cycleTypeActivities.length > 0 ? `- Cycling: ${metersToKm(totalCycleDistance)} km across ${cycleTypeActivities.length} ride(s), avg speed ${avgCycleSpeed} km/h` : "- Cycling: No rides"}

RECENT ACTIVITIES:
${
  recentFive.length === 0
    ? "No recent activities."
    : recentFive
        .map(
          (a: any) =>
            `- ${new Date(a.startDate).toLocaleDateString()}: [${activityTypeLabel(a.type ?? "Run")}] ${a.name} — ${metersToKm(a.distance)} km @ ${formatSpeedMetric(a.type ?? "Run", a.averageSpeed)}`
        )
        .join("\n")
}

PERSONAL BESTS:
${
  bestEfforts.length === 0
    ? "No best efforts recorded."
    : bestEfforts
        .sort((a: any, b: any) => a.distance - b.distance)
        .map((e: any) => {
          const m = Math.floor(e.movingTime / 60);
          const s = e.movingTime % 60;
          const time = m > 59
            ? `${Math.floor(m / 60)}:${(m % 60).toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`
            : `${m}:${s.toString().padStart(2, "0")}`;
          const paceSecPerKm = e.movingTime / (e.distance / 1000);
          const paceMin = Math.floor(paceSecPerKm / 60);
          const paceSec = Math.round(paceSecPerKm % 60);
          return `- ${e.name}: ${time} (${paceMin}:${paceSec.toString().padStart(2, "0")} /km)`;
        })
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

      const summaryBlock = user.chatSummary
        ? `CONVERSATION HISTORY SUMMARY:\n${user.chatSummary}\n\n`
        : "";

      const systemPrompt = `${BASE_COACHING_PROMPT}\n\n${summaryBlock}${contextPreamble}`;

      // Build messages for Anthropic from conversation history
      // The current user message is already at the end of chatHistory
      const conversationMessages = chatHistory.map((msg: any) => ({
        role: msg.role as "user" | "assistant",
        content: msg.content,
      }));

      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error("ANTHROPIC_API_KEY environment variable is not set");
      }

      let responseText: string;
      try {
        const client = new Anthropic({ apiKey });
        const response = await client.messages.create({
          model: "claude-sonnet-4-6",
          max_tokens: 4096,
          system: systemPrompt,
          messages: conversationMessages,
        });

        responseText = response.content
          .filter((block) => block.type === "text")
          .map((block) => (block as { type: "text"; text: string }).text)
          .join("\n");
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        throw new Error(`AI coach is unavailable: ${message}`);
      }

      // Detect and extract a training plan JSON block if present
      const jsonBlockRegex = /```json\s*(\{[\s\S]*?"trainingPlan"[\s\S]*?\})\s*```/;
      const jsonMatch = responseText.match(jsonBlockRegex);

      let cleanedResponse = responseText;
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[1]);
          const planData = parsed.trainingPlan;

          if (planData && planData.goal && Array.isArray(planData.weeks)) {
            // Calculate startDate as next Monday
            const now = new Date();
            const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
            const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
            const startDate = new Date(now);
            startDate.setDate(now.getDate() + daysUntilMonday);
            startDate.setHours(0, 0, 0, 0);

            const endDate = new Date(startDate);
            endDate.setDate(startDate.getDate() + planData.weeks.length * 7);

            await ctx.runMutation(internal.trainingPlans.create, {
              userId: user._id,
              goal: planData.goal,
              startDate: startDate.getTime(),
              endDate: endDate.getTime(),
              weeks: planData.weeks,
              status: "active",
            });
          }
        } catch {
          // If parsing fails, we just store the full response as-is
        }

        // Strip the JSON block from the stored message so the user only sees the coaching text
        cleanedResponse = responseText.replace(jsonBlockRegex, "").trim();
      }

      await ctx.runMutation(internal.chatMessages.insert, {
        userId: user._id,
        role: "assistant",
        content: cleanedResponse,
      });

      // Only schedule compaction when message count exceeds threshold
      const messageCount = await ctx.runQuery(
        internal.chatMessages.countForUser,
        { userId: user._id }
      );
      if (messageCount > COMPACT_THRESHOLD) {
        await ctx.scheduler.runAfter(0, internal.chat.compactHistory, {
          userId: user._id,
        });
      }

      return cleanedResponse;
    } catch (err) {
      // Fallback: always insert an assistant message so isAiResponding unblocks.
      const errorMsg = err instanceof Error ? err.message : "Something went wrong";
      await ctx.runMutation(internal.chatMessages.insert, {
        userId: user._id,
        role: "assistant",
        content: `Sorry, I couldn't respond right now. (${errorMsg})`,
      });
      // Re-throw so the client's catch block can also surface the error banner.
      throw err;
    }
  },
});

export const compactNow = action({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    if (!ALLOWED_EMAILS.includes((identity.email as string)?.toLowerCase())) {
      throw new Error("Unauthorized");
    }

    // @ts-ignore
    const user = await ctx.runQuery(api.users.currentUser, {});
    if (!user) throw new Error("User not found");

    const creditStatus = await checkCreditLimit(ctx, user._id);
    if (!creditStatus.allowed) {
      throw new Error(
        `Daily credit limit reached (${creditStatus.used}/${creditStatus.effectiveLimit}). Resets daily.`
      );
    }

    const userId = user._id;

    const allMessages: any[] = await ctx.runQuery(
      internal.chatMessages.listAllForUser,
      { userId }
    );

    if (allMessages.length <= KEEP_RECENT) return;

    const toSummarize = allMessages.slice(0, allMessages.length - KEEP_RECENT);
    const existingSummary = user.chatSummary ?? "";

    const transcript = toSummarize
      .map((m: any) => `${m.role}: ${m.content}`)
      .join("\n");

    const prompt = existingSummary
      ? `Here is the existing conversation summary:\n${existingSummary}\n\nHere are newer messages to incorporate:\n${transcript}\n\nProduce an updated summary that captures all key decisions, preferences, goals, and context from both the existing summary and the new messages. Keep it concise (max 500 words). Write in third person about the athlete.`
      : `Summarize this coaching conversation. Capture key decisions, athlete preferences, goals, training history context, and any plans discussed. Keep it concise (max 500 words). Write in third person about the athlete.\n\n${transcript}`;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const summary = response.content
      .filter((block) => block.type === "text")
      .map((block) => (block as { type: "text"; text: string }).text)
      .join("\n");

    await ctx.runMutation(internal.users.updateChatSummary, {
      userId,
      chatSummary: summary,
    });

    await ctx.runMutation(internal.chatMessages.deleteMessages, {
      messageIds: toSummarize.map((m: any) => m._id),
    });
  },
});

export const compactHistory = internalAction({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const { userId } = args;

    // 1. Count messages
    const count = await ctx.runQuery(
      internal.chatMessages.countForUser,
      { userId }
    ) as number;

    if (count <= COMPACT_THRESHOLD) return;

    // 2. Load all messages
    const allMessages: any[] = await ctx.runQuery(
      internal.chatMessages.listAllForUser,
      { userId }
    );

    // 3. Split: oldest to summarize, newest to keep
    const toSummarize = allMessages.slice(0, allMessages.length - KEEP_RECENT);
    if (toSummarize.length === 0) return;

    // 4. Load existing summary
    const user = await ctx.runQuery(internal.users.getById, { userId });
    const existingSummary = user?.chatSummary ?? "";

    // 5. Build summarization prompt
    const transcript = toSummarize
      .map((m: any) => `${m.role}: ${m.content}`)
      .join("\n");

    const prompt = existingSummary
      ? `Here is the existing conversation summary:\n${existingSummary}\n\nHere are newer messages to incorporate:\n${transcript}\n\nProduce an updated summary that captures all key decisions, preferences, goals, and context from both the existing summary and the new messages. Keep it concise (max 500 words). Write in third person about the athlete.`
      : `Summarize this coaching conversation. Capture key decisions, athlete preferences, goals, training history context, and any plans discussed. Keep it concise (max 500 words). Write in third person about the athlete.\n\n${transcript}`;

    // 6. Call Claude to summarize
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error("compactHistory: ANTHROPIC_API_KEY not set, skipping");
      return;
    }

    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const summary = response.content
      .filter((block) => block.type === "text")
      .map((block) => (block as { type: "text"; text: string }).text)
      .join("\n");

    // 7. Store summary on user record
    await ctx.runMutation(internal.users.updateChatSummary, {
      userId,
      chatSummary: summary,
    });

    // 8. Delete old messages
    await ctx.runMutation(internal.chatMessages.deleteMessages, {
      messageIds: toSummarize.map((m: any) => m._id),
    });
  },
});
