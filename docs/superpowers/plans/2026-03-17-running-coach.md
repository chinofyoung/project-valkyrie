# Running Coach Web App Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a multi-user AI-powered running coach web app that syncs Strava data, provides AI coaching insights, and offers a conversational AI interface.

**Architecture:** Convex-centric backend with Next.js 16 App Router frontend. Clerk handles auth (Google OAuth), Convex handles all data and server logic (queries, mutations, actions). Only exception: Next.js API routes for Strava OAuth redirect flow. Dark UI with neon lime accent, mobile-first with desktop sidebar.

**Tech Stack:** Next.js 16, Tailwind CSS v4, Convex, Clerk, Anthropic Claude API, Strava API

**Spec:** `docs/superpowers/specs/2026-03-17-running-coach-design.md`

**Clerk guide:** `plan/clerk.md`

---

## File Structure

```
project-valkyrie/
├── app/
│   ├── layout.tsx                    # Root layout: ClerkProvider + ConvexProvider + fonts
│   ├── globals.css                   # Tailwind v4 + design system CSS variables
│   ├── page.tsx                      # Redirect to /dashboard or /sign-in
│   ├── sign-in/[[...sign-in]]/
│   │   └── page.tsx                  # Clerk sign-in page
│   ├── sign-up/[[...sign-up]]/
│   │   └── page.tsx                  # Clerk sign-up page
│   ├── (app)/                        # Authenticated app layout group
│   │   ├── layout.tsx                # App shell: sidebar (desktop) + bottom tabs (mobile)
│   │   ├── dashboard/
│   │   │   └── page.tsx              # Dashboard screen
│   │   ├── activities/
│   │   │   ├── page.tsx              # Activity list screen
│   │   │   └── [id]/
│   │   │       └── page.tsx          # Activity detail screen
│   │   ├── chat/
│   │   │   └── page.tsx              # AI chat screen
│   │   ├── plan/
│   │   │   └── page.tsx              # Training plan screen
│   │   └── profile/
│   │       └── page.tsx              # Profile/settings screen
│   └── api/
│       └── strava/
│           ├── auth/
│           │   └── route.ts          # Strava OAuth initiation
│           └── callback/
│               └── route.ts          # Strava OAuth callback
├── components/
│   ├── providers.tsx                 # ConvexProviderWithClerk wrapper (client component)
│   ├── sidebar.tsx                   # Desktop sidebar navigation
│   ├── bottom-tabs.tsx               # Mobile bottom tab bar
│   ├── activity-card.tsx             # Activity list item component
│   ├── stat-card.tsx                 # Stat display component (value + label)
│   ├── weekly-chart.tsx              # Weekly mileage bar chart
│   ├── ai-insight-card.tsx           # AI insight display card
│   ├── sync-button.tsx               # Strava sync button with progress
│   ├── chat-message.tsx              # Chat bubble component
│   └── chat-input.tsx                # Chat input bar component
├── convex/
│   ├── schema.ts                     # Convex schema: all tables + indexes
│   ├── auth.config.ts                # Convex auth config for Clerk
│   ├── users.ts                      # User queries/mutations
│   ├── activities.ts                 # Activity queries/mutations
│   ├── strava.ts                     # Strava sync actions (fetch, token refresh)
│   ├── syncStatus.ts                 # Sync status queries/mutations
│   ├── ai.ts                         # AI analysis actions (run analysis, progress)
│   ├── aiAnalyses.ts                 # AI analyses queries/mutations
│   ├── chat.ts                       # Chat actions (send message, get AI response)
│   ├── chatMessages.ts               # Chat message queries/mutations
│   ├── trainingPlans.ts              # Training plan queries/mutations
│   └── _generated/                   # Convex auto-generated files
├── lib/
│   ├── utils.ts                      # Shared utilities (pace conversion, date formatting)
│   └── prompts.ts                    # AI system prompts (base coaching persona, per-mode)
├── middleware.ts                      # Clerk middleware (was proxy.ts per clerk docs)
└── .env.local                        # Environment variables (already exists)
```

---

## Task 1: Install Dependencies & Configure Convex + Clerk

**Files:**
- Modify: `package.json`
- Create: `convex/schema.ts`
- Create: `convex/auth.config.ts`
- Create: `middleware.ts`
- Create: `components/providers.tsx`
- Modify: `app/layout.tsx`
- Modify: `app/globals.css`
- Modify: `app/page.tsx`
- Create: `app/sign-in/[[...sign-in]]/page.tsx`
- Create: `app/sign-up/[[...sign-up]]/page.tsx`

