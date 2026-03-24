# Training Plans Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign training plans to support drafts, explicit chat confirmation, multi-plan management, and a plan page with active/drafts/history sections.

**Architecture:** Chat-driven with confirmation flow. AI generates plans in chat → user confirms to save as draft → plan page manages drafts, active plan, and history. All plan modifications go through the AI coach in chat.

**Tech Stack:** Next.js 16 (App Router), Convex (backend/DB), TypeScript, Tailwind CSS v4, React 19

**Spec:** `docs/superpowers/specs/2026-03-24-training-plans-redesign-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `convex/schema.ts` | Modify | Add `draft` status, optional dates, new fields, `pendingPlan` on chatMessages |
| `convex/trainingPlans.ts` | Modify | Replace mutations with `createDraft`, `startPlan`, `completePlan`, `abandonPlan`, `deletePlan`, `savePlanAsDraft` |
| `convex/chatMessages.ts` | Modify | Add `pendingPlan` support to `insert`, add `clearPendingPlan` mutation |
| `convex/chat.ts` | Modify | Stop auto-creating plans, store `pendingPlan` on message instead |
| `components/chat-message.tsx` | Modify | Add `pendingPlan` prop, render plan preview card |
| `components/plan-preview-card.tsx` | Create | Reusable plan preview card for chat messages |
| `app/(app)/chat/page.tsx` | Modify | Pass `pendingPlan` to ChatMessage, handle save-as-draft |
| `app/(app)/plan/page.tsx` | Rewrite | Active plan + drafts + history sections with all actions |

---

### Task 1: Update Schema

**Files:**
- Modify: `convex/schema.ts:86-110`

- [ ] **Step 1: Add `draft` to trainingPlans status union and make dates optional**

In `convex/schema.ts`, update the `trainingPlans` table definition:

```typescript
trainingPlans: defineTable({
  userId: v.id("users"),
  goal: v.string(),
  startDate: v.optional(v.number()),
  endDate: v.optional(v.number()),
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
    v.literal("draft"),
    v.literal("active"),
    v.literal("completed"),
    v.literal("abandoned")
  ),
  startedAt: v.optional(v.number()),
  completedAt: v.optional(v.number()),
  createdAt: v.number(),
}).index("by_userId_status", ["userId", "status"]),
```

- [ ] **Step 2: Add `pendingPlan` to chatMessages table**

In the same file, update the `chatMessages` table definition to add the optional field:

```typescript
chatMessages: defineTable({
  userId: v.id("users"),
  role: v.union(v.literal("user"), v.literal("assistant")),
  content: v.string(),
  displayText: v.optional(v.string()),
  pendingPlan: v.optional(v.object({
    goal: v.string(),
    weeks: v.array(v.object({
      weekNumber: v.number(),
      workouts: v.array(v.object({
        day: v.string(),
        description: v.string(),
        type: v.string(),
        completed: v.boolean(),
      })),
    })),
  })),
  createdAt: v.number(),
}).index("by_userId_createdAt", ["userId", "createdAt"]),
```

- [ ] **Step 3: Push schema and verify**

Run: `npx convex dev` (should already be running) — check terminal for schema push success. Verify no errors about incompatible schema changes.

- [ ] **Step 4: Commit**

```bash
git add convex/schema.ts
git commit -m "feat: update schema for training plan drafts and pending plans"
```

---

### Task 2: Update chatMessages Backend

**Files:**
- Modify: `convex/chatMessages.ts:31-49` (insert mutation)
- Modify: `convex/chatMessages.ts` (add clearPendingPlan)

- [ ] **Step 1: Update `insert` mutation to accept `pendingPlan`**

In `convex/chatMessages.ts`, update the `insert` internal mutation args and handler:

```typescript
export const insert = internalMutation({
  args: {
    userId: v.id("users"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    displayText: v.optional(v.string()),
    pendingPlan: v.optional(v.object({
      goal: v.string(),
      weeks: v.array(v.object({
        weekNumber: v.number(),
        workouts: v.array(v.object({
          day: v.string(),
          description: v.string(),
          type: v.string(),
          completed: v.boolean(),
        })),
      })),
    })),
  },
  handler: async (ctx, args) => {
    const content =
      args.role === "user" ? args.content.slice(0, 2000) : args.content;

    return await ctx.db.insert("chatMessages", {
      userId: args.userId,
      role: args.role,
      content,
      ...(args.displayText ? { displayText: args.displayText } : {}),
      ...(args.pendingPlan ? { pendingPlan: args.pendingPlan } : {}),
      createdAt: Date.now(),
    });
  },
});
```

- [ ] **Step 2: Add `clearPendingPlan` internal mutation**

Add at the end of `convex/chatMessages.ts`:

```typescript
export const clearPendingPlan = internalMutation({
  args: {
    messageId: v.id("chatMessages"),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    if (!message) throw new Error("Message not found");
    await ctx.db.patch(args.messageId, { pendingPlan: undefined });
  },
});
```

- [ ] **Step 3: Verify Convex compiles**

Check the Convex dev terminal for successful compilation.

- [ ] **Step 4: Commit**

```bash
git add convex/chatMessages.ts
git commit -m "feat: add pendingPlan support to chatMessages"
```

---

### Task 3: Rewrite trainingPlans Backend

**Files:**
- Modify: `convex/trainingPlans.ts` (full rewrite of mutations)

- [ ] **Step 1: Replace the `create` internal mutation with `createDraftInternal`**

Replace the existing `create` mutation:

```typescript
export const createDraftInternal = internalMutation({
  args: {
    userId: v.id("users"),
    goal: v.string(),
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
  },
  handler: async (ctx, args) => {
    return await ctx.db.insert("trainingPlans", {
      userId: args.userId,
      goal: args.goal,
      weeks: args.weeks,
      status: "draft",
      createdAt: Date.now(),
    });
  },
});
```

- [ ] **Step 2: Add `startPlan` public mutation**

```typescript
export const startPlan = mutation({
  args: {
    planId: v.id("trainingPlans"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) throw new Error("User not found");

    const plan = await ctx.db.get(args.planId);
    if (!plan) throw new Error("Plan not found");
    if (plan.userId !== user._id) throw new Error("Unauthorized");
    if (plan.status !== "draft") throw new Error("Only draft plans can be started");

    // Abandon any currently active plan
    const existingActive = await ctx.db
      .query("trainingPlans")
      .withIndex("by_userId_status", (q) =>
        q.eq("userId", user._id).eq("status", "active")
      )
      .first();

    if (existingActive) {
      await ctx.db.patch(existingActive._id, { status: "abandoned" });
    }

    // Calculate dates: start = next Monday, end = start + weeks * 7 days
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const daysUntilMonday = dayOfWeek === 0 ? 1 : 8 - dayOfWeek;
    const startDate = new Date(now);
    startDate.setDate(now.getDate() + daysUntilMonday);
    startDate.setHours(0, 0, 0, 0);

    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + plan.weeks.length * 7);

    await ctx.db.patch(args.planId, {
      status: "active",
      startDate: startDate.getTime(),
      endDate: endDate.getTime(),
      startedAt: Date.now(),
    });
  },
});
```

- [ ] **Step 3: Add `completePlan` public mutation**

```typescript
export const completePlan = mutation({
  args: {
    planId: v.id("trainingPlans"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) throw new Error("User not found");

    const plan = await ctx.db.get(args.planId);
    if (!plan) throw new Error("Plan not found");
    if (plan.userId !== user._id) throw new Error("Unauthorized");
    if (plan.status !== "active") throw new Error("Only active plans can be completed");

    await ctx.db.patch(args.planId, {
      status: "completed",
      completedAt: Date.now(),
    });
  },
});
```

- [ ] **Step 4: Add `abandonPlan` public mutation**

```typescript
export const abandonPlan = mutation({
  args: {
    planId: v.id("trainingPlans"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) throw new Error("User not found");

    const plan = await ctx.db.get(args.planId);
    if (!plan) throw new Error("Plan not found");
    if (plan.userId !== user._id) throw new Error("Unauthorized");
    if (plan.status !== "active") throw new Error("Only active plans can be abandoned");

    await ctx.db.patch(args.planId, { status: "abandoned" });
  },
});
```

- [ ] **Step 5: Add `deletePlan` public mutation**

```typescript
export const deletePlan = mutation({
  args: {
    planId: v.id("trainingPlans"),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) throw new Error("User not found");

    const plan = await ctx.db.get(args.planId);
    if (!plan) throw new Error("Plan not found");
    if (plan.userId !== user._id) throw new Error("Unauthorized");

    await ctx.db.delete(args.planId);
  },
});
```

- [ ] **Step 6: Update imports at the top of the file**

Replace the import block at the top of `convex/trainingPlans.ts` with:

```typescript
import { v } from "convex/values";
// @ts-ignore
import { internalQuery, internalMutation, query, mutation, action } from "./_generated/server";
import { Id } from "./_generated/dataModel";
// @ts-ignore
import { api, internal } from "./_generated/api";
```

This merges the existing imports with the new `action` import and `api/internal` imports needed for `savePlanAsDraft`.

- [ ] **Step 7: Add `savePlanAsDraft` public action**

Add to `convex/trainingPlans.ts`:

```typescript
// Note: This is a Convex action, not a mutation. The two internal mutations
// (createDraftInternal + clearPendingPlan) run as separate transactions.
// If clearPendingPlan fails after createDraftInternal succeeds, the draft
// exists but the pendingPlan remains on the message — a harmless state
// where the user sees both the draft and the preview card.
export const savePlanAsDraft = action({
  args: {
    messageId: v.id("chatMessages"),
    goal: v.string(),
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
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    // @ts-ignore
    const user = await ctx.runQuery(api.users.currentUser, {});
    if (!user) throw new Error("User not found");

    // Create the draft plan
    await ctx.runMutation(internal.trainingPlans.createDraftInternal, {
      userId: user._id,
      goal: args.goal,
      weeks: args.weeks,
    });

    // Clear the pendingPlan from the chat message
    await ctx.runMutation(internal.chatMessages.clearPendingPlan, {
      messageId: args.messageId,
    });
  },
});
```

- [ ] **Step 8: Remove the old `updateStatus` mutation**

Delete the `updateStatus` mutation entirely from the file. The old `create` internal mutation should already be replaced by `createDraftInternal` in Step 1.

- [ ] **Step 9: Verify Convex compiles**

Check the Convex dev terminal for successful compilation. Fix any TypeScript/import errors.

**Important:** Do NOT remove `getActive` (internalQuery) or `getActivePlan` (public query) — they are still used by `convex/chat.ts` for building AI context. Only `create` and `updateStatus` should be removed.

- [ ] **Step 10: Commit**

```bash
git add convex/trainingPlans.ts
git commit -m "feat: rewrite training plan mutations for draft workflow"
```

---

### Task 4: Update Chat Action

**Files:**
- Modify: `convex/chat.ts:252-288`

- [ ] **Step 1: Replace auto-plan-creation with pendingPlan storage**

In `convex/chat.ts`, find the block starting at ~line 252 (`// Detect and extract a training plan JSON block if present`). Replace the entire plan extraction and creation block with:

