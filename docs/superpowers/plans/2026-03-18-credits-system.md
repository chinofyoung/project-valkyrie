# Credits System Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace hardcoded 20/day AI rate limit with a configurable credits system (20/40/60/no-limit) with usage tracking UI on the profile page and warning/block states in the chat UI.

**Architecture:** Add `dailyCreditLimit` field to users table, extract rate limiting into a shared module, compute usage from existing tables reactively, and add a "Usage & Limits" section to the profile page. Warning/block states driven by a reactive `getCreditStatus` query.

**Tech Stack:** Convex (backend), Next.js + React (frontend), Tailwind CSS v4 (styling), TypeScript

**Spec:** `docs/superpowers/specs/2026-03-18-credits-system-design.md`

---

## File Structure

### New Files
- `convex/constants.ts` — shared constants (credit limits, safety cap, warning threshold)
- `convex/creditLimit.ts` — shared `checkCreditLimit` function
- `components/usage-limits.tsx` — "Usage & Limits" section for profile page
- `components/credit-warning.tsx` — warning toast and limit-reached banner for chat page

### Modified Files
- `convex/schema.ts` — add `dailyCreditLimit` to users table
- `convex/users.ts` — add `updateDailyCreditLimit` mutation, `getCreditStatus` query, `getUsageHistory` query
- `convex/chat.ts` — replace `checkCombinedRateLimit` with shared `checkCreditLimit`
- `convex/ai.ts` — replace `checkRateLimit` with shared `checkCreditLimit`
- `app/(app)/profile/page.tsx` — add UsageLimits component
- `app/(app)/chat/page.tsx` — add credit warning/block UI via reactive query
- `components/chat-input.tsx` — accept and display limit-reached state

---

## Task 1: Constants and Schema

**Files:**
- Create: `convex/constants.ts`
- Modify: `convex/schema.ts:5-21` (users table)

- [ ] **Step 1: Create constants file**

```ts
// convex/constants.ts
export const ALLOWED_CREDIT_LIMITS = [20, 40, 60, 0] as const;
export const DEFAULT_CREDIT_LIMIT = 20;
export const SAFETY_CAP = 500;
export const WARNING_THRESHOLD = 2;
```

- [ ] **Step 2: Add dailyCreditLimit to users schema**

In `convex/schema.ts`, add to the users table definition (after `chatSummary` field, around line 17):

```ts
dailyCreditLimit: v.optional(v.number()),
```

- [ ] **Step 3: Verify schema compiles**

Run: `npx convex dev --once` (or check that the dev server shows no errors)
Expected: No schema validation errors

- [ ] **Step 4: Commit**

```bash
git add convex/constants.ts convex/schema.ts
git commit -m "feat: add credit limit constants and schema field"
```

---

## Task 2: Shared Credit Limit Check

**Files:**
- Create: `convex/creditLimit.ts`
- Modify: `convex/chat.ts:86-128` (replace checkCombinedRateLimit)
- Modify: `convex/ai.ts:138-147,188-189,296-300` (replace checkRateLimit)

- [ ] **Step 1: Create shared creditLimit module**

```ts
// convex/creditLimit.ts
import { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import { Id } from "./_generated/dataModel";
import { DEFAULT_CREDIT_LIMIT, SAFETY_CAP, WARNING_THRESHOLD } from "./constants";

// NOTE: This duplicates some logic from getCreditStatus in users.ts.
// getCreditStatus runs in QueryCtx (reactive, for UI), while this runs in
// ActionCtx (for gating actions). Convex's model requires both paths.

export async function checkCreditLimit(
  ctx: ActionCtx,
  userId: Id<"users">
): Promise<{ allowed: boolean; used: number; effectiveLimit: number; warning: boolean }> {
  const user: any = await ctx.runQuery(internal.users.getById, { userId });
  const limit = user?.dailyCreditLimit ?? DEFAULT_CREDIT_LIMIT;
  const effectiveLimit = limit === 0 ? SAFETY_CAP : limit;

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

  const used = (analysesCount as number) + (chatCount as number);
  const allowed = used < effectiveLimit;
  const warning = allowed && (effectiveLimit - used) <= WARNING_THRESHOLD;

  return { allowed, used, effectiveLimit, warning };
}
```

