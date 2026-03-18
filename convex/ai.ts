import Anthropic from "@anthropic-ai/sdk";
import { action, internalMutation } from "./_generated/server";
import { ALLOWED_EMAILS } from "./constants";
// @ts-ignore
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { checkCreditLimit } from "./creditLimit";

// ---------------------------------------------------------------------------
// Prompt constants
// Defined inline because Convex actions cannot import from lib/
// ---------------------------------------------------------------------------

const BASE_COACHING_PROMPT = `You are an expert endurance coach with deep knowledge of exercise physiology, training periodization, and performance optimization for running, cycling, walking, and hiking. You have coached athletes at all levels, from beginners to competitive athletes.

Your coaching style is encouraging but honest — you celebrate progress while delivering straightforward feedback when improvements are needed. You are data-driven and always reference specific numbers from the athlete's data (paces, speeds, distances, heart rates, elevation) rather than speaking in generalities. Every observation you make is grounded in the actual numbers.

IMPORTANT — Activity type distinction:
- "Run" = road running. Use pace (min/km) as the primary metric.
- "TrailRun" = trail running. Use pace (min/km) but factor in elevation heavily; slower paces are expected on technical/hilly terrain.
- "Ride"/"VirtualRide"/"MountainBikeRide"/"GravelRide"/"EBikeRide" = cycling. Use speed (km/h) as the primary metric, NEVER pace. Cycling efforts are fundamentally different from running — do not compare them as if they are runs.
- "Walk" = walking. Use pace (min/km) but recognize walking paces are much slower than running and this is expected.
- "Hike" = hiking. Similar to walking but factor in elevation gain/loss significantly.

Never confuse cycling with running. Never report pace for cycling activities — always use speed in km/h. When analyzing mixed training (e.g. someone who runs and cycles), treat each activity type on its own terms and recognize cross-training benefits.

You understand training principles deeply: the importance of easy days and hard days, how periodization builds fitness over time, the role of recovery in adaptation, and how to spot signs of overtraining. You know that most aerobic improvement comes from easy, consistent mileage and that intensity should be introduced gradually.

Your recommendations are always actionable and specific. Instead of "run more," you say "aim for one additional easy 5K this week." Instead of "recover better," you say "consider moving your hard workout from Tuesday to Thursday to allow 48 hours after Monday's long run."

You keep responses focused and practical. Athletes want insights they can apply immediately.`;

const ACTIVITY_ANALYSIS_PROMPT = `${BASE_COACHING_PROMPT}

For this analysis, you are reviewing a single activity in the context of the athlete's recent training. Pay attention to the ACTIVITY TYPE field — it determines how you analyze the effort:

For running/trail running activities:
1. Compare this run's pace and heart rate to the athlete's recent runs and identify if this was a hard, easy, or moderate effort.
2. Identify what went well — strong pacing, good negative split, solid heart rate control, or impressive consistency across splits.
3. Suggest one or two concrete improvements.
4. Place this run in the context of the training week.

For cycling activities:
1. Compare this ride's average speed and heart rate to the athlete's recent rides. Use km/h, never min/km.
2. Identify what went well — consistent power/speed, good climbing, efficient pacing.
3. Suggest improvements — cadence, pacing on climbs, speed targets.
4. Place this ride in the context of the training week.

For walking/hiking activities:
1. Note the distance, duration, and elevation gain. Walking and hiking paces are naturally slower.
2. Highlight fitness benefits — active recovery, elevation training, consistency.

If the athlete does multiple activity types, recognize cross-training benefits without confusing the metrics.

Keep your response to 3–4 paragraphs. Be specific with numbers. Be encouraging but honest.`;