```typescript
// Detect and extract a training plan JSON block if present
const jsonBlockRegex = /```json\s*(\{[\s\S]*?"trainingPlan"[\s\S]*?\})\s*```/;
const jsonMatch = responseText.match(jsonBlockRegex);

let cleanedResponse = responseText;
let pendingPlan: { goal: string; weeks: any[] } | undefined;

if (jsonMatch) {
  try {
    const parsed = JSON.parse(jsonMatch[1]);
    const planData = parsed.trainingPlan;

    if (planData && planData.goal && Array.isArray(planData.weeks)) {
      pendingPlan = {
        goal: planData.goal,
        weeks: planData.weeks,
      };
    }
  } catch {
    // If parsing fails, just store the full response as-is
  }

  // Strip the JSON block from the stored message
  cleanedResponse = responseText.replace(jsonBlockRegex, "").trim();
}

await ctx.runMutation(internal.chatMessages.insert, {
  userId: user._id,
  role: "assistant",
  content: cleanedResponse,
  ...(pendingPlan ? { pendingPlan } : {}),
});
```

This replaces the old block that called `internal.trainingPlans.create` and the old `chatMessages.insert` call that followed it.

- [ ] **Step 2: Verify Convex compiles**

Check the Convex dev terminal. The old `internal.trainingPlans.create` reference should be gone.