- [ ] **Step 2: Update chat.ts to use shared check**

In `convex/chat.ts`, replace the `checkCombinedRateLimit` function (lines 86-106) and its usage (lines 124-128):

Remove the `checkCombinedRateLimit` function entirely.

Add import at top:
```ts
import { checkCreditLimit } from "./creditLimit";
```

Replace lines 124-128 in `sendMessage` handler:
```ts
    // Rate limit check
    const creditStatus = await checkCreditLimit(ctx, user._id);
    if (!creditStatus.allowed) {
      throw new Error(
        `Daily credit limit reached (${creditStatus.used}/${creditStatus.effectiveLimit}). Resets daily.`
      );
    }
```

**Note:** This module reuses the existing `internal.aiAnalyses.countSince` and `internal.chatMessages.countAssistantSince` queries without modification. The `chatMessages.addToChat` mutation (which inserts assistant-role messages from analyses) does not need a rate check — those messages are already counted by `countAssistantSince`, and the triggering analysis is gated by this check.

- [ ] **Step 3: Update ai.ts to use shared check**

In `convex/ai.ts`, remove the `checkRateLimit` function (lines 138-147).

Add import at top:
```ts
import { checkCreditLimit } from "./creditLimit";
```

Replace rate limit check in `analyzeRun` (around line 188-189):
```ts
    const creditStatus = await checkCreditLimit(ctx, user._id);
    if (!creditStatus.allowed) {
      throw new Error(
        `Daily credit limit reached (${creditStatus.used}/${creditStatus.effectiveLimit}). Resets daily.`
      );
    }
```

Replace rate limit check in `analyzeProgress` (around line 296-300) with the same pattern.

- [ ] **Step 4: Verify the app works**

Run: `npx convex dev` and test sending a chat message and running an analysis.
Expected: Both work as before with the new shared limit check.

- [ ] **Step 5: Commit**

```bash
git add convex/creditLimit.ts convex/chat.ts convex/ai.ts
git commit -m "feat: extract shared credit limit check with configurable limits"
```

---

## Task 3: Backend Queries and Mutations

**Files:**
- Modify: `convex/users.ts` — add `updateDailyCreditLimit`, `getCreditStatus`, `getUsageHistory`

- [ ] **Step 1: Add updateDailyCreditLimit mutation**

In `convex/users.ts`, add after the existing exports:

```ts
import { ALLOWED_CREDIT_LIMITS, DEFAULT_CREDIT_LIMIT, SAFETY_CAP, WARNING_THRESHOLD } from "./constants";

export const updateDailyCreditLimit = mutation({
  args: { limit: v.number() },
  handler: async (ctx, args) => {
    if (!ALLOWED_CREDIT_LIMITS.includes(args.limit as any)) {
      throw new Error(`Invalid credit limit. Allowed values: ${ALLOWED_CREDIT_LIMITS.join(", ")}`);
    }
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) throw new Error("User not found");
    await ctx.db.patch(user._id, { dailyCreditLimit: args.limit });
  },
});
```

- [ ] **Step 2: Add getCreditStatus query**

