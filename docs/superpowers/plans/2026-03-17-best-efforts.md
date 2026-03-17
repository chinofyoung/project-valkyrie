# Best Efforts Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sync Strava best efforts data during activity sync and display personal bests on the dashboard.

**Architecture:** Add a `bestEfforts` table to Convex, modify the existing activity sync to fetch detailed activity data for run-type activities (extracting best efforts), and add a dashboard section showing the fastest time per standard distance. The detail-fetch step is a separate self-scheduling action to respect Strava rate limits.

**Tech Stack:** Convex (backend/db), Next.js 16 (frontend), Strava API v3, Tailwind CSS

---

## File Structure

| Action | Path | Responsibility |
|--------|------|----------------|
| Modify | `convex/schema.ts` | Add `bestEfforts` table definition |
| Modify | `convex/activities.ts` | Change `batchInsert` return type to include new activity IDs |
| Create | `convex/bestEfforts.ts` | Queries and mutations for best efforts |
| Modify | `convex/strava.ts` | Add `fetchBestEfforts` action, wire into sync flow |
| Modify | `app/(app)/dashboard/page.tsx` | Add Best Efforts section to dashboard |

---

### Task 1: Add `bestEfforts` table to schema

**Files:**
- Modify: `convex/schema.ts:107` (before closing `});`)

- [ ] **Step 1: Add the bestEfforts table definition**