- [ ] **Step 3: Commit**

```bash
git add convex/chat.ts
git commit -m "feat: store pending plans on chat messages instead of auto-creating"
```

---

### Task 5: Create Plan Preview Card Component

**Files:**
- Create: `components/plan-preview-card.tsx`

- [ ] **Step 1: Create the plan preview card component**

Create `components/plan-preview-card.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useAction } from "convex/react";
// @ts-ignore
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import Link from "next/link";

interface PendingPlan {
  goal: string;
  weeks: {
    weekNumber: number;
    workouts: {
      day: string;
      description: string;
      type: string;
      completed: boolean;
    }[];
  }[];
}

interface PlanPreviewCardProps {
  messageId: Id<"chatMessages">;
  pendingPlan: PendingPlan;
}

export default function PlanPreviewCard({ messageId, pendingPlan }: PlanPreviewCardProps) {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const savePlanAsDraft = useAction(api.trainingPlans.savePlanAsDraft);

  const totalWorkouts = pendingPlan.weeks.reduce(
    (sum, week) => sum + week.workouts.length,
    0
  );

  async function handleSave() {
    setSaving(true);
    setError(null);
    try {
      await savePlanAsDraft({
        messageId,
        goal: pendingPlan.goal,
        weeks: pendingPlan.weeks,
      });
      setSaved(true);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to save plan";
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="mt-3 rounded-xl border border-[#C8FC03]/20 overflow-hidden"
      style={{ background: "rgba(200,252,3,0.05)" }}
    >
      <div className="px-4 py-3">
        <div className="flex items-center gap-2 mb-1">
          <svg className="w-4 h-4 text-[#C8FC03]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
          <span className="text-sm font-semibold text-white">{pendingPlan.goal}</span>
        </div>
        <p className="text-xs text-[#9CA3AF]">
          {pendingPlan.weeks.length} week{pendingPlan.weeks.length !== 1 ? "s" : ""} &middot; {totalWorkouts} workout{totalWorkouts !== 1 ? "s" : ""}
        </p>
      </div>

      <div className="px-4 py-3 border-t border-[#C8FC03]/10">
        {error && (
          <p className="text-xs text-red-400 mb-2">{error}</p>
        )}
        {saved ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-[#9CA3AF]">Saved to Drafts</span>
            <Link
              href="/plan"
              className="text-xs font-medium text-[#C8FC03] hover:underline"
            >
              View Plans
            </Link>
          </div>
        ) : (
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 rounded-lg text-xs font-semibold text-black bg-[#C8FC03] hover:bg-[#b8ec00] disabled:opacity-50 transition-colors"
          >
            {saving ? "Saving..." : "Save as Draft"}
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the component compiles**

Run: `npx next build --no-lint` or check the Next.js dev server terminal for errors.

- [ ] **Step 3: Commit**

```bash
git add components/plan-preview-card.tsx
git commit -m "feat: add plan preview card component for chat"
```

---

### Task 6: Update Chat Message Component

**Files:**
- Modify: `components/chat-message.tsx`

- [ ] **Step 1: Add `pendingPlan` and `messageId` props to ChatMessage**

Update the interface and component in `components/chat-message.tsx`:

Add imports at the top:
```tsx
import PlanPreviewCard from "./plan-preview-card";
import { Id } from "@/convex/_generated/dataModel";
```

Update the interface:
```typescript
interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  displayText?: string;
  createdAt: number;
  messageId?: Id<"chatMessages">;
  pendingPlan?: {
    goal: string;
    weeks: {
      weekNumber: number;
      workouts: {
        day: string;
        description: string;
        type: string;
        completed: boolean;
      }[];
    }[];
  };
}
```

Update the component signature:
```typescript
export default function ChatMessage({ role, content, displayText, createdAt, messageId, pendingPlan }: ChatMessageProps) {
```

- [ ] **Step 2: Render plan preview card in assistant messages**

In the assistant message return block (the final `return` in the component, around line 118-132), add the `PlanPreviewCard` after the `MarkdownContent`:

```tsx
return (
  <div className="flex flex-col items-start gap-1">
    <div
      className="max-w-[85%] px-4 py-3 text-sm leading-relaxed text-white/90"
      style={{
        background: "#1A1A2A",
        borderLeft: "2px solid #C8FC03",
        borderRadius: "16px 16px 16px 4px",
      }}
    >
      <MarkdownContent content={content} />
      {pendingPlan && messageId && (
        <PlanPreviewCard messageId={messageId} pendingPlan={pendingPlan} />
      )}
    </div>
    <span className="text-xs text-white/40 pl-1">{relativeTime(createdAt)}</span>
  </div>
);
```

- [ ] **Step 3: Verify compilation**

Check the Next.js dev server terminal for errors.

- [ ] **Step 4: Commit**

```bash
git add components/chat-message.tsx
git commit -m "feat: render plan preview cards in chat messages"
```

---

### Task 7: Update Chat Page

**Files:**
- Modify: `app/(app)/chat/page.tsx:64-72`

- [ ] **Step 1: Pass `pendingPlan` and `messageId` to ChatMessage**

In `app/(app)/chat/page.tsx`, update the `MessageList` component's message rendering (around line 64-72):

```tsx
{displayed.map((msg: any) => (
  <ChatMessage
    key={msg._id}
    role={msg.role}
    content={msg.content}
    displayText={msg.displayText}
    createdAt={msg.createdAt}
    messageId={msg._id}
    pendingPlan={msg.pendingPlan}
  />
))}
```

- [ ] **Step 2: Verify in browser**

Open the app at `http://localhost:3000/chat`. Send a message asking the AI to create a training plan. Verify:
1. The plan preview card appears below the AI's response
2. The "Save as Draft" button is clickable
3. After clicking, it shows "Saved to Drafts" with a link to `/plan`

- [ ] **Step 3: Commit**

```bash
git add app/(app)/chat/page.tsx
git commit -m "feat: pass pendingPlan data to chat messages"
```

---

### Task 8: Rewrite Plan Page

**Files:**
- Rewrite: `app/(app)/plan/page.tsx`

This is the largest task. The full plan page needs to show active plan, drafts, and history.

- [ ] **Step 1: Rewrite the plan page**

Replace the entire contents of `app/(app)/plan/page.tsx`. Key differences from `useQuery(api.trainingPlans.getActivePlan)`:
- Now uses `useQuery(api.trainingPlans.listForUser)` which returns `undefined` (loading) or an array (possibly empty)
- Plans are partitioned client-side by status

The page structure:

```tsx
"use client";

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
// @ts-ignore
import { api } from "@/convex/_generated/api";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Workout {
  day: string;
  description: string;
  type: string;
  completed: boolean;
}

interface Week {
  weekNumber: number;
  workouts: Workout[];
}

// ---------------------------------------------------------------------------
// Helpers (preserved from current implementation)
// ---------------------------------------------------------------------------

function formatDateRange(startMs: number, endMs: number): string {
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  return `${new Date(startMs).toLocaleDateString(undefined, opts)} – ${new Date(endMs).toLocaleDateString(undefined, opts)}`;
}

function getOverallProgress(weeks: Week[]): { completed: number; total: number; pct: number } {
  let completed = 0;
  let total = 0;
  for (const week of weeks) {
    for (const workout of week.workouts) {
      total++;
      if (workout.completed) completed++;
    }
  }
  return { completed, total, pct: total === 0 ? 0 : Math.round((completed / total) * 100) };
}

function getCurrentWeekNumber(startMs: number, weeks: Week[]): number {
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const elapsed = Date.now() - startMs;
  const weekIndex = Math.floor(elapsed / msPerWeek);
  const clamped = Math.max(0, Math.min(weekIndex, weeks.length - 1));
  return weeks[clamped]?.weekNumber ?? 1;
}

const WORKOUT_TYPE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  easy:     { bg: "bg-green-900/60",  text: "text-green-300",  label: "Easy" },
  tempo:    { bg: "bg-yellow-900/60", text: "text-yellow-300", label: "Tempo" },
  interval: { bg: "bg-red-900/60",    text: "text-red-300",    label: "Interval" },
  long:     { bg: "bg-blue-900/60",   text: "text-blue-300",   label: "Long" },
  rest:     { bg: "bg-zinc-800",      text: "text-zinc-400",   label: "Rest" },
};

function workoutTypeStyle(type: string) {
  return WORKOUT_TYPE_STYLES[type.toLowerCase()] ?? WORKOUT_TYPE_STYLES.rest;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

// WeekSection — preserved from current code (collapsible week with workout toggles)
// Keep the existing WeekSection component exactly as-is from the current plan page.

// ConfirmDialog — reusable inline confirmation
function ConfirmDialog({
  title,
  description,
  confirmLabel,
  confirmClass,
  onConfirm,
  onCancel,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  confirmClass: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-[#1A1A2A] p-5">
      <p className="text-white font-semibold mb-1">{title}</p>
      <p className="text-[#9CA3AF] text-sm mb-5">{description}</p>
      <div className="flex gap-3">
        <button
          onClick={onCancel}
          className="flex-1 py-2.5 rounded-xl border border-white/15 text-white text-sm font-medium hover:bg-white/5 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          className={`flex-1 py-2.5 rounded-xl text-white text-sm font-semibold transition-colors ${confirmClass}`}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}

// DraftCard — displays a draft plan with start/delete actions
function DraftCard({
  plan,
  hasActivePlan,
  onStart,
  onDelete,
}: {
  plan: any;
  hasActivePlan: boolean;
  onStart: (planId: string) => void;
  onDelete: (planId: string) => void;
}) {
  const totalWorkouts = (plan.weeks as Week[]).reduce(
    (sum: number, w: Week) => sum + w.workouts.length, 0
  );

  return (
    <div className="rounded-2xl border border-white/10 bg-[#1A1A2A] p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-white truncate">{plan.goal}</h3>
          <p className="text-sm text-[#9CA3AF] mt-1">
            {plan.weeks.length} week{plan.weeks.length !== 1 ? "s" : ""} · {totalWorkouts} workout{totalWorkouts !== 1 ? "s" : ""}
          </p>
        </div>
        <button
          onClick={() => onDelete(plan._id)}
          className="p-2 rounded-lg hover:bg-white/5 transition-colors text-[#9CA3AF] hover:text-red-400"
          aria-label="Delete plan"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>
      <button
        onClick={() => onStart(plan._id)}
        className="mt-4 w-full py-2.5 rounded-xl bg-[#C8FC03] text-black text-sm font-semibold hover:bg-[#b8ec00] transition-colors"
      >
        Start Plan
      </button>
    </div>
  );
}

// HistoryEntry — displays a completed or abandoned plan
function HistoryEntry({
  plan,
  onDelete,
}: {
  plan: any;
  onDelete: (planId: string) => void;
}) {
  const { pct } = getOverallProgress(plan.weeks as Week[]);
  const isCompleted = plan.status === "completed";

  return (
    <div className="flex items-center gap-4 px-5 py-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-white text-sm truncate">{plan.goal}</span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
            isCompleted ? "bg-green-900/60 text-green-300" : "bg-red-900/60 text-red-300"
          }`}>
            {isCompleted ? "Completed" : "Abandoned"}
          </span>
        </div>
        <p className="text-xs text-[#9CA3AF] mt-1">
          {plan.startDate && plan.endDate
            ? `${formatDateRange(plan.startDate, plan.endDate)} · ${pct}% completed`
            : `${pct}% completed`}
        </p>
      </div>
      <button
        onClick={() => onDelete(plan._id)}
        className="p-2 rounded-lg hover:bg-white/5 transition-colors text-[#9CA3AF] hover:text-red-400"
        aria-label="Delete plan"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function PlanPage() {
  const plans = useQuery(api.trainingPlans.listForUser);
  const toggleWorkout = useMutation(api.trainingPlans.toggleWorkout);
  const startPlan = useMutation(api.trainingPlans.startPlan);
  const completePlanMut = useMutation(api.trainingPlans.completePlan);
  const abandonPlanMut = useMutation(api.trainingPlans.abandonPlan);
  const deletePlanMut = useMutation(api.trainingPlans.deletePlan);

  // Confirmation state: { action: string, planId: string } or null
  const [confirm, setConfirm] = useState<{ action: string; planId: string } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  // Loading state (plans === undefined)
  if (plans === undefined) {
    return (
      <div className="pb-8">
        {/* Reuse the existing loading skeleton from current plan page */}
        <div className="mb-8">
          <div className="bg-white/5 animate-pulse rounded h-7 w-2/3 mb-2" />
          <div className="bg-white/5 animate-pulse rounded h-4 w-1/3 mb-5" />
          <div className="flex items-center gap-3 mb-2">
            <div className="flex-1 h-2 rounded-full bg-white/5 animate-pulse" />
            <div className="bg-white/5 animate-pulse rounded h-4 w-10" />
          </div>
        </div>
        <div className="space-y-3">
          {[1, 2].map((i) => (
            <div key={i} className="rounded-2xl border border-white/5 bg-[#1A1A2A] p-5">
              <div className="bg-white/5 animate-pulse rounded h-5 w-1/2 mb-3" />
              <div className="bg-white/5 animate-pulse rounded h-4 w-1/3" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Partition plans by status
  const activePlan = plans.find((p: any) => p.status === "active");
  const drafts = plans
    .filter((p: any) => p.status === "draft")
    .sort((a: any, b: any) => b.createdAt - a.createdAt);
  const history = plans
    .filter((p: any) => p.status === "completed" || p.status === "abandoned")
    .sort((a: any, b: any) => b.createdAt - a.createdAt);

  const isEmpty = !activePlan && drafts.length === 0 && history.length === 0;

  // Empty state
  if (isEmpty) {
    return (
      <div className="flex items-center justify-center py-20 px-4">
        <div className="rounded-2xl border border-white/10 bg-[#1A1A2A] p-8 max-w-md w-full text-center">
          <div className="w-14 h-14 rounded-full bg-[#C8FC03]/10 flex items-center justify-center mx-auto mb-5">
            <svg className="w-7 h-7 text-[#C8FC03]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">No training plans</h2>
          <p className="text-[#9CA3AF] text-sm mb-8 leading-relaxed">
            Ask your AI coach to create a personalized plan based on your training data
          </p>
          <Link
            href="/chat"
            className="inline-block px-6 py-3 rounded-xl bg-[#C8FC03] text-black font-semibold text-sm hover:bg-[#b8ec00] transition-colors"
          >
            Go to Chat
          </Link>
        </div>
      </div>
    );
  }

  // Handlers
  function handleToggle(planId: string, weekNumber: number, workoutIndex: number) {
    toggleWorkout({ planId: planId as any, weekNumber, workoutIndex });
  }

  async function handleStartPlan(planId: string) {
    if (activePlan) {
      setConfirm({ action: "start", planId });
    } else {
      await startPlan({ planId: planId as any });
    }
  }

  async function handleConfirmAction() {
    if (!confirm) return;
    const { action, planId } = confirm;
    if (action === "start") await startPlan({ planId: planId as any });
    else if (action === "complete") await completePlanMut({ planId: planId as any });
    else if (action === "abandon") await abandonPlanMut({ planId: planId as any });
    else if (action === "delete") await deletePlanMut({ planId: planId as any });
    setConfirm(null);
  }

  // Confirmation dialog config
  const confirmConfig: Record<string, { title: string; description: string; label: string; cls: string }> = {
    start: {
      title: "Start this plan?",
      description: "Starting this plan will abandon your current active plan.",
      label: "Start Plan",
      cls: "bg-[#C8FC03] text-black hover:bg-[#b8ec00]",
    },
    complete: {
      title: "Complete this plan?",
      description: "This will mark the plan as completed and move it to history.",
      label: "Complete Plan",
      cls: "bg-green-600 hover:bg-green-500",
    },
    abandon: {
      title: "Abandon this plan?",
      description: "This action cannot be undone. Your progress will be preserved in history.",
      label: "Abandon Plan",
      cls: "bg-red-600 hover:bg-red-500",
    },
    delete: {
      title: "Delete this plan?",
      description: "This action cannot be undone. The plan will be permanently removed.",
      label: "Delete Plan",
      cls: "bg-red-600 hover:bg-red-500",
    },
  };

  return (
    <div className="pb-8">
      {/* Confirmation dialog overlay */}
      {confirm && confirmConfig[confirm.action] && (
        <div className="mb-6">
          <ConfirmDialog
            title={confirmConfig[confirm.action].title}
            description={confirmConfig[confirm.action].description}
            confirmLabel={confirmConfig[confirm.action].label}
            confirmClass={confirmConfig[confirm.action].cls}
            onConfirm={handleConfirmAction}
            onCancel={() => setConfirm(null)}
          />
        </div>
      )}

      {/* Active Plan Section */}
      {activePlan && (
        <div className="mb-8">
          {/* Active plan header with progress bar */}
          <h1 className="text-2xl font-bold text-white mb-1">{activePlan.goal}</h1>
          {activePlan.startDate && activePlan.endDate && (
            <p className="text-[#9CA3AF] text-sm mb-5">
              {formatDateRange(activePlan.startDate, activePlan.endDate)}
            </p>
          )}

          {/* Progress bar */}
          {(() => {
            const { completed, total, pct } = getOverallProgress(activePlan.weeks as Week[]);
            return (
              <>
                <div className="flex items-center gap-3 mb-2">
                  <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-[#C8FC03] transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-sm font-semibold text-[#C8FC03] w-12 text-right">{pct}%</span>
                </div>
                <p className="text-xs text-[#9CA3AF] mb-6">{completed} of {total} workouts completed</p>
              </>
            );
          })()}

          {/* Week sections */}
          <div className="space-y-3 mb-6">
            {(activePlan.weeks as Week[]).map((week: Week) => (
              <WeekSection
                key={week.weekNumber}
                week={week}
                defaultOpen={week.weekNumber === getCurrentWeekNumber(activePlan.startDate!, activePlan.weeks as Week[])}
                planId={activePlan._id}
                onToggle={(wn: number, wi: number) => handleToggle(activePlan._id, wn, wi)}
              />
            ))}
          </div>

          {/* Active plan action buttons */}
          <div className="flex gap-3">
            <button
              onClick={() => setConfirm({ action: "complete", planId: activePlan._id })}
              className="flex-1 py-3 rounded-xl bg-green-600 text-white text-sm font-semibold hover:bg-green-500 transition-colors"
            >
              Complete Plan
            </button>
            <button
              onClick={() => setConfirm({ action: "abandon", planId: activePlan._id })}
              className="flex-1 py-3 rounded-xl border border-red-500/40 text-red-400 text-sm font-medium hover:bg-red-500/10 transition-colors"
            >
              Abandon Plan
            </button>
          </div>
        </div>
      )}

      {/* Drafts Section */}
      {drafts.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4">
            <h2 className="text-lg font-bold text-white">Drafts</h2>
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-white/10 text-[#9CA3AF]">
              {drafts.length}
            </span>
          </div>
          <div className="space-y-3">
            {drafts.map((plan: any) => (
              <DraftCard
                key={plan._id}
                plan={plan}
                hasActivePlan={!!activePlan}
                onStart={handleStartPlan}
                onDelete={(id) => setConfirm({ action: "delete", planId: id })}
              />
            ))}
          </div>
        </div>
      )}

      {/* History Section */}
      {history.length > 0 && (
        <div>
          <button
            onClick={() => setHistoryOpen((v) => !v)}
            className="flex items-center gap-2 mb-4 hover:opacity-80 transition-opacity"
          >
            <h2 className="text-lg font-bold text-white">History</h2>
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-white/10 text-[#9CA3AF]">
              {history.length}
            </span>
            <svg
              className={`w-4 h-4 text-[#9CA3AF] transition-transform ${historyOpen ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {historyOpen && (
            <div className="rounded-2xl border border-white/10 bg-[#1A1A2A] overflow-hidden divide-y divide-white/5">
              {history.map((plan: any) => (
                <HistoryEntry
                  key={plan._id}
                  plan={plan}
                  onDelete={(id) => setConfirm({ action: "delete", planId: id })}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

**Important notes for the implementer:**
- The `WeekSection` component from the current plan page should be preserved exactly as-is. Copy it into the new file.
- `plans` is `undefined` while loading (show skeleton) and `[]` when no plans exist (different from the old `getActivePlan` which returned `null`).
- All `planId` values from Convex are `Id<"trainingPlans">` — cast with `as any` when passing to mutations to avoid TypeScript friction with generated types.

- [ ] **Step 2: Verify in browser**

Open `http://localhost:3000/plan`. Test:
1. Empty state shows when no plans exist
2. After saving a draft from chat, it appears in the Drafts section
3. Starting a draft moves it to Active with correct dates
4. Completing/abandoning moves to History
5. Delete works on all plan types with confirmation
6. Starting a draft when active plan exists shows warning and abandons current

- [ ] **Step 3: Commit**

```bash
git add app/(app)/plan/page.tsx
git commit -m "feat: rewrite plan page with drafts, active, and history sections"
```

---

### Task 9: Cleanup and Verify End-to-End

**Files:**
- Verify all modified files

- [ ] **Step 1: Remove unused imports/references**

Check `convex/trainingPlans.ts` — ensure the old `create` and `updateStatus` mutations are fully removed. Check that `convex/chat.ts` no longer references `internal.trainingPlans.create`.

**Do NOT remove** `getActive` (internalQuery) or `getActivePlan` (public query) from `trainingPlans.ts` — `chat.ts` still uses `internal.trainingPlans.getActive` to build AI context (line ~158). The `list` query in `chatMessages.ts` implicitly returns `pendingPlan` since Convex returns full documents — no explicit change needed there.

- [ ] **Step 2: Check the plan page references correct mutations**

Verify `app/(app)/plan/page.tsx` imports and uses:
- `api.trainingPlans.listForUser` (query)
- `api.trainingPlans.startPlan` (mutation)
- `api.trainingPlans.completePlan` (mutation)
- `api.trainingPlans.abandonPlan` (mutation)
- `api.trainingPlans.deletePlan` (mutation)
- `api.trainingPlans.toggleWorkout` (mutation)

Verify `app/(app)/plan/page.tsx` does NOT reference:
- `api.trainingPlans.getActivePlan`
- `api.trainingPlans.updateStatus`

- [ ] **Step 3: End-to-end test in browser**

Full flow:
1. Go to `/chat`, ask AI to create a 4-week training plan
2. AI responds with plan preview card below message
3. Click "Save as Draft" — button changes to "Saved to Drafts" with link
4. Navigate to `/plan` — draft appears in Drafts section
5. Click "Start Plan" — plan moves to Active section with dates
6. Toggle a workout as completed — checkbox updates
7. Click "Complete Plan" — plan moves to History as completed
8. Go back to chat, create another plan, save as draft
9. Start the new plan — should work since no active plan
10. Click "Abandon Plan" — moves to History as abandoned
11. Delete a plan from History — confirmation shown, then deleted

- [ ] **Step 4: Commit any cleanup changes**

```bash
git add -A
git commit -m "chore: cleanup unused references and verify end-to-end flow"
```