- [ ] **Step 1: Install Clerk, Convex, and Anthropic SDK**

```bash
npm install @clerk/nextjs convex @anthropic-ai/sdk
```

- [ ] **Step 2: Initialize Convex**

```bash
npx convex init
```

This creates the `convex/` directory with `_generated/` files and updates `package.json` with Convex scripts.

- [ ] **Step 3: Create Convex schema with all tables and indexes**

Create `convex/schema.ts`:

```typescript
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
});
```

- [ ] **Step 4: Create Clerk middleware**

Create `middleware.ts` at the project root:

```typescript
import { clerkMiddleware } from "@clerk/nextjs/server";

export default clerkMiddleware();

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
```

- [ ] **Step 5: Create Convex auth config**

Create `convex/auth.config.ts`:

```typescript
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN,
      applicationID: "convex",
    },
  ],
};
```

- [ ] **Step 6: Create ConvexProviderWithClerk wrapper**

Create `components/providers.tsx`:

```typescript
"use client";

import { ClerkProvider, useAuth } from "@clerk/nextjs";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { ConvexReactClient } from "convex/react";
import { ReactNode } from "react";

const convex = new ConvexReactClient(
  process.env.NEXT_PUBLIC_CONVEX_URL as string
);

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ClerkProvider>
      <ConvexProviderWithClerk client={convex} useAuth={useAuth}>
        {children}
      </ConvexProviderWithClerk>
    </ClerkProvider>
  );
}
```

- [ ] **Step 7: Update globals.css with design system**

Replace `app/globals.css` with the dark theme design system:

```css
@import "tailwindcss";

:root {
  --background: #0A0A0A;
  --surface: #1A1A2A;
  --surface-hover: #222236;
  --primary: #C8FC03;
  --text-primary: #FFFFFF;
  --text-secondary: #9CA3AF;
  --error: #EF4444;
  --success: #22C55E;
  --border: rgba(255, 255, 255, 0.05);
  --radius: 16px;
}

@theme inline {
  --color-background: var(--background);
  --color-surface: var(--surface);
  --color-surface-hover: var(--surface-hover);
  --color-primary: var(--primary);
  --color-text-primary: var(--text-primary);
  --color-text-secondary: var(--text-secondary);
  --color-error: var(--error);
  --color-success: var(--success);
  --color-border: var(--border);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

body {
  background: var(--background);
  color: var(--text-primary);
  font-family: var(--font-geist-sans), Arial, Helvetica, sans-serif;
}
```

- [ ] **Step 8: Update root layout with providers**

Replace `app/layout.tsx`:

```typescript
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "RunCoach",
  description: "AI-powered running coach",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 9: Create sign-in and sign-up pages**

Create `app/sign-in/[[...sign-in]]/page.tsx`:

```typescript
import { SignIn } from "@clerk/nextjs";

export default function SignInPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <SignIn
        appearance={{
          elements: {
            rootBox: "mx-auto",
            card: "bg-surface border border-border",
          },
        }}
      />
    </div>
  );
}
```

Create `app/sign-up/[[...sign-up]]/page.tsx`:

```typescript
import { SignUp } from "@clerk/nextjs";

export default function SignUpPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <SignUp
        appearance={{
          elements: {
            rootBox: "mx-auto",
            card: "bg-surface border border-border",
          },
        }}
      />
    </div>
  );
}
```

- [ ] **Step 10: Create root page with auth redirect**

Replace `app/page.tsx`:

```typescript
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function Home() {
  const { userId } = await auth();
  if (userId) {
    redirect("/dashboard");
  }
  redirect("/sign-in");
}
```

- [ ] **Step 11: Create Convex users mutation for syncing Clerk user**

Create `convex/users.ts`:

```typescript
import { mutation, query } from "./_generated/server";
import { v } from "convex/values";

export const syncUser = mutation({
  args: {
    clerkId: v.string(),
    email: v.string(),
    name: v.string(),
    avatarUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, {
        email: args.email,
        name: args.name,
        avatarUrl: args.avatarUrl,
      });
      return existing._id;
    }

    return await ctx.db.insert("users", {
      clerkId: args.clerkId,
      email: args.email,
      name: args.name,
      avatarUrl: args.avatarUrl,
      stravaConnected: false,
      createdAt: Date.now(),
    });
  },
});