const PROGRESS_OVERVIEW_PROMPT = `${BASE_COACHING_PROMPT}

For this analysis, you are reviewing the athlete's training trends over the past 30–90 days. The data includes ALL activity types — pay attention to the type of each activity.

Your job is to:

1. Assess weekly volume progression per activity type — running mileage separately from cycling distance. Is running mileage increasing too fast (>10% per week is a red flag)?
2. Identify improvements over time — are running paces improving? Are cycling speeds increasing? Treat each activity type with appropriate metrics (pace for running, speed for cycling).
3. Comment on training mix — is the athlete balancing different activity types well? Are cycling/walking sessions providing good cross-training and recovery?
4. Comment on rest day patterns — is the athlete recovering enough between hard efforts?
5. Flag any injury risk indicators — sudden volume spikes, signs of fatigue.
6. Give 2–3 specific training recommendations for the coming weeks based on the data.

IMPORTANT: Do not treat cycling distances as running distances. A 40km ride is very different from a 40km run. Analyze each activity type separately and then comment on how they work together.

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

function speedMetricLabel(type: string): string {
  return isCycling(type) ? "Average Speed" : "Average Pace";
}

function activityTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    Run: "Run",
    TrailRun: "Trail Run",
    Walk: "Walk",
    Hike: "Hike",
    Ride: "Ride",
    VirtualRide: "Virtual Ride",
    MountainBikeRide: "MTB Ride",
    GravelRide: "Gravel Ride",
    EBikeRide: "E-Bike Ride",
  };
  return labels[type] ?? type;
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
  handler: async (ctx, args): Promise<string> => {
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

    // Fetch recent chat messages for coaching context
    const chatHistory: any[] = await ctx.runQuery(
      // @ts-ignore
      api.chatMessages.list,
      { limit: 20 }
    );
    const chatSummary = user.chatSummary ?? "";

    // Build a structured message with activity data
    const actType = activity.type ?? "Run";
    const activityData = `
