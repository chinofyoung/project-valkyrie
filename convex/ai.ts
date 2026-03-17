import Anthropic from "@anthropic-ai/sdk";
import { action, internalMutation } from "./_generated/server";
// @ts-ignore
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";

// ---------------------------------------------------------------------------
// Prompt constants
// Defined inline because Convex actions cannot import from lib/
// ---------------------------------------------------------------------------

const BASE_COACHING_PROMPT = `You are an expert running coach with deep knowledge of exercise physiology, training periodization, and performance optimization. You have coached athletes at all levels, from beginners to competitive runners.

Your coaching style is encouraging but honest — you celebrate progress while delivering straightforward feedback when improvements are needed. You are data-driven and always reference specific numbers from the athlete's data (paces, distances, heart rates, elevation) rather than speaking in generalities. Every observation you make is grounded in the actual numbers.

You understand training principles deeply: the importance of easy days and hard days, how periodization builds fitness over time, the role of recovery in adaptation, and how to spot signs of overtraining. You know that most aerobic improvement comes from easy, consistent mileage and that intensity should be introduced gradually.

Your recommendations are always actionable and specific. Instead of "run more," you say "aim for one additional easy 5K this week." Instead of "recover better," you say "consider moving your hard workout from Tuesday to Thursday to allow 48 hours after Monday's long run."

You keep responses focused and practical. Athletes want insights they can apply immediately.`;

const RUN_ANALYSIS_PROMPT = `${BASE_COACHING_PROMPT}

For this analysis, you are reviewing a single run in the context of the athlete's recent training. Your job is to:

1. Compare this run's pace and heart rate to the athlete's recent runs and identify if this was a hard, easy, or moderate effort relative to their baseline.
2. Identify what went well — strong pacing, good negative split, solid heart rate control, or impressive consistency across splits.
3. Suggest one or two concrete improvements or observations — a split that slowed down, an unusually high heart rate, a pacing strategy to try next time.
4. Place this run in the context of the training week — was this appropriate given what came before and after?

Keep your response to 3–4 paragraphs. Be specific with numbers. Be encouraging but honest.`;

const PROGRESS_OVERVIEW_PROMPT = `${BASE_COACHING_PROMPT}

For this analysis, you are reviewing the athlete's training trends over the past 30–90 days. Your job is to:

1. Assess weekly mileage progression — is it increasing too fast (>10% per week is a red flag), too slow, or at a healthy sustainable rate?
2. Identify pace improvements over time — are easy runs getting faster at the same effort? Are long runs showing more consistent pacing?
3. Comment on rest day patterns — is the athlete recovering enough between hard efforts? Are there stretches of consecutive days without rest?
4. Flag any injury risk indicators — sudden mileage spikes, a sharp increase in intensity, or signs of fatigue (slowing easy pace despite high volume).
5. Give 2–3 specific training recommendations for the coming weeks based on the data.

Keep your response to 4–5 paragraphs. Cite specific numbers from the data. Be direct about both strengths and concerns.`;

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

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${s}s`;
}

// ---------------------------------------------------------------------------
// Rate limit helper
// Returns true if the user is under their daily analysis limit (20/day)
// ---------------------------------------------------------------------------

async function checkRateLimit(ctx: ActionCtx, userId: Id<"users">): Promise<boolean> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const todayTimestamp = startOfDay.getTime();
  const analyses = await ctx.runQuery(internal.aiAnalyses.countSince, {
    userId,
    since: todayTimestamp,
  });
  return analyses < 20;
}

// ---------------------------------------------------------------------------
// insertAnalysis — internal mutation to persist an AI analysis
// ---------------------------------------------------------------------------

export const insertAnalysis = internalMutation({
  args: {
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
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("aiAnalyses", args);
  },
});

// ---------------------------------------------------------------------------
// analyzeRun — client-callable action
// Analyzes a single run using Claude and stores the result
// ---------------------------------------------------------------------------

export const analyzeRun = action({
  args: {
    activityId: v.id("activities"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    // @ts-ignore
    const user = await ctx.runQuery(api.users.currentUser, {});
    if (!user) throw new Error("User not found");

    const withinLimit = await checkRateLimit(ctx, user._id);
    if (!withinLimit) throw new Error("Rate limit exceeded: maximum 20 analyses per day");

    // Fetch the target activity
    // @ts-ignore
    const activity = await ctx.runQuery(api.activities.getById, { id: args.activityId });
    if (!activity) throw new Error("Activity not found");

    // Fetch last 7 days of activities for context
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    // @ts-ignore
    const recentActivities: any[] = await ctx.runQuery(api.activities.list, { limit: 20 });
    const contextActivities = recentActivities.filter(
      (a: any) => a.startDate >= sevenDaysAgo && a._id !== args.activityId
    );

    // Build a structured message with activity data
    const activityData = `