Insert after the `trainingPlans` table (before line 108's `});`):

```ts
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
```

- [ ] **Step 2: Verify Convex dev server accepts the schema**

Run: Check the Convex dev server terminal output for schema push success. No errors expected.

- [ ] **Step 3: Commit**

```bash
git add convex/schema.ts
git commit -m "feat: add bestEfforts table to schema"
```

---

### Task 2: Modify `batchInsert` to return new activity IDs

**Files:**
- Modify: `convex/activities.ts:113-134`
- Modify: `convex/strava.ts:228-231`

- [ ] **Step 1: Update `batchInsert` handler to collect and return new activity info**

Replace the handler in `convex/activities.ts` (lines 113-134):

```ts
  handler: async (ctx, args) => {
    let inserted = 0;
    const newActivities: Array<{ stravaId: number; _id: string; type: string }> = [];

    for (const activity of args.activities) {
      const existing = await ctx.db
        .query("activities")
        .withIndex("by_userId_stravaId", (q) =>
          q.eq("userId", args.userId).eq("stravaId", activity.stravaId)
        )
        .unique();

      if (existing) continue;

      const id = await ctx.db.insert("activities", {
        userId: args.userId,
        ...activity,
      });
      inserted++;
      newActivities.push({ stravaId: activity.stravaId, _id: id, type: activity.type });
    }

    return { inserted, newActivities };
  },
```

- [ ] **Step 2: Update the caller in `strava.ts` to destructure the new return shape**

In `convex/strava.ts`, replace line 228-231:

```ts
      // Old:
      // const inserted: number = await ctx.runMutation(
      //   internal.activities.batchInsert,
      //   { userId, activities: mapped }
      // );
```

With:

```ts
      const { inserted, newActivities } = await ctx.runMutation(
        internal.activities.batchInsert,
        { userId, activities: mapped }
      ) as { inserted: number; newActivities: Array<{ stravaId: number; _id: string; type: string }> };
```

- [ ] **Step 3: Commit**

```bash
git add convex/activities.ts convex/strava.ts
git commit -m "feat: batchInsert returns new activity IDs and types"
```

---

### Task 3: Create `convex/bestEfforts.ts` with query and mutation

**Files:**
- Create: `convex/bestEfforts.ts`

- [ ] **Step 1: Create the file with `listForUser` query and `batchUpsert` mutation**

```ts
import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";

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
```

- [ ] **Step 2: Verify Convex dev server picks up the new file**

Check dev server output — should show `bestEfforts` functions registered.

- [ ] **Step 3: Commit**

```bash
git add convex/bestEfforts.ts
git commit -m "feat: add bestEfforts query and batchUpsert mutation"
```

---

### Task 4: Add `fetchBestEfforts` action to `strava.ts`

**Files:**
- Modify: `convex/strava.ts` (add new action, wire into `fetchActivitiesPage`)

- [ ] **Step 1: Add the `fetchBestEfforts` internal action**

Add at the end of `convex/strava.ts`:

```ts
// ---------------------------------------------------------------------------
// fetchBestEfforts
// Self-scheduling action that fetches detailed activity data from Strava
// to extract best efforts. Processes up to 80 activities per batch.
// ---------------------------------------------------------------------------
const BEST_EFFORTS_BATCH_SIZE = 80;
const DETAIL_FETCH_DELAY_MS = 200;
const RATE_LIMIT_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes

export const fetchBestEfforts = internalAction({
  args: {
    userId: v.id("users"),
    activities: v.array(
      v.object({
        stravaId: v.number(),
        activityId: v.id("activities"),
      })
    ),
  },
  handler: async (ctx, args) => {
    const { userId, activities } = args;

    // Take up to BEST_EFFORTS_BATCH_SIZE for this batch
    const batch = activities.slice(0, BEST_EFFORTS_BATCH_SIZE);
    const remaining = activities.slice(BEST_EFFORTS_BATCH_SIZE);

    try {
      const accessToken = await ctx.runAction(
        internal.strava.refreshTokenIfNeeded,
        { userId }
      );

      for (const { stravaId, activityId } of batch) {
        try {
          const url = `https://www.strava.com/api/v3/activities/${stravaId}?include_all_efforts=true`;
          const resp = await fetch(url, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });

          if (resp.status === 429) {
            // Rate limited — re-schedule remaining activities with cooldown
            const remainingFromHere = batch
              .slice(batch.indexOf(batch.find((a: any) => a.stravaId === stravaId)!))
              .concat(remaining);
            await ctx.scheduler.runAfter(
              RATE_LIMIT_COOLDOWN_MS,
              internal.strava.fetchBestEfforts,
              { userId, activities: remainingFromHere }
            );
            return;
          }

          if (!resp.ok) {
            console.warn(`Failed to fetch detail for activity ${stravaId}: ${resp.status}`);
            continue;
          }

          const detail = await resp.json();
          const bestEfforts: any[] = detail.best_efforts ?? [];

          if (bestEfforts.length > 0) {
            const efforts = bestEfforts.map((e: any) => ({
              stravaActivityId: stravaId,
              activityId,
              name: e.name,
              distance: e.distance,
              elapsedTime: e.elapsed_time,
              movingTime: e.moving_time,
              startDate: new Date(detail.start_date).getTime(),
              ...(e.pr_rank != null ? { prRank: e.pr_rank } : {}),
            }));

            await ctx.runMutation(internal.bestEfforts.batchUpsert, {
              userId,
              efforts,
            });
          }

          // Small delay between API calls
          if (DETAIL_FETCH_DELAY_MS > 0) {
            await new Promise((r) => setTimeout(r, DETAIL_FETCH_DELAY_MS));
          }
        } catch (err: any) {
          console.warn(`Error fetching best efforts for activity ${stravaId}:`, err?.message);
          // Skip this activity and continue
        }
      }

      // Schedule next batch if more activities remain
      if (remaining.length > 0) {
        await ctx.scheduler.runAfter(
          RATE_LIMIT_COOLDOWN_MS,
          internal.strava.fetchBestEfforts,
          { userId, activities: remaining }
        );
      }
    } catch (err: any) {
      console.error("fetchBestEfforts batch failed:", err?.message);
    }
  },
});
```

- [ ] **Step 2: Wire `fetchBestEfforts` into `fetchActivitiesPage`**

In `convex/strava.ts`, inside the `fetchActivitiesPage` handler, after the `batchInsert` call and progress update (around line 240, after `syncedActivities: totalSynced`), add:

```ts
      // Schedule best-efforts detail fetch for newly inserted run-type activities
      const RUN_TYPES = ["Run", "TrailRun"];
      const runActivities = newActivities
        .filter((a: any) => RUN_TYPES.includes(a.type))
        .map((a: any) => ({ stravaId: a.stravaId, activityId: a._id }));

      if (runActivities.length > 0) {
        await ctx.scheduler.runAfter(0, internal.strava.fetchBestEfforts, {
          userId,
          activities: runActivities,
        });
      }