export const currentUser = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    return await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) =>
        q.eq("clerkId", identity.subject)
      )
      .unique();
  },
});
```

- [ ] **Step 12: Add env variables to `.env.local`**

Append the following to `.env.local` (Clerk keys come from keyless mode or dashboard):

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=<from clerk dashboard>
CLERK_SECRET_KEY=<from clerk dashboard>
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CONVEX_URL=<from npx convex init>
CLERK_JWT_ISSUER_DOMAIN=<from clerk dashboard>
```

Add Convex env vars via CLI:

```bash
npx convex env set STRAVA_CLIENT_ID <value from .env.local>
npx convex env set STRAVA_CLIENT_SECRET <value from .env.local>
npx convex env set ANTHROPIC_API_KEY <value from .env.local>
```

- [ ] **Step 13: Run dev servers and verify auth flow**

```bash
npx convex dev &
npm run dev
```

Verify: visit http://localhost:3000, should redirect to sign-in. Sign in with Google, should redirect to /dashboard (404 is expected at this point — auth flow is what matters).

- [ ] **Step 14: Commit**

```bash
git add -A
git commit -m "feat: configure Clerk auth, Convex backend, and design system"
```

---

## Task 2: App Shell — Sidebar, Bottom Tabs, Authenticated Layout

**Files:**
- Create: `app/(app)/layout.tsx`
- Create: `components/sidebar.tsx`
- Create: `components/bottom-tabs.tsx`
- Create: `app/(app)/dashboard/page.tsx` (placeholder)
- Create: `app/(app)/activities/page.tsx` (placeholder)
- Create: `app/(app)/chat/page.tsx` (placeholder)
- Create: `app/(app)/plan/page.tsx` (placeholder)
- Create: `app/(app)/profile/page.tsx` (placeholder)

- [ ] **Step 1: Create sidebar component**

Create `components/sidebar.tsx` — desktop sidebar with 5 nav items (Dashboard, Activities, Chat, Plan, Profile) + settings. Uses `usePathname()` for active state. Lime green active indicator. Collapsible design. Logo with green dot at top.

Reference the mockup at `.superpowers/mockups/dashboard-mockup.html` for exact styling (the `.sidebar`, `.sidebar-item`, `.sidebar-logo` CSS classes).

- [ ] **Step 2: Create bottom tabs component**

Create `components/bottom-tabs.tsx` — mobile bottom tab bar with same 5 tabs. Fixed to bottom, dark glass-blur background. Active tab uses lime green fill. SVG icons matching the sidebar.

Reference the mockup `.tab-bar` and `.tab` CSS classes.

- [ ] **Step 3: Create authenticated app layout**

Create `app/(app)/layout.tsx`:

```typescript
"use client";

import { useUser } from "@clerk/nextjs";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useEffect } from "react";
import { Sidebar } from "@/components/sidebar";
import { BottomTabs } from "@/components/bottom-tabs";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, isLoaded } = useUser();
  const syncUser = useMutation(api.users.syncUser);

  useEffect(() => {
    if (isLoaded && user) {
      syncUser({
        clerkId: user.id,
        email: user.primaryEmailAddress?.emailAddress ?? "",
        name: user.fullName ?? user.firstName ?? "Runner",
        avatarUrl: user.imageUrl,
      });
    }
  }, [isLoaded, user, syncUser]);

  if (!isLoaded) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-text-secondary">Loading...</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar — hidden on mobile */}
      <div className="hidden md:block">
        <Sidebar />
      </div>

      {/* Main content */}
      <main className="flex-1 pb-20 md:pb-0 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-4 md:px-8 py-6">
          {children}
        </div>
      </main>

      {/* Mobile bottom tabs — hidden on desktop */}
      <div className="md:hidden">
        <BottomTabs />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create placeholder pages for all 5 screens**

Create each page with a simple heading so navigation works:

- `app/(app)/dashboard/page.tsx` — "Dashboard" heading
- `app/(app)/activities/page.tsx` — "Activities" heading
- `app/(app)/chat/page.tsx` — "Chat" heading
- `app/(app)/plan/page.tsx` — "Training Plan" heading
- `app/(app)/profile/page.tsx` — "Profile" heading

Each should be a simple component like:

```typescript
export default function DashboardPage() {
  return <h1 className="text-2xl font-bold">Dashboard</h1>;
}
```

- [ ] **Step 5: Verify navigation works**

Run the dev servers, sign in, navigate between all 5 tabs. Verify:
- Desktop: sidebar shows with active state highlighting
- Mobile (resize browser): bottom tabs show, sidebar hides
- All routes load their placeholder content

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add app shell with sidebar, bottom tabs, and route placeholders"
```