CURRENT RUN:
- Name: ${activity.name}
- Date: ${new Date(activity.startDate).toLocaleDateString()}
- Distance: ${metersToKm(activity.distance)} km
- Moving Time: ${formatDuration(activity.movingTime)}
- Average Pace: ${speedToPaceMinPerKm(activity.averageSpeed)} min/km
- Max Speed Pace: ${speedToPaceMinPerKm(activity.maxSpeed)} min/km
- Elevation Gain: ${Math.round(activity.totalElevationGain)}m
${activity.averageHeartrate != null ? `- Average Heart Rate: ${Math.round(activity.averageHeartrate)} bpm` : ""}
${activity.maxHeartrate != null ? `- Max Heart Rate: ${Math.round(activity.maxHeartrate)} bpm` : ""}
${activity.averageCadence != null ? `- Average Cadence: ${Math.round(activity.averageCadence * 2)} spm` : ""}
${activity.calories != null ? `- Calories: ${Math.round(activity.calories)}` : ""}
${
  Array.isArray(activity.splits) && activity.splits.length > 0
    ? `- Splits (km):\n${activity.splits
        .map(
          (s: any, i: number) =>
            `  Split ${i + 1}: ${metersToKm(s.distance)} km @ ${speedToPaceMinPerKm(s.averageSpeed ?? 0)} min/km${s.elevationDifference != null ? `, elev ${s.elevationDifference > 0 ? "+" : ""}${Math.round(s.elevationDifference)}m` : ""}`
        )
        .join("\n")}`
    : ""
}

RECENT TRAINING CONTEXT (last 7 days, excluding this run):
${
  contextActivities.length === 0
    ? "No other activities in the past 7 days."
    : contextActivities
        .map(
          (a: any) =>
            `- ${new Date(a.startDate).toLocaleDateString()}: ${a.name} — ${metersToKm(a.distance)} km @ ${speedToPaceMinPerKm(a.averageSpeed)} min/km${a.averageHeartrate != null ? `, avg HR ${Math.round(a.averageHeartrate)} bpm` : ""}`
        )
        .join("\n")
}

