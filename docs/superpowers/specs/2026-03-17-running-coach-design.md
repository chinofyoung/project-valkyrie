# Running Coach Web App — Design Spec

## Overview

A multi-user AI-powered running coach web app. Users connect their Strava account, sync running data, and receive AI-driven coaching insights via Anthropic's Claude API. Built with a Convex-centric architecture for real-time reactivity.

**Tech stack:** Next.js 16, Tailwind CSS v4, Convex, Clerk, Anthropic AI API, Strava API

**Design reference:** Dark UI inspired by [Dribbble fitness coaching concept](https://dribbble.com/shots/26864224-A-Fitness-Coaching-App-Design-Concept) — neon lime accents, rounded cards, mobile-first with desktop sidebar layout.

---

## 1. Authentication & User Management

**Auth flow:** Clerk with Google OAuth as the sole provider. Clerk's `<SignIn />` component handles the login screen. After auth, Clerk's JWT is passed to Convex via the `ConvexProviderWithClerk` wrapper for server-side identity.

**Convex `users` table:**

| Field | Type | Notes |
|-------|------|-------|
| `clerkId` | string | indexed |
| `email` | string | |
| `name` | string | |
| `avatarUrl` | string | |
| `stravaConnected` | boolean | |
| `stravaTokens` | object | accessToken, refreshToken, expiresAt |
| `lastSyncAt` | number (timestamp) | nullable |
| `createdAt` | number (timestamp) | |

**Strava OAuth:** After login, users connect their Strava account via a "Connect Strava" button. The OAuth flow uses a Next.js API route (one exception to Convex-centric — OAuth redirects need a traditional HTTP endpoint) that exchanges the code for tokens and stores them in Convex.

**CSRF protection:** `/api/strava/auth` generates a random `state` parameter and stores it in a short-lived HTTP-only cookie. `/api/strava/callback` validates the returned `state` against the cookie before exchanging the code. Requests with missing or mismatched `state` are rejected.

**Key decisions:**
- Strava tokens stored in the users table for simplicity
- Token refresh handled automatically before any Strava API call
- No app access without Google login — all routes protected

---

## 2. Data Model & Strava Sync

### Activities Table

| Field | Type | Notes |
|-------|------|-------|
| `userId` | Id<"users"> | indexed |
| `stravaId` | number | indexed, dedup key |
| `type` | string | "Run", "TrailRun", etc. |
| `name` | string | |
| `description` | string | |
| `startDate` | number (timestamp) | indexed |
| `distance` | number | meters |
| `movingTime` | number | seconds |
| `elapsedTime` | number | seconds |
| `totalElevationGain` | number | meters |
| `averageSpeed` | number | meters/second (from Strava), convert to pace in UI |
| `maxSpeed` | number | meters/second (from Strava), convert to pace in UI |
| `averageHeartrate` | number | |
| `maxHeartrate` | number | |
| `averageCadence` | number | |
| `calories` | number | |
| `splits` | array | split objects |
| `startLatlng` | array | [lat, lng] |
| `endLatlng` | array | [lat, lng] |
| `map` | object | summaryPolyline |
| `raw` | object | full Strava API response for future-proofing |

### Sync Status Table

| Field | Type | Notes |
|-------|------|-------|
| `userId` | Id<"users"> | indexed |
| `status` | string | "idle" / "syncing" / "completed" / "error" |
| `totalActivities` | number | |
| `syncedActivities` | number | for progress tracking |
| `lastError` | string | nullable |
| `startedAt` | number (timestamp) | |
| `completedAt` | number (timestamp) | |

### Indexes

All tables use Convex `defineSchema` with runtime validation. Key compound indexes:

| Table | Index Name | Fields | Purpose |
|-------|-----------|--------|---------|
| `activities` | `by_userId_startDate` | `[userId, startDate]` | Activity list sorted by date |
| `activities` | `by_userId_stravaId` | `[userId, stravaId]` | Dedup lookups (multi-tenant safe) |
| `chatMessages` | `by_userId_createdAt` | `[userId, createdAt]` | Last 50 messages query |
| `syncStatus` | `by_userId` | `[userId]` | One row per user, upserted |
| `aiAnalyses` | `by_userId_activityId` | `[userId, activityId]` | Cache lookups per activity |
| `trainingPlans` | `by_userId_status` | `[userId, status]` | Find active plan |

### Sync Logic

1. **Initial sync:** User taps "Sync Strava." The sync mutation first checks `syncStatus` — if already "syncing", the request is rejected (prevents duplicate syncs and race conditions on dedup). A Convex action fetches one page of 200 activities from Strava, batch-inserts them via mutation, updates `syncStatus` progress, then uses `ctx.scheduler.runAfter(0, ...)` to schedule itself for the next page. This self-scheduling pattern avoids Convex action timeout limits. The frontend subscribes to `syncStatus` for a real-time progress bar.

2. **Incremental sync:** Subsequent syncs pass `after` parameter set to `lastSyncAt` timestamp. Only new activities are fetched and inserted. Deduplication via `by_userId_stravaId` compound index — query before insert, skip if exists.

3. **Token refresh:** Before any Strava call, check `expiresAt`. If expired, refresh using `refreshToken`, update stored tokens, then proceed.

**Sync status model:** One `syncStatus` row per user, upserted on each sync. Not a history log — fields are overwritten each sync.

**Why store `raw`?** Strava's API returns fields we might not use today but could want later (weather, device info, segment efforts). Storing the full response avoids re-fetching historical data.

---

## 3. AI Integration

Three AI interaction modes, all powered by Anthropic's Claude API.

### Run Analysis (on-demand per activity)

- User views an activity and taps "Analyze Run"
- Convex action sends activity data (metrics, splits, recent training context from last 7 days of activities) to Anthropic
- Response cached — only generated once per activity unless user requests re-analysis

### AI Analyses Table

| Field | Type | Notes |
|-------|------|-------|
| `userId` | Id<"users"> | indexed |
| `activityId` | Id<"activities"> | indexed, nullable |
| `type` | string | "run_summary" / "progress_overview" / "training_plan" |
| `content` | string | markdown formatted AI response |
| `model` | string | track which Claude model was used |
| `createdAt` | number (timestamp) | |

### Training Progress Overview (on-demand)

- User taps "Analyze Progress" on the dashboard
- Convex action gathers last 30-90 days of activities, computes aggregates (weekly mileage, avg pace trends, rest day patterns, intensity distribution)
- Sends structured summary to Anthropic with a coaching-focused system prompt

### Training Plan Creation (conversational)

- User requests a plan via the chatbox (e.g., "Build me a 12-week half marathon plan")
- AI uses full activity history as context to assess current fitness

### Training Plans Table

| Field | Type | Notes |
|-------|------|-------|
| `userId` | Id<"users"> | indexed |
| `goal` | string | |
| `startDate` | number (timestamp) | |
| `endDate` | number (timestamp) | |
| `weeks` | array | week objects with daily workouts, each workout has `description`, `type`, `completed` (boolean) |
| `status` | string | "active" / "completed" / "abandoned" |
| `createdAt` | number (timestamp) | |

### System Prompt Strategy

A base coaching persona prompt is shared across all modes. It includes instructions to be encouraging but honest, reference specific data points, and give actionable advice. Each mode appends context-specific data (single run vs. trend data vs. full history).

**Cost control:** All AI calls are user-triggered (button taps or chat messages). No background AI processing.

---

## 4. Chat System

Persistent, single-thread conversation per user. No thread splitting — users scroll back through one continuous coaching conversation.

### Chat Messages Table

| Field | Type | Notes |
|-------|------|-------|
| `userId` | Id<"users"> | indexed |
| `role` | string | "user" / "assistant" |
| `content` | string | markdown |
| `createdAt` | number (timestamp) | indexed for ordering |

### How It Works

1. User sends a message -> mutation inserts it into `chatMessages`
2. A Convex action fires: gathers the last 50 messages for conversation context, pulls a summary of the user's recent activity data (last 30 days aggregated stats, most recent 5 activities), and calls Anthropic
3. AI response stored as a single assistant message once complete (no token-level streaming in v1)
4. Frontend subscribes to `chatMessages` query — new message appears reactively via Convex subscription. A typing indicator is shown while the action is in flight.

### Context Injection

Every AI call includes a structured preamble the user doesn't see:
- User's recent stats (weekly mileage, avg pace, total runs)
- Latest activity summary
- Active training plan (if any)

This gives the AI "memory" of the user's running without stuffing the full history into every call.

**Message limits:** Only the last 50 messages sent as conversation history. Older messages are still visible in the UI (paginated scroll) but not included in AI context.

---

## 5. UI/UX Design System

### Color Palette

| Token | Value | Usage |
|-------|-------|-------|
| Background | `#0A0A0A` | Page background |
| Surface | `#1A1A2A` | Cards, panels |
| Primary | `#C8FC03` | CTAs, active states, highlights |
| Text primary | `#FFFFFF` | Headings, body |
| Text secondary | `#9CA3AF` | Muted labels |
| Error | `#EF4444` | Error states |
| Success | `#22C55E` | Success states |

### Typography

- Headings: Geist Sans, bold/semibold
- Body: Geist Sans, regular
- Monospace data (pace, distance): Geist Mono

### Component Patterns

- **Cards:** `rounded-2xl`, dark surface, subtle border (`border-white/5`), no heavy shadows
- **Buttons:** Primary — lime green bg with black text. Secondary — ghost/outline
- **Bottom tab bar (mobile):** 5 tabs — Dashboard, Activities, Chat, Plan, Profile
- **Sidebar (desktop):** Same 5 sections as vertical nav, collapsible
- **Activity cards:** Distance, pace, time, date — compact on mobile, expanded on desktop

### Screens

1. **Dashboard** — Greeting, latest run card, weekly mileage summary, AI insight card (if generated), quick action buttons (Sync, Analyze Progress)
2. **Activities** — Scrollable list of activity cards sorted by date, tap to view detail
3. **Activity Detail** — Full stats, splits table, map (polyline rendered), "Analyze Run" button, AI analysis card if available
4. **Chat** — Full-screen conversation, input pinned to bottom
5. **Training Plan** — Current active plan with week-by-week view, daily workouts, progress tracking
6. **Profile/Settings** — Strava connection status, sync button, account info

### Desktop Adaptation

- Sidebar nav replaces bottom tabs
- Dashboard gets multi-column grid (2-3 columns)
- Activity detail uses wider layout with stats and map side by side
- Content max-width capped (~1280px) centered on large screens

---

## 6. API Routes & Security

### Next.js API Routes (OAuth only)

- **`/api/strava/auth`** — Redirects user to Strava's OAuth authorization page with scopes `read,activity:read_all`
- **`/api/strava/callback`** — Exchanges code for tokens, stores in Convex, redirects to dashboard

### Security

- All Convex queries/mutations use `ctx.auth` to verify the Clerk JWT — no anonymous access
- All queries filter by `userId` — users can only see their own data
- Strava tokens never sent to the client — all Strava API calls happen server-side in Convex actions
- Anthropic API key lives as a Convex environment variable — never exposed to client
- Rate limiting on AI calls: max 20 AI calls per user per day. Tracked by counting `aiAnalyses` rows + `chatMessages` with role "assistant" created today for the user. Checked in the Convex action before calling Anthropic.

### Environment Variables

| Variable | Location | Visibility |
|----------|----------|------------|
| Clerk keys | Next.js env | public + secret |
| Convex URL | Next.js env | public |
| Strava client ID/secret | Convex env | server-only |
| Anthropic API key | Convex env | server-only |
| Strava redirect URI | Next.js env | server-only (env-dependent: localhost vs prod) |
| Strava tokens | Per-user in Convex DB | server-only |

---

## 7. Error Handling & Edge Cases

### Strava Sync Failures
- Page fetch fails mid-sync: `syncStatus` records the error and last successful page. Retry resumes from where it left off using `startDate` of the last synced activity.
- Token refresh failure: mark Strava as disconnected, prompt user to re-authorize.

### AI Call Failures
- Anthropic API errors: show toast "AI is temporarily unavailable, try again." No retry loops.
- Insufficient activity data: AI prompt includes instructions to acknowledge this honestly.

### Sync Edge Cases
- Duplicate prevention via `stravaId` index — skip existing activities
- Non-run activities: stored but filtered to runs by default in UI
- Deleted activities on Strava: not handled in v1 — data persists in our DB

### Chat Edge Cases
- Empty activity history: AI acknowledges and encourages syncing or running
- Long messages: truncate user input at 2000 characters client-side

### Auth Edge Cases
- Clerk session expires: Convex rejects queries, frontend redirects to login
- Account deletion: a Convex action queries and deletes from all related tables: `activities`, `syncStatus`, `aiAnalyses`, `trainingPlans`, `chatMessages`, then deletes the `users` row. Convex has no built-in cascade — this is manual.

---

## 8. Build Priority

1. Auth (Clerk + Google login)
2. Strava sync (full + incremental)
3. Dashboard with run history
4. AI run analysis (summaries + suggestions)
5. AI training progress overview
6. AI training plan creation
7. AI chatbox
8. Mobile-responsive design
9. Desktop sidebar layout