---

## Task 3: Strava OAuth & Token Storage

**Files:**
- Create: `app/api/strava/auth/route.ts`
- Create: `app/api/strava/callback/route.ts`
- Modify: `convex/users.ts` (add `connectStrava` mutation)
- Modify: `app/(app)/profile/page.tsx` (add Connect Strava button)

- [ ] **Step 1: Create Strava OAuth initiation route**

Create `app/api/strava/auth/route.ts`:

- Generate random `state` string (crypto.randomUUID)
- Store `state` in HTTP-only cookie with 10-minute expiry
- Redirect to `https://www.strava.com/oauth/authorize` with params:
  - `client_id` from env
  - `redirect_uri` from env (`STRAVA_REDIRECT_URI`)
  - `response_type=code`
  - `scope=read,activity:read_all`
  - `state` parameter
- Require Clerk auth via `auth()` — reject unauthenticated requests

- [ ] **Step 2: Create Strava OAuth callback route**

Create `app/api/strava/callback/route.ts`:

- Validate `state` parameter against cookie — reject if mismatch
- Exchange `code` for tokens via POST to `https://www.strava.com/oauth/token`
- Call Convex mutation `users.connectStrava` with tokens (accessToken, refreshToken, expiresAt)
- Clear state cookie
- Redirect to `/profile` with success

- [ ] **Step 3: Add `connectStrava` mutation to users.ts**

Add to `convex/users.ts`:

```typescript
export const connectStrava = mutation({
  args: {
    clerkId: v.string(),
    accessToken: v.string(),
    refreshToken: v.string(),
    expiresAt: v.number(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", args.clerkId))
      .unique();

    if (!user) throw new Error("User not found");

    await ctx.db.patch(user._id, {
      stravaConnected: true,
      stravaTokens: {
        accessToken: args.accessToken,
        refreshToken: args.refreshToken,
        expiresAt: args.expiresAt,
      },
    });
  },
});
```

- [ ] **Step 4: Build Profile page with Connect Strava button**

Update `app/(app)/profile/page.tsx`:

- Show user info (name, email, avatar from Clerk)
- Show Strava connection status (from Convex `currentUser` query)
- If not connected: show "Connect Strava" button that navigates to `/api/strava/auth`
- If connected: show green "Strava Connected" badge
- Add UserButton from Clerk for account management

- [ ] **Step 5: Add env variables**

Add to `.env.local`:

```
STRAVA_REDIRECT_URI=http://localhost:3000/api/strava/callback
```

- [ ] **Step 6: Test the full Strava OAuth flow**

1. Go to Profile page
2. Click "Connect Strava"
3. Authorize on Strava
4. Should redirect back to Profile with "Strava Connected" badge
5. Check Convex dashboard — user row should have `stravaConnected: true` and tokens

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add Strava OAuth flow with CSRF protection and token storage"
```

---

## Task 4: Strava Sync — Full & Incremental

**Files:**
- Create: `convex/strava.ts`
- Create: `convex/syncStatus.ts`
- Create: `convex/activities.ts`
- Create: `components/sync-button.tsx`
- Modify: `app/(app)/profile/page.tsx` (add sync button)

- [ ] **Step 1: Create syncStatus queries/mutations**

Create `convex/syncStatus.ts`:

- `getSyncStatus` query: returns sync status for the current user (filter by userId, use `by_userId` index)
- `upsertSyncStatus` mutation: creates or updates the sync status row for a user
- Both require authentication via `ctx.auth`

- [ ] **Step 2: Create activities queries/mutations**

Create `convex/activities.ts`:

- `list` query: paginated list of activities for current user, sorted by `startDate` desc (use `by_userId_startDate` index, `.order("desc")`)
- `getById` query: single activity by ID (verify ownership)
- `batchInsert` internal mutation: insert array of activity objects, skip duplicates by checking `by_userId_stravaId` index before each insert

- [ ] **Step 3: Create Strava sync action with self-scheduling**

Create `convex/strava.ts`:

- `refreshTokenIfNeeded` internal action: checks `expiresAt`, refreshes via Strava API if expired, updates user record
- `startSync` action (user-facing):
  - Verify auth, get user
  - Check syncStatus — reject if already "syncing"
  - Set syncStatus to "syncing"
  - Call `fetchActivitiesPage` with page 1
- `fetchActivitiesPage` internal action:
  - Refresh token if needed
  - Fetch one page of 200 activities from `https://www.strava.com/api/v3/athlete/activities` with `per_page=200&page=N` and optional `after` param for incremental sync
  - Call `activities.batchInsert` mutation with the fetched activities (map Strava fields to our schema)
  - Update syncStatus progress (syncedActivities += page count)
  - If page returned 200 activities (full page = more to fetch): `ctx.scheduler.runAfter(0, internal.strava.fetchActivitiesPage, { ...nextPageArgs })`
  - If page returned < 200: sync complete, update syncStatus to "completed", update user's `lastSyncAt`