Please analyze this run and provide coaching feedback.
`.trim();

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: RUN_ANALYSIS_PROMPT,
      messages: [{ role: "user", content: activityData }],
    });

    const responseText = response.content
      .filter((block) => block.type === "text")
      .map((block) => (block as { type: "text"; text: string }).text)
      .join("\n");

    await ctx.runMutation(internal.ai.insertAnalysis, {
      userId: user._id,
      activityId: args.activityId,
      type: "run_summary",
      content: responseText,
      model: "claude-sonnet-4-6",
      createdAt: Date.now(),
    });

    return responseText;
  },
});

// ---------------------------------------------------------------------------
// analyzeProgress — client-callable action
// Analyzes training trends over the last 90 days
// ---------------------------------------------------------------------------

export const analyzeProgress = action({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    // @ts-ignore
    const user = await ctx.runQuery(api.users.currentUser, {});
    if (!user) throw new Error("User not found");

    const withinLimit = await checkRateLimit(ctx, user._id);
    if (!withinLimit) throw new Error("Rate limit exceeded: maximum 20 analyses per day");

    // Fetch last 90 days of activities (use a large limit)
    // @ts-ignore
    const allActivities: any[] = await ctx.runQuery(api.activities.list, { limit: 200 });
    const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
    const activities = allActivities.filter((a: any) => a.startDate >= ninetyDaysAgo);

    if (activities.length === 0) {
      throw new Error("No activities in the last 90 days to analyze");
    }

    // Compute weekly buckets
    const weeklyMap = new Map<string, { distance: number; runs: number; paces: number[] }>();
    for (const a of activities) {
      const date = new Date(a.startDate);
      // ISO week key: year-weekNumber
      const dayOfWeek = date.getDay(); // 0 = Sunday
      const monday = new Date(date);
      monday.setDate(date.getDate() - ((dayOfWeek + 6) % 7));
      const weekKey = monday.toISOString().slice(0, 10);

      if (!weeklyMap.has(weekKey)) {
        weeklyMap.set(weekKey, { distance: 0, runs: 0, paces: [] });
      }
      const week = weeklyMap.get(weekKey)!;
      week.distance += a.distance;
      week.runs += 1;
      if (a.averageSpeed > 0) week.paces.push(a.averageSpeed);
    }

    const weeks = Array.from(weeklyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([weekStart, data]) => ({
        weekStart,
        distanceKm: (data.distance / 1000).toFixed(1),
        runs: data.runs,
        avgPace:
          data.paces.length > 0
            ? speedToPaceMinPerKm(data.paces.reduce((a, b) => a + b, 0) / data.paces.length)
            : "--",
      }));

    // Overall stats
    const totalDistanceKm = activities.reduce((s: number, a: any) => s + a.distance, 0) / 1000;
    const totalRuns = activities.length;
    const longestRun = activities.reduce(
      (max: any, a: any) => (a.distance > (max?.distance ?? 0) ? a : max),
      null
    );
    const speedValues = activities.filter((a: any) => a.averageSpeed > 0).map((a: any) => a.averageSpeed);
    const overallAvgPace =
      speedValues.length > 0
        ? speedToPaceMinPerKm(speedValues.reduce((a: number, b: number) => a + b, 0) / speedValues.length)
        : "--";

    // Heart rate averages
    const hrValues = activities
      .filter((a: any) => a.averageHeartrate != null)
      .map((a: any) => a.averageHeartrate as number);
    const avgHR =
      hrValues.length > 0 ? Math.round(hrValues.reduce((a, b) => a + b, 0) / hrValues.length) : null;

    const statsMessage = `
TRAINING OVERVIEW (last 90 days):
- Total Runs: ${totalRuns}
- Total Distance: ${totalDistanceKm.toFixed(1)} km
- Overall Average Pace: ${overallAvgPace} min/km
${avgHR != null ? `- Average Heart Rate: ${avgHR} bpm` : ""}
- Longest Run: ${longestRun ? `${metersToKm(longestRun.distance)} km on ${new Date(longestRun.startDate).toLocaleDateString()}` : "N/A"}
- Date Range: ${new Date(activities[activities.length - 1].startDate).toLocaleDateString()} to ${new Date(activities[0].startDate).toLocaleDateString()}

WEEKLY BREAKDOWN (oldest to most recent):
${weeks.map((w) => `- Week of ${w.weekStart}: ${w.distanceKm} km across ${w.runs} run(s), avg pace ${w.avgPace} min/km`).join("\n")}

Please analyze my training trends and provide coaching feedback.
`.trim();

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1500,
      system: PROGRESS_OVERVIEW_PROMPT,
      messages: [{ role: "user", content: statsMessage }],
    });

    const responseText = response.content
      .filter((block) => block.type === "text")
      .map((block) => (block as { type: "text"; text: string }).text)
      .join("\n");

    await ctx.runMutation(internal.ai.insertAnalysis, {
      userId: user._id,
      type: "progress_overview",
      content: responseText,
      model: "claude-sonnet-4-6",
      createdAt: Date.now(),
    });

    return responseText;
  },
});