CURRENT ACTIVITY:
- Type: ${activityTypeLabel(actType)}
- Name: ${activity.name}
- Date: ${new Date(activity.startDate).toLocaleDateString()}
- Distance: ${metersToKm(activity.distance)} km
- Moving Time: ${formatDuration(activity.movingTime)}
- ${speedMetricLabel(actType)}: ${formatSpeedMetric(actType, activity.averageSpeed)}
- Max Speed: ${isCycling(actType) ? `${speedToKmh(activity.maxSpeed)} km/h` : `${speedToPaceMinPerKm(activity.maxSpeed)} min/km`}
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
            `  Split ${i + 1}: ${metersToKm(s.distance)} km @ ${formatSpeedMetric(actType, s.averageSpeed ?? 0)}${s.elevationDifference != null ? `, elev ${s.elevationDifference > 0 ? "+" : ""}${Math.round(s.elevationDifference)}m` : ""}`
        )
        .join("\n")}`
    : ""
}

RECENT TRAINING CONTEXT (last 7 days, excluding this activity):
${
  contextActivities.length === 0
    ? "No other activities in the past 7 days."
    : contextActivities
        .map(
          (a: any) =>
            `- ${new Date(a.startDate).toLocaleDateString()}: [${activityTypeLabel(a.type ?? "Run")}] ${a.name} — ${metersToKm(a.distance)} km @ ${formatSpeedMetric(a.type ?? "Run", a.averageSpeed)}${a.averageHeartrate != null ? `, avg HR ${Math.round(a.averageHeartrate)} bpm` : ""}`
        )
        .join("\n")
}

${chatSummary ? `COACHING CONVERSATION CONTEXT:\n${chatSummary}\n` : ""}${
  chatHistory.length > 0
    ? `RECENT CHAT MESSAGES:\n${chatHistory.slice(-10).map((m: any) => `${m.role}: ${m.content.slice(0, 200)}`).join("\n")}\n`
    : ""
}
Please analyze this ${activityTypeLabel(actType).toLowerCase()} and provide coaching feedback.
`.trim();

    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: ACTIVITY_ANALYSIS_PROMPT,
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
  handler: async (ctx): Promise<string> => {
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

    // Fetch last 90 days of activities (use a large limit)
    // @ts-ignore
    const allActivities: any[] = await ctx.runQuery(api.activities.list, { limit: 200 });
    const ninetyDaysAgo = Date.now() - 90 * 24 * 60 * 60 * 1000;
    const activities = allActivities.filter((a: any) => a.startDate >= ninetyDaysAgo);

    if (activities.length === 0) {
      throw new Error("No activities in the last 90 days to analyze");
    }

    // Group activities by type category
    const runTypes = ["Run", "TrailRun"];
    const cycleTypes = CYCLING_TYPES;
    const walkTypes = ["Walk", "Hike"];

    const runActivities = activities.filter((a: any) => runTypes.includes(a.type));
    const cycleActivities = activities.filter((a: any) => cycleTypes.includes(a.type));
    const walkActivities = activities.filter((a: any) => walkTypes.includes(a.type));
    const otherActivities = activities.filter(
      (a: any) => !runTypes.includes(a.type) && !cycleTypes.includes(a.type) && !walkTypes.includes(a.type)
    );

    // Compute weekly buckets with type breakdown
    const weeklyMap = new Map<string, {
      runDistance: number; runCount: number; runSpeeds: number[];
      rideDistance: number; rideCount: number; rideSpeeds: number[];
      walkDistance: number; walkCount: number;
      otherCount: number;
    }>();

    for (const a of activities) {
      const date = new Date(a.startDate);
      const dayOfWeek = date.getDay();
      const monday = new Date(date);
      monday.setDate(date.getDate() - ((dayOfWeek + 6) % 7));
      const weekKey = monday.toISOString().slice(0, 10);

      if (!weeklyMap.has(weekKey)) {
        weeklyMap.set(weekKey, {
          runDistance: 0, runCount: 0, runSpeeds: [],
          rideDistance: 0, rideCount: 0, rideSpeeds: [],
          walkDistance: 0, walkCount: 0,
          otherCount: 0,
        });
      }
      const week = weeklyMap.get(weekKey)!;

      if (runTypes.includes(a.type)) {
        week.runDistance += a.distance;
        week.runCount += 1;
        if (a.averageSpeed > 0) week.runSpeeds.push(a.averageSpeed);
      } else if (cycleTypes.includes(a.type)) {
        week.rideDistance += a.distance;
        week.rideCount += 1;
        if (a.averageSpeed > 0) week.rideSpeeds.push(a.averageSpeed);
      } else if (walkTypes.includes(a.type)) {
        week.walkDistance += a.distance;
        week.walkCount += 1;
      } else {
        week.otherCount += 1;
      }
    }

    const weeks = Array.from(weeklyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([weekStart, d]) => {
        const parts: string[] = [];
        if (d.runCount > 0) {
          const avgPace = d.runSpeeds.length > 0
            ? speedToPaceMinPerKm(d.runSpeeds.reduce((a, b) => a + b, 0) / d.runSpeeds.length)
            : "--";
          parts.push(`${(d.runDistance / 1000).toFixed(1)} km running (${d.runCount} run(s), avg ${avgPace} min/km)`);
        }
        if (d.rideCount > 0) {
          const avgSpeed = d.rideSpeeds.length > 0
            ? speedToKmh(d.rideSpeeds.reduce((a, b) => a + b, 0) / d.rideSpeeds.length)
            : "--";
          parts.push(`${(d.rideDistance / 1000).toFixed(1)} km cycling (${d.rideCount} ride(s), avg ${avgSpeed} km/h)`);
        }
        if (d.walkCount > 0) {
          parts.push(`${(d.walkDistance / 1000).toFixed(1)} km walking/hiking (${d.walkCount})`);
        }
        if (d.otherCount > 0) {
          parts.push(`${d.otherCount} other activity(ies)`);
        }
        return { weekStart, summary: parts.join("; ") };
      });

    // Overall stats by type
    const runDistanceKm = runActivities.reduce((s: number, a: any) => s + a.distance, 0) / 1000;
    const rideDistanceKm = cycleActivities.reduce((s: number, a: any) => s + a.distance, 0) / 1000;
    const walkDistanceKm = walkActivities.reduce((s: number, a: any) => s + a.distance, 0) / 1000;

    const runSpeedValues = runActivities.filter((a: any) => a.averageSpeed > 0).map((a: any) => a.averageSpeed);
    const overallRunPace = runSpeedValues.length > 0
      ? speedToPaceMinPerKm(runSpeedValues.reduce((a: number, b: number) => a + b, 0) / runSpeedValues.length)
      : "--";
    const rideSpeedValues = cycleActivities.filter((a: any) => a.averageSpeed > 0).map((a: any) => a.averageSpeed);
    const overallRideSpeed = rideSpeedValues.length > 0
      ? speedToKmh(rideSpeedValues.reduce((a: number, b: number) => a + b, 0) / rideSpeedValues.length)
      : "--";

    const longestRun = runActivities.length > 0
      ? runActivities.reduce((max: any, a: any) => (a.distance > (max?.distance ?? 0) ? a : max), null)
      : null;
    const longestRide = cycleActivities.length > 0
      ? cycleActivities.reduce((max: any, a: any) => (a.distance > (max?.distance ?? 0) ? a : max), null)
      : null;

    const hrValues = activities
      .filter((a: any) => a.averageHeartrate != null)
      .map((a: any) => a.averageHeartrate as number);
    const avgHR = hrValues.length > 0
      ? Math.round(hrValues.reduce((a, b) => a + b, 0) / hrValues.length)
      : null;

    // Fetch chat context
    const chatHistory: any[] = await ctx.runQuery(
      // @ts-ignore
      api.chatMessages.list,
      { limit: 20 }
    );
    const chatSummary = user.chatSummary ?? "";

    const statsMessage = `
TRAINING OVERVIEW (last 90 days):
- Total Activities: ${activities.length}
- Date Range: ${new Date(activities[activities.length - 1].startDate).toLocaleDateString()} to ${new Date(activities[0].startDate).toLocaleDateString()}
${avgHR != null ? `- Overall Average Heart Rate: ${avgHR} bpm` : ""}

RUNNING (${runActivities.length} activities):
${runActivities.length > 0 ? `- Total Distance: ${runDistanceKm.toFixed(1)} km
- Average Pace: ${overallRunPace} min/km
- Longest Run: ${longestRun ? `${metersToKm(longestRun.distance)} km on ${new Date(longestRun.startDate).toLocaleDateString()}` : "N/A"}` : "No running activities."}

CYCLING (${cycleActivities.length} activities):
${cycleActivities.length > 0 ? `- Total Distance: ${rideDistanceKm.toFixed(1)} km
- Average Speed: ${overallRideSpeed} km/h
- Longest Ride: ${longestRide ? `${metersToKm(longestRide.distance)} km on ${new Date(longestRide.startDate).toLocaleDateString()}` : "N/A"}` : "No cycling activities."}

WALKING/HIKING (${walkActivities.length} activities):
${walkActivities.length > 0 ? `- Total Distance: ${walkDistanceKm.toFixed(1)} km` : "No walking/hiking activities."}

WEEKLY BREAKDOWN (oldest to most recent):
${weeks.map((w) => `- Week of ${w.weekStart}: ${w.summary}`).join("\n")}

${chatSummary ? `COACHING CONVERSATION CONTEXT:\n${chatSummary}\n` : ""}${
  chatHistory.length > 0
    ? `RECENT CHAT MESSAGES:\n${chatHistory.slice(-10).map((m: any) => `${m.role}: ${m.content.slice(0, 200)}`).join("\n")}\n`
    : ""
}
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