```

- [ ] **Step 3: Commit**

```bash
git add convex/strava.ts
git commit -m "feat: add fetchBestEfforts action and wire into sync flow"
```

---

### Task 5: Add Best Efforts section to dashboard

**Files:**
- Modify: `app/(app)/dashboard/page.tsx`

- [ ] **Step 1: Add the `bestEfforts` query**

At line 28 (with the other queries), add:

```ts
  const bestEfforts = useQuery(api.bestEfforts.listForUser);
```

- [ ] **Step 2: Add helper to compute best per distance and format time**

Add below the `getGreeting` function (after line 21):

```ts
function formatEffortTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function effortPace(distance: number, movingTime: number): string {
  if (!distance || !movingTime) return "--";
  const secondsPerKm = movingTime / (distance / 1000);
  const min = Math.floor(secondsPerKm / 60);
  const sec = Math.round(secondsPerKm % 60);
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

function getBestPerDistance(efforts: any[]): any[] {
  const map = new Map<string, any>();
  for (const e of efforts) {
    const existing = map.get(e.name);
    if (!existing || e.movingTime < existing.movingTime) {
      map.set(e.name, e);
    }
  }
  // Sort by distance ascending
  return Array.from(map.values()).sort((a, b) => a.distance - b.distance);
}
```

- [ ] **Step 3: Add the `BestEffortsSection` component**

Add below the `getBestPerDistance` function:

```tsx
function BestEffortsSection({ efforts }: { efforts: any[] }) {
  const bests = getBestPerDistance(efforts);
  return (
    <div className="mt-4 md:mt-5 bg-[#1A1A2A] rounded-2xl border border-white/5 p-5">
      <span className="text-xs font-semibold uppercase tracking-widest text-[#9CA3AF] block mb-3">
        Best Efforts
      </span>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {bests.map((effort: any) => (
          <div
            key={effort.name}
            className="rounded-xl border border-white/5 p-3.5"
            style={{ background: "rgba(200,252,3,0.03)" }}
          >
            <div className="text-xs text-[#9CA3AF] mb-1">{effort.name}</div>
            <div className="text-lg font-bold text-white">{formatEffortTime(effort.movingTime)}</div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-[#9CA3AF]">{effortPace(effort.distance, effort.movingTime)} /km</span>
              <span className="text-xs text-white/30">·</span>
              <span className="text-xs text-[#9CA3AF]">{formatRelativeDate(effort.startDate)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add the Best Efforts section in the JSX**

Insert after the Recent Activities section closing `</div>` and before the outer `</div>` (after line 282):

```tsx
      {/* Best Efforts */}
      {bestEfforts === undefined && activities !== undefined && activities.length > 0 && (
        <div className="mt-4 md:mt-5 bg-[#1A1A2A] rounded-2xl border border-white/5 p-5">
          <div className="bg-white/5 animate-pulse rounded h-3 w-24 mb-4" />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white/5 animate-pulse rounded-xl h-24" />
            ))}
          </div>
        </div>
      )}

      {bestEfforts && bestEfforts.length > 0 && (
        <BestEffortsSection efforts={bestEfforts} />
      )}
```

- [ ] **Step 5: Verify the dashboard renders correctly**

Open the app in browser, check:
- Skeleton shows while loading
- Section hidden when no best efforts
- Cards display when data exists

- [ ] **Step 6: Commit**

```bash
git add app/(app)/dashboard/page.tsx
git commit -m "feat: add Best Efforts section to dashboard"
```
