# Best Efforts Feature Design

## Overview

Sync Strava's built-in best efforts data and display them on the dashboard. Best efforts are fastest times for standard distances (1K, 1 Mile, 5K, 10K, Half Marathon, Marathon) automatically detected by Strava across a user's runs.

## Data Model

### New `bestEfforts` table

| Field | Type | Description |
|-------|------|-------------|
| userId | Id<"users"> | Foreign key to users table |
| stravaActivityId | number | Strava activity that produced this effort |
| activityId | Id<"activities"> | Foreign key to local activities table |
| name | string | Distance label from Strava (e.g. "5K", "10K") |
| distance | number | Distance in meters |
| elapsedTime | number | Elapsed time in seconds |
| movingTime | number | Moving time in seconds |
| startDate | number | Timestamp of the activity |
| prRank | number (optional) | Strava PR rank (1 = all-time best) |

**Indexes:**
- `by_userId_name` — query all efforts for a user by distance name, supports sorted retrieval
- `by_userId_stravaActivityId_name` — compound index for deduplication (one activity can produce multiple distance efforts)

## Sync Changes

### Problem
The current sync uses Strava's `/athlete/activities` list endpoint which does not include best efforts. Best efforts are only available on the detailed `/activities/{id}` endpoint.

### Required change to `batchInsert`
The current `activities.batchInsert` returns only an insert count. It must be modified to also return the list of `stravaId` values (and corresponding Convex `_id` values) for newly inserted activities, so the detail-fetch step knows which activities to process and can populate the `activityId` foreign key.

### Approach
After each page of activities is batch-inserted, fetch detailed data for each **newly inserted run-type activity only** (skip rides, walks, hikes — Strava best efforts are running-only) and extract `best_efforts` from the response.

### Flow
1. `fetchActivitiesPage` inserts a batch of activities as it does today
2. `batchInsert` returns `{ inserted: number, newActivities: Array<{ stravaId, _id }> }`
3. Filter `newActivities` to run types only (`Run`, `TrailRun`)
4. Schedule a new `fetchBestEfforts` internal action with the list of `{ stravaId, activityId }` pairs
5. `fetchBestEfforts` processes activities in batches of 80, with a 200ms delay between each call
6. If more than 80 activities remain, schedule the next batch with a 15-minute delay to respect Strava's 100-requests-per-15-minutes rate limit
7. For each activity, call `GET /api/v3/activities/{stravaId}?include_all_efforts=true`
8. Parse `best_efforts` array from the response
9. Call `bestEfforts.batchUpsert` to insert new records
10. On error for a single activity detail fetch, log the error, skip that activity, and continue

### Rate Limiting
Strava API allows 100 requests per 15 minutes / 1000 per day. The detail-fetch step is separated into its own self-scheduling action (`fetchBestEfforts`) that processes up to 80 activities per batch. If a user has 500 run activities on initial sync, this takes ~7 batches over ~2 hours. Incremental syncs (typically 1-10 new activities) complete in a single batch instantly.

### Token Refresh
`fetchBestEfforts` calls `refreshTokenIfNeeded` at the start of each batch to ensure the access token remains valid throughout the detail-fetch loop.

### Incremental Sync
On incremental syncs, only newly inserted activities are processed for best efforts (same as initial sync — `batchInsert` returns only new records).

## Backend Queries

### `bestEfforts.listForUser` (query)
Returns a flat list of all best efforts for the authenticated user, ordered by `(name, movingTime)` ascending. The UI groups by distance name client-side and displays only the fastest per distance. Convex does not support GROUP BY, so grouping happens in the component.

### `bestEfforts.batchUpsert` (internalMutation)
Takes an array of best effort records. For each, queries the `by_userId_stravaActivityId_name` index to check if an effort with the same `userId + stravaActivityId + name` already exists. Inserts only if new.

## Dashboard UI

### Location
New "Best Efforts" section below the Recent Activities section on the dashboard.

### Layout
- Section header: "Best Efforts" (left)
- 2-column grid on mobile, 3-column on desktop
- Each card shows:
  - Distance name (bold, e.g. "5K")
  - Time (formatted as mm:ss or h:mm:ss)
  - Pace (min/km, derived from distance and **movingTime** for consistency with how runners think about pace)
  - Date achieved (relative, e.g. "3 months ago")
- Only distances with data are rendered — no empty placeholders
- Cards use the same `bg-[#1A1A2A]` / `border-white/5` design tokens as existing dashboard cards

### Skeleton Loader
When best efforts query is loading, show a 2x3 grid of skeleton cards matching the card dimensions.

### Empty State
If no best efforts exist, the section is hidden entirely (no empty card).

## Scope Boundaries

### In scope
- New `bestEfforts` Convex table + schema
- Modify `batchInsert` to return new activity IDs
- New `fetchBestEfforts` self-scheduling action for detail fetches
- Sync best efforts during Strava activity sync
- Dashboard section displaying fastest effort per distance
- Skeleton loader for the new section

### Out of scope
- Historical PR tracking / PR timeline
- Best efforts on the activity detail page
- Manual best effort entry
- Notifications for new PRs
- Storing raw best effort response (can be added later if needed)