- [ ] **Step 4: Create sync button component**

Create `components/sync-button.tsx`:

- Uses `useQuery(api.syncStatus.getSyncStatus)` for real-time status
- Uses `useMutation(api.strava.startSync)` to trigger sync
- Shows progress bar when syncing (syncedActivities / totalActivities)
- Disabled when already syncing
- Shows last sync time when idle
- Error state with retry

- [ ] **Step 5: Add sync button to Profile page**

Update `app/(app)/profile/page.tsx` — add the SyncButton below the Strava connection status. Only show when Strava is connected.

- [ ] **Step 6: Test sync flow**

1. Connect Strava (from Task 3)
2. Click "Sync Strava" on Profile
3. Watch progress bar update in real-time
4. After completion, check Convex dashboard for activities
5. Click sync again — should only fetch new activities (incremental)

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add Strava sync with self-scheduling pagination and progress tracking"
```

---

## Task 5: Dashboard with Run History

**Files:**
- Modify: `app/(app)/dashboard/page.tsx`
- Create: `components/activity-card.tsx`
- Create: `components/stat-card.tsx`
- Create: `components/weekly-chart.tsx`
- Create: `lib/utils.ts`

- [ ] **Step 1: Create utility functions**

Create `lib/utils.ts`:

```typescript
/** Convert m/s to min/km pace string like "5:24" */
export function speedToPace(metersPerSecond: number): string {
  if (metersPerSecond <= 0) return "--:--";
  const minPerKm = 1000 / metersPerSecond / 60;
  const mins = Math.floor(minPerKm);
  const secs = Math.round((minPerKm - mins) * 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/** Format meters to km with 1 decimal */
export function metersToKm(meters: number): string {
  return (meters / 1000).toFixed(1);
}

/** Format seconds to "MM:SS" or "H:MM:SS" */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Format timestamp to relative date like "Today", "Yesterday", or "Mon, Mar 15" */
export function formatRelativeDate(timestamp: number): string {
  const now = new Date();
  const date = new Date(timestamp);
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
```

- [ ] **Step 2: Create activity card component**

Create `components/activity-card.tsx`:

- Displays: activity name, date, distance (km), pace (min/km), duration, optional heart rate
- Compact card on mobile, expanded with more stats on desktop
- Uses `speedToPace`, `metersToKm`, `formatDuration` from utils
- Clickable — navigates to `/activities/[id]`
- Styled per design system: dark surface, rounded-2xl, subtle border

- [ ] **Step 3: Create stat card component**

Create `components/stat-card.tsx`:

- Reusable component: value (large monospace), label (small uppercase muted)
- Used in dashboard summary and activity detail

- [ ] **Step 4: Create weekly bar chart component**

Create `components/weekly-chart.tsx`:

- Takes activities for the current week
- Shows 7 bars (M-S), filled bars for days with runs
- Bar height proportional to distance
- Shows total weekly mileage in header
- Uses the neon lime green for filled bars, dim version for rest days

- [ ] **Step 5: Build the dashboard page**

Update `app/(app)/dashboard/page.tsx`:

- Greeting header with user name (from Clerk) + avatar
- Quick action buttons: "Sync Strava" and "Analyze Progress" (analyze is disabled until Task 7)
- Latest run card: large card with run name, date, 3 stat boxes (distance, pace, time)
- Weekly mileage chart component
- Recent activities list (last 5, with "See All" link to /activities)
- Uses `useQuery(api.activities.list)` for data
- Shows empty state if no activities synced yet — prompt to sync Strava

Reference the mockup HTML for layout and styling details.

- [ ] **Step 6: Verify dashboard**

Run dev servers, sign in, sync some Strava data, go to dashboard:
- Greeting shows correct name
- Latest run shows most recent activity
- Weekly chart shows this week's runs
- Recent activities list renders correctly
- Clicking an activity card navigates to /activities/[id] (404 expected until Task 6)

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: build dashboard with run history, weekly chart, and activity cards"
```

---

## Task 6: Activities List & Activity Detail Pages

**Files:**
- Modify: `app/(app)/activities/page.tsx`
- Create: `app/(app)/activities/[id]/page.tsx`

- [ ] **Step 1: Build activities list page**

Update `app/(app)/activities/page.tsx`:

- Full scrollable list of activity cards, sorted by date desc
- Uses `useQuery(api.activities.list)` with pagination
- Each card is the ActivityCard component from Task 5
- "Load more" button or infinite scroll for pagination
- Filter: show only runs by default (type "Run" or "TrailRun")
- Empty state if no activities

- [ ] **Step 2: Build activity detail page**

Create `app/(app)/activities/[id]/page.tsx`:

- Full stats grid: distance, pace, time, elevation, heart rate, cadence, calories
- Splits table if available (split number, distance, pace, elevation, HR)
- Map placeholder (polyline rendering can be added later — for now show a dark card with "Map coming soon" if polyline exists)
- "Analyze Run" button (disabled until Task 7, but wire up the UI)
- AI analysis card (empty state until Task 7)
- Back button to /activities

Use `useQuery(api.activities.getById)` with the route param ID.

- [ ] **Step 3: Verify**

- Navigate to /activities — see full list
- Click an activity — see detail page with all stats
- Back button works
- Mobile and desktop layouts look correct

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add activities list and activity detail pages"
```

---

## Task 7: AI Run Analysis & Progress Overview

**Files:**
- Create: `lib/prompts.ts`
- Create: `convex/ai.ts`
- Create: `convex/aiAnalyses.ts`
- Create: `components/ai-insight-card.tsx`
- Modify: `app/(app)/activities/[id]/page.tsx` (wire up "Analyze Run")
- Modify: `app/(app)/dashboard/page.tsx` (wire up "Analyze Progress")

- [ ] **Step 1: Create AI system prompts**

Create `lib/prompts.ts`:

- `BASE_COACHING_PROMPT`: System prompt establishing the AI as a running coach — encouraging but honest, data-driven, references specific numbers, gives actionable advice
- `RUN_ANALYSIS_PROMPT`: Extends base prompt with instructions for analyzing a single run (compare to recent training, identify strengths/areas to improve, suggest next steps)
- `PROGRESS_OVERVIEW_PROMPT`: Extends base prompt with instructions for analyzing training trends (weekly mileage progression, pace trends, rest patterns, injury risk indicators)

Note: These prompts are used server-side in Convex actions. Export them as strings.

- [ ] **Step 2: Create aiAnalyses queries**

Create `convex/aiAnalyses.ts`:

- `getForActivity` query: get analysis for a specific activity (use `by_userId_activityId` index)
- `getLatestInsight` query: get the most recent analysis for the user (any type) for dashboard display

- [ ] **Step 3: Create AI analysis actions**

Create `convex/ai.ts`:

- `checkRateLimit` internal helper: count today's AI calls for user (aiAnalyses created today + chatMessages with role "assistant" created today). Return boolean.
- `analyzeRun` action:
  - Verify auth, check rate limit
  - Get the activity and last 7 days of activities for context
  - Build prompt with RUN_ANALYSIS_PROMPT + activity data + recent context
  - Call Anthropic API (claude-sonnet-4-6 for cost efficiency)
  - Store result in `aiAnalyses` table with type "run_summary"
- `analyzeProgress` action:
  - Verify auth, check rate limit
  - Get last 90 days of activities
  - Compute aggregates: weekly mileage, avg pace per week, run count, rest days, longest run
  - Build prompt with PROGRESS_OVERVIEW_PROMPT + aggregated data
  - Call Anthropic API
  - Store result in `aiAnalyses` table with type "progress_overview"

Both actions use the Anthropic SDK with the API key from `process.env.ANTHROPIC_API_KEY` (Convex env var).

- [ ] **Step 4: Create AI insight card component**

Create `components/ai-insight-card.tsx`:

- Displays AI analysis with green accent border and "AI Coach" badge
- Renders markdown content (use a simple markdown-to-JSX approach or just render as paragraphs)
- Shows loading state while analysis is in flight
- Shows "Analyze" button if no analysis exists yet

- [ ] **Step 5: Wire up "Analyze Run" on activity detail**

Modify `app/(app)/activities/[id]/page.tsx`:

- Add `useQuery(api.aiAnalyses.getForActivity)` to check for existing analysis
- "Analyze Run" button calls `useMutation(api.ai.analyzeRun)`
- Show AI insight card with the analysis when it exists
- Show loading spinner while action is running

- [ ] **Step 6: Wire up "Analyze Progress" on dashboard**

Modify `app/(app)/dashboard/page.tsx`:

- "Analyze Progress" button calls `useMutation(api.ai.analyzeProgress)`
- Show latest AI insight card on dashboard (from `aiAnalyses.getLatestInsight`)
- Disable button while analysis is in progress

- [ ] **Step 7: Test AI features**

1. Go to an activity detail → click "Analyze Run" → see AI analysis appear
2. Go to dashboard → click "Analyze Progress" → see insight card appear
3. Try hitting rate limit (make 20+ calls) → should see rate limit error

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: add AI run analysis and training progress overview"
```

---

## Task 8: AI Chat System

**Files:**
- Create: `convex/chatMessages.ts`
- Create: `convex/chat.ts`
- Create: `components/chat-message.tsx`
- Create: `components/chat-input.tsx`
- Modify: `app/(app)/chat/page.tsx`

- [ ] **Step 1: Create chatMessages queries/mutations**

Create `convex/chatMessages.ts`:

- `list` query: get messages for current user ordered by `createdAt` asc (use `by_userId_createdAt` index). Paginated — load last 50 for display, support loading more.
- `insert` mutation: insert a new chat message (validate userId matches auth, truncate content to 2000 chars for user messages)
- `isAiResponding` query: check if the most recent message is from "user" (indicating AI hasn't responded yet) — used for typing indicator

- [ ] **Step 2: Create chat action**

Create `convex/chat.ts`:

- `sendMessage` action:
  - Verify auth, check rate limit
  - Insert user message via `chatMessages.insert`
  - Gather context: last 50 messages, user's recent stats (last 30 days aggregated), most recent 5 activities, active training plan
  - Build messages array for Anthropic: system prompt (BASE_COACHING_PROMPT + injected context) + conversation history
  - Call Anthropic API
  - Insert assistant message via `chatMessages.insert`

The context injection preamble (added to system prompt) should include:
- Weekly mileage for last 4 weeks
- Average pace trend
- Total runs in last 30 days
- Last 5 activity summaries (name, distance, pace, date)
- Active training plan goal and current week (if any)

- [ ] **Step 3: Create chat message component**

Create `components/chat-message.tsx`:

- User messages: lime green background, black text, aligned right, rounded with bottom-right corner squared
- Assistant messages: dark surface background, white text, lime accent left border, aligned left, rounded with bottom-left corner squared
- Render markdown in assistant messages (bold, lists, line breaks)
- Show relative timestamp below each message

- [ ] **Step 4: Create chat input component**

Create `components/chat-input.tsx`:

- Input bar fixed to bottom (above bottom tabs on mobile)
- Dark surface input field with rounded-full shape
- Lime green send button (circular)
- Disabled while AI is responding (typing indicator shown instead)
- Max 2000 character limit with character count indicator near limit

- [ ] **Step 5: Build the chat page**

Update `app/(app)/chat/page.tsx`:

- Header: "AI Coach" title with "Online" status badge
- Messages area: scrollable, auto-scrolls to bottom on new messages
- Uses `useQuery(api.chatMessages.list)` for reactive message list
- Uses `useMutation(api.chat.sendMessage)` for sending
- Typing indicator (3 animated dots) shown when `isAiResponding` is true
- Empty state: welcome message encouraging the user to ask about their training
- "Load older messages" button at top for pagination

- [ ] **Step 6: Test chat**

1. Go to Chat tab
2. Send a message like "How should I adjust my training this week?"
3. See typing indicator while AI processes
4. See AI response appear with running context
5. Verify conversation persists (navigate away and back)
6. Test rate limiting

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add AI chat system with persistent conversation and context injection"
```

---

## Task 9: Training Plan Feature

**Files:**
- Create: `convex/trainingPlans.ts`
- Modify: `convex/chat.ts` (detect training plan requests in chat)
- Modify: `app/(app)/plan/page.tsx`

- [ ] **Step 1: Create trainingPlans queries/mutations**

Create `convex/trainingPlans.ts`:

- `getActive` query: get the active training plan for current user (use `by_userId_status` index with status "active"). Return null if none.
- `create` mutation: insert a new training plan, mark any existing active plan as "abandoned" first
- `toggleWorkout` mutation: toggle the `completed` boolean on a specific workout (by week number + workout index)
- `updateStatus` mutation: mark plan as "completed" or "abandoned"

- [ ] **Step 2: Extend chat to detect and create training plans**

Modify `convex/chat.ts`:

- After getting the AI response in `sendMessage`, check if the response contains a structured training plan (the AI prompt should instruct it to output plans in a specific JSON format when asked to create one)
- If a plan is detected: parse it and call `trainingPlans.create` mutation
- Add instructions to the system prompt: when the user asks for a training plan, include a JSON block with the plan structure (goal, startDate, endDate, weeks array)

- [ ] **Step 3: Build the training plan page**

Update `app/(app)/plan/page.tsx`:

- Uses `useQuery(api.trainingPlans.getActive)` for the current plan
- If no active plan: show empty state with prompt to ask the AI coach for a plan (link to chat)
- If active plan:
  - Header: goal, date range, overall progress percentage
  - Week-by-week accordion/expandable view
  - Each week shows daily workouts with checkbox for completion
  - Completed workouts are struck through with green check
  - Current week highlighted/expanded by default
  - "Abandon Plan" button (secondary/destructive)

- [ ] **Step 4: Test training plans**

1. Go to Chat → ask "Create me a 4-week 5K training plan"
2. AI should respond with a plan and create it in the database
3. Go to Plan tab → see the structured plan
4. Check off some workouts → verify they persist
5. Go back to Chat → AI should mention the active plan in context

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: add training plan creation via chat and plan tracking page"
```

---

## Task 10: Mobile-Responsive Polish

**Files:**
- Modify: various component and page files for responsive tweaks

- [ ] **Step 1: Audit all pages at mobile viewport (390px width)**

Check each screen at mobile sizes. Fix issues:
- Dashboard: single column, cards full-width, stat grids 3-col
- Activities list: compact cards
- Activity detail: stacked layout, stats in 2x2 grid
- Chat: full screen, input above bottom tabs
- Plan: accordion fits width
- Profile: stacked layout

- [ ] **Step 2: Fix bottom tab bar overlap**

Ensure `pb-20` (or appropriate padding-bottom) is on the main content area so content isn't hidden behind the fixed bottom tabs. Verify on all pages.

- [ ] **Step 3: Touch targets**

Ensure all interactive elements are at least 44x44px touch targets on mobile. Buttons, tab bar items, activity cards, checkboxes.

- [ ] **Step 4: Test on mobile Safari viewport**

Use Chrome DevTools device emulation for iPhone 14 Pro (390x844). Test:
- All pages scroll correctly
- No horizontal overflow
- Tab bar is visible and functional
- Chat input doesn't get covered by keyboard (use `dvh` units if needed)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: mobile-responsive polish across all screens"
```

---

## Task 11: Desktop Layout Polish

**Files:**
- Modify: various component and page files for desktop enhancements

- [ ] **Step 1: Dashboard multi-column grid**

Update dashboard for desktop (md+ breakpoint):
- 2-column grid for latest run + weekly chart side by side
- AI insight card full-width below
- Recent activities full-width with expanded row format (distance, pace, time, HR columns)
- Max-width 1280px centered

Reference the desktop section of the mockup HTML.

- [ ] **Step 2: Activity detail wide layout**

Update activity detail for desktop:
- Stats and map side by side
- Splits table gets more columns
- AI analysis card beside the stats

- [ ] **Step 3: Sidebar polish**

Ensure sidebar:
- Is 240px wide
- Sticks to left, full height
- Has proper hover states
- Active item has lime green background highlight
- Settings/Profile at bottom

- [ ] **Step 4: Verify at 1440px+ viewport**

Test all pages at a wide desktop viewport. Content should be centered and readable, not stretched too wide.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: desktop layout polish with multi-column dashboard and sidebar"
```

---

## Summary

| Task | Description | Dependencies |
|------|------------|-------------|
| 1 | Install deps, Convex schema, Clerk auth, design system | None |
| 2 | App shell: sidebar, bottom tabs, route placeholders | Task 1 |
| 3 | Strava OAuth & token storage | Task 2 |
| 4 | Strava sync (full + incremental) | Task 3 |
| 5 | Dashboard with run history | Task 4 |
| 6 | Activities list & detail pages | Task 5 |
| 7 | AI run analysis & progress overview | Task 6 |
| 8 | AI chat system | Task 7 |
| 9 | Training plan feature | Task 8 |
| 10 | Mobile-responsive polish | Task 9 |
| 11 | Desktop layout polish | Task 10 |