```ts
export const getCreditStatus = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) return null;

    const limit = user.dailyCreditLimit ?? DEFAULT_CREDIT_LIMIT;
    const effectiveLimit = limit === 0 ? SAFETY_CAP : limit;

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const todayTimestamp = startOfDay.getTime();

    const allAnalyses = await ctx.db
      .query("aiAnalyses")
      .withIndex("by_userId_activityId", (q) => q.eq("userId", user._id))
      .filter((q) => q.gte(q.field("createdAt"), todayTimestamp))
      .collect();
    const analysisCount = allAnalyses.length;

    const allMessages = await ctx.db
      .query("chatMessages")
      .withIndex("by_userId_createdAt", (q) =>
        q.eq("userId", user._id).gte("createdAt", todayTimestamp)
      )
      .filter((q) => q.eq(q.field("role"), "assistant"))
      .collect();
    const chatCount = allMessages.length;

    const used = analysisCount + chatCount;
    const warning = used >= effectiveLimit - WARNING_THRESHOLD && used < effectiveLimit;
    const limitReached = used >= effectiveLimit;

    return {
      used,
      limit,
      effectiveLimit,
      warning,
      limitReached,
      chatCount,
      analysisCount,
    };
  },
});
```

- [ ] **Step 3: Add getUsageHistory query**

```ts
export const getUsageHistory = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) return [];

    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    const [analyses, messages] = await Promise.all([
      ctx.db
        .query("aiAnalyses")
        .withIndex("by_userId_activityId", (q) => q.eq("userId", user._id))
        .filter((q) => q.gte(q.field("createdAt"), sevenDaysAgo))
        .collect(),
      ctx.db
        .query("chatMessages")
        .withIndex("by_userId_createdAt", (q) =>
          q.eq("userId", user._id).gte("createdAt", sevenDaysAgo)
        )
        .filter((q) => q.eq(q.field("role"), "assistant"))
        .collect(),
    ]);

    // Group by date (UTC)
    const byDate: Record<string, { chatCount: number; analysisCount: number }> = {};
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      byDate[key] = { chatCount: 0, analysisCount: 0 };
    }
    for (const a of analyses) {
      const key = new Date(a.createdAt).toISOString().slice(0, 10);
      if (byDate[key]) byDate[key].analysisCount++;
    }
    for (const m of messages) {
      const key = new Date(m.createdAt).toISOString().slice(0, 10);
      if (byDate[key]) byDate[key].chatCount++;
    }

    return Object.entries(byDate).map(([date, counts]) => ({
      date,
      ...counts,
      total: counts.chatCount + counts.analysisCount,
    }));
  },
});
```

- [ ] **Step 4: Verify queries work**

Run the Convex dashboard or test from the frontend console:
- `getCreditStatus` returns `{ used, limit, effectiveLimit, warning, limitReached, chatCount, analysisCount }`
- `getUsageHistory` returns 7 entries with date and counts

- [ ] **Step 5: Commit**

```bash
git add convex/users.ts
git commit -m "feat: add credit status query, usage history, and limit update mutation"
```

---

## Task 4: Profile Page — Usage & Limits Component

**Files:**
- Create: `components/usage-limits.tsx`
- Modify: `app/(app)/profile/page.tsx:73-127` (add component)

- [ ] **Step 1: Create UsageLimits component**

Create `components/usage-limits.tsx` with three sections:

```tsx
"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ALLOWED_CREDIT_LIMITS, DEFAULT_CREDIT_LIMIT } from "@/convex/constants";
import { useState } from "react";

const LIMIT_LABELS: Record<number, string> = {
  20: "20",
  40: "40",
  60: "60",
  0: "No Limit",
};

export function UsageLimits() {
  const creditStatus = useQuery(api.users.getCreditStatus);
  const usageHistory = useQuery(api.users.getUsageHistory);
  const updateLimit = useMutation(api.users.updateDailyCreditLimit);
  const [showConfirm, setShowConfirm] = useState<number | null>(null);

  if (!creditStatus) return null;

  const currentLimit = creditStatus.limit ?? DEFAULT_CREDIT_LIMIT;
  const progressPercent = Math.min(
    (creditStatus.used / creditStatus.effectiveLimit) * 100,
    100
  );

  const handleLimitChange = async (newLimit: number) => {
    // If lowering below current usage, confirm first
    if (newLimit !== 0 && newLimit < creditStatus.used) {
      setShowConfirm(newLimit);
      return;
    }
    await updateLimit({ limit: newLimit });
    setShowConfirm(null);
  };

  const confirmLimitChange = async () => {
    if (showConfirm !== null) {
      await updateLimit({ limit: showConfirm });
      setShowConfirm(null);
    }
  };

  const maxHistory = usageHistory
    ? Math.max(...usageHistory.map((d) => d.total), 1)
    : 1;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-white">Usage & Limits</h2>
        <p className="text-sm text-gray-400">
          Manage your daily AI credit allowance
        </p>
      </div>

      {/* Today's Usage */}
      <div className="rounded-xl border border-white/10 bg-[#1A1A2A] p-5">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
            Today&apos;s Usage
          </span>
          <span className="text-sm font-semibold text-[#C8FC03]">
            {creditStatus.used} / {currentLimit === 0 ? "∞" : creditStatus.effectiveLimit} credits
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-[#C8FC03] transition-all duration-300"
            style={{ width: `${currentLimit === 0 ? 0 : progressPercent}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between">
          <span className="text-xs text-gray-500">
            {creditStatus.chatCount} chat + {creditStatus.analysisCount} analyses
          </span>
          <span className="text-xs text-gray-500">Resets daily</span>
        </div>
      </div>

      {/* Daily Limit Selector */}
      <div className="rounded-xl border border-white/10 bg-[#1A1A2A] p-5">
        <div className="mb-3">
          <span className="text-[15px] font-medium text-white">
            Daily Credit Limit
          </span>
        </div>
        <div className="flex gap-2">
          {ALLOWED_CREDIT_LIMITS.map((limit) => (
            <button
              key={limit}
              onClick={() => handleLimitChange(limit)}
              className={`flex-1 rounded-lg border py-2.5 text-sm font-medium transition-colors ${
                currentLimit === limit
                  ? "border-[#C8FC03] bg-[#C8FC03]/10 text-[#C8FC03]"
                  : "border-white/10 text-gray-400 hover:border-white/20 hover:text-gray-300"
              }`}
            >
              {LIMIT_LABELS[limit]}
            </button>
          ))}
        </div>

        {/* Confirmation dialog */}
        {showConfirm !== null && (
          <div className="mt-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3">
            <p className="text-sm text-yellow-200">
              You&apos;ve already used {creditStatus.used} credits today. Setting the
              limit to {showConfirm} will block further AI interactions until
              tomorrow. Continue?
            </p>
            <div className="mt-2 flex gap-2">
              <button
                onClick={confirmLimitChange}
                className="rounded-md bg-yellow-600 px-3 py-1 text-xs font-medium text-white hover:bg-yellow-500"
              >
                Yes, change it
              </button>
              <button
                onClick={() => setShowConfirm(null)}
                className="rounded-md bg-white/10 px-3 py-1 text-xs font-medium text-gray-300 hover:bg-white/20"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Usage History */}
      {usageHistory && usageHistory.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-[#1A1A2A] p-5">
          <div className="mb-4">
            <span className="text-[15px] font-medium text-white">
              Usage History
            </span>
            <span className="ml-2 text-[13px] text-gray-500">Last 7 days</span>
          </div>
          <div className="flex items-end gap-2" style={{ height: 100 }}>
            {usageHistory.map((day, i) => {
              const isToday = i === usageHistory.length - 1;
              const barHeight =
                maxHistory > 0 ? (day.total / maxHistory) * 100 : 0;
              const hitLimit =
                currentLimit !== 0 && day.total >= currentLimit;
              return (
                <div
                  key={day.date}
                  className="flex flex-1 flex-col items-center gap-1"
                >
                  <span
                    className={`text-[11px] ${
                      isToday
                        ? "font-semibold text-[#C8FC03]"
                        : "text-gray-500"
                    }`}
                  >
                    {day.total}
                  </span>
                  <div
                    className={`w-full rounded-t ${
                      isToday
                        ? "bg-[#C8FC03]"
                        : "bg-[#C8FC03]/30"
                    } ${hitLimit ? "border-t-2 border-red-500" : ""}`}
                    style={{
                      height: `${Math.max(barHeight, 4)}%`,
                      transition: "height 0.3s",
                    }}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex gap-2">
            {usageHistory.map((day, i) => {
              const isToday = i === usageHistory.length - 1;
              const label = isToday
                ? "Today"
                : new Date(day.date + "T00:00:00").toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  });
              return (
                <div
                  key={day.date}
                  className={`flex-1 text-center text-[11px] ${
                    isToday
                      ? "font-semibold text-[#C8FC03]"
                      : "text-gray-500"
                  }`}
                >
                  {label}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Add UsageLimits to profile page**

In `app/(app)/profile/page.tsx`, add import at top:
```tsx
import { UsageLimits } from "@/components/usage-limits";
```

Add the component after the Strava connection section and before the Danger Zone section (around line 112):
```tsx
        {/* Usage & Limits */}
        <UsageLimits />
```

- [ ] **Step 3: Verify visually**

Open the profile page in the browser. Confirm:
- Today's Usage card shows a progress bar with correct count
- Daily Credit Limit pills render with current limit highlighted
- Clicking a different limit updates immediately
- Usage History bar chart shows last 7 days
- Lowering limit below current usage shows confirmation dialog

- [ ] **Step 4: Commit**

```bash
git add components/usage-limits.tsx app/\(app\)/profile/page.tsx
git commit -m "feat: add Usage & Limits section to profile page"
```

---

## Task 5: Chat Page — Warning and Block UI

**Files:**
- Create: `components/credit-warning.tsx`
- Modify: `app/(app)/chat/page.tsx:78-115,222-226` (add warning/block)
- Modify: `components/chat-input.tsx:6-7` (accept limitReached prop)

- [ ] **Step 1: Create CreditWarning component**

```tsx
"use client";

import Link from "next/link";

export function CreditWarningToast({ remaining }: { remaining: number }) {
  return (
    <div className="mx-4 mb-2 flex items-center justify-between rounded-lg border border-yellow-500/30 bg-yellow-500/10 px-4 py-2">
      <span className="text-sm text-yellow-200">
        You have {remaining} credit{remaining !== 1 ? "s" : ""} remaining today.
      </span>
      <Link
        href="/profile"
        className="text-sm font-medium text-[#C8FC03] hover:underline"
      >
        Adjust limit →
      </Link>
    </div>
  );
}

export function CreditLimitBanner() {
  return (
    <div className="mx-4 mb-2 flex items-center justify-between rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2">
      <span className="text-sm text-red-200">
        Daily credit limit reached. Resets daily.
      </span>
      <Link
        href="/profile"
        className="text-sm font-medium text-[#C8FC03] hover:underline"
      >
        Change limit →
      </Link>
    </div>
  );
}
```

- [ ] **Step 2: Update chat-input.tsx to accept limitReached prop**

In `components/chat-input.tsx`, update the props interface (around line 6-7):

Change:
```tsx
interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}
```
To:
```tsx
interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
  limitReached?: boolean;
}
```

Update the component to destructure `limitReached`:
```tsx
export function ChatInput({ onSend, disabled, limitReached }: ChatInputProps) {
```

Update the input placeholder (around line 30) — change the existing placeholder to be conditional:
```tsx
placeholder={limitReached ? "Daily credit limit reached. Resets daily." : "Ask your running coach anything..."}
```

Update the disabled state on the input and button to also consider `limitReached`:
- Input: `disabled={disabled || limitReached}`
- Button: `disabled={!value.trim() || disabled || limitReached}`

- [ ] **Step 3: Update chat page to use credit status**

In `app/(app)/chat/page.tsx`, add imports:
```tsx
import { CreditWarningToast, CreditLimitBanner } from "@/components/credit-warning";
```

Add the credit status query (after existing queries, around line 81):
```tsx
const creditStatus = useQuery(api.users.getCreditStatus);
```

Add warning/block UI above the chat input area (before the error display, around line 222). Insert:
```tsx
{creditStatus?.limitReached && <CreditLimitBanner />}
{creditStatus?.warning && !creditStatus?.limitReached && (
  <CreditWarningToast
    remaining={creditStatus.effectiveLimit - creditStatus.used}
  />
)}
```

Pass `limitReached` to ChatInput:
```tsx
<ChatInput
  onSend={handleSend}
  disabled={isAiResponding}
  limitReached={creditStatus?.limitReached}
/>
```

- [ ] **Step 4: Verify visually**

Test in the browser:
- Normal state (under limit): no warning, chat works normally
- Near limit (within 2): yellow warning toast with link to profile
- At limit: red banner, input disabled with "Daily credit limit reached" placeholder
- Sending a message when at limit: server error is caught gracefully

- [ ] **Step 5: Commit**

```bash
git add components/credit-warning.tsx components/chat-input.tsx app/\(app\)/chat/page.tsx
git commit -m "feat: add credit warning toast and limit-reached block to chat page"
```

---

## Task 6: Disable Analysis Buttons When Limit Reached

**Files:**
- Modify: `app/(app)/dashboard/page.tsx:179-188,213-230` — disable "Analyze Progress" buttons (desktop + mobile)
- Modify: `app/(app)/activities/[id]/page.tsx` — disable "Analyze" button (if applicable)
- Possibly modify: `components/ai-insight-card.tsx` — if it has its own analyze trigger

- [ ] **Step 1: Update dashboard page — both desktop and mobile buttons**

In `app/(app)/dashboard/page.tsx`, add the credit status query:
```tsx
const creditStatus = useQuery(api.users.getCreditStatus);
```

There are TWO "Analyze Progress" buttons — one for desktop (around line 179-188) and one for mobile (around line 213-230). Update BOTH with:
- `disabled={creditStatus?.limitReached}`
- `title={creditStatus?.limitReached ? "No credits remaining today" : undefined}`
- Add conditional class: `${creditStatus?.limitReached ? "opacity-50 cursor-not-allowed" : ""}`

Also check if the `AiInsightCard` component (around line 382) passes an `onAnalyze` callback. If it does, the parent-level gating is sufficient since the button will be disabled.

- [ ] **Step 2: Update activity detail page**

In `app/(app)/activities/[id]/page.tsx`, apply the same pattern to any "Analyze" button:
```tsx
const creditStatus = useQuery(api.users.getCreditStatus);
```

Disable button and add tooltip when `creditStatus?.limitReached`.

- [ ] **Step 3: Verify visually**

- Dashboard: "Analyze Progress" button disabled on BOTH desktop and mobile when limit reached, with tooltip
- Activity detail: "Analyze" button disabled when limit reached, with tooltip
- Both buttons work normally when under limit

- [ ] **Step 5: Commit**

```bash
git add app/\(app\)/dashboard/page.tsx app/\(app\)/activities/\[id\]/page.tsx
git commit -m "feat: disable analysis buttons when credit limit reached"
```

---

## Task 7: Final Verification and Cleanup

- [ ] **Step 1: Remove dead code**

Verify that the old `checkCombinedRateLimit` function in `convex/chat.ts` and `checkRateLimit` in `convex/ai.ts` have been fully removed (no leftover imports or references).

- [ ] **Step 2: End-to-end test**

Test the full flow:
1. Set limit to 20 on profile page → pills update
2. Send chat messages → usage count increments in real-time on profile
3. When 2 credits remain → yellow warning toast appears in chat
4. When limit reached → red banner, input disabled, analysis buttons disabled
5. Change limit to 40 → chat unblocks, can send again
6. Set to "No Limit" → no warnings, no blocking (safety cap at 500)
7. Set to lower than current usage → confirmation dialog appears
8. Usage history bar chart shows accurate data for past 7 days

- [ ] **Step 3: Commit any final fixes**

```bash
git add -A
git commit -m "feat: credits system - final cleanup and verification"
```
