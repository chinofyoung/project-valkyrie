# Credits System Design

## Overview

Replace the hardcoded 20/day AI rate limit with a configurable credits system. Users can set their daily limit (20, 40, 60, or no limit with a 500 safety cap), see today's usage, and view a 7-day usage history — all from the profile/settings page.

## Constants

```ts
export const ALLOWED_CREDIT_LIMITS = [20, 40, 60, 0] as const;
export const DEFAULT_CREDIT_LIMIT = 20;
export const SAFETY_CAP = 500;
export const WARNING_THRESHOLD = 2; // warn when this many credits remain
```

Defined once in `convex/constants.ts`, imported by both backend validators and frontend components.

## Data Model

### Users table — new field

```ts
dailyCreditLimit: v.optional(v.number()) // default 20, values: 20 | 40 | 60 | 0
```

### `usageHistory` table — dropped

The 7-day usage chart will be computed at query time from existing `chatMessages` and `aiAnalyses` tables by grouping on `createdAt` date. For 7 days of data this scans at most a few hundred rows per user — well within Convex's performance envelope. This avoids the complexity of maintaining a denormalized table with upsert logic on every interaction.

### Source of truth

Real-time usage is always counted from existing `chatMessages` (assistant role) + `aiAnalyses` rows. No denormalized counters.

## Rate Limit Logic

### Unified combined check

Both `convex/chat.ts` and `convex/ai.ts` currently have separate rate limit functions. These will be consolidated into a single shared function (`checkCreditLimit` in `convex/creditLimit.ts`) that counts **both** chat messages and analyses against the user's configured limit.

- `ai.ts`'s existing `checkRateLimit` (analysis-only count) will be replaced with the shared combined check.
- `chat.ts`'s `checkCombinedRateLimit` will be replaced with the same shared function.

### Flow

1. Fetch user's `dailyCreditLimit` (default `20` if not set)
2. If limit is `0` → use safety cap of `500`
3. Count today's usage from `chatMessages` + `aiAnalyses` (existing queries)
4. If usage >= effective limit → reject with structured error including remaining count
5. If usage >= effective limit - `WARNING_THRESHOLD` → allow but flag warning state

### Race conditions

Rate limit checks run inside Convex **actions** (not mutations), so they are not transactional. Two concurrent requests could both pass the check. This is accepted as a soft limit — the safety cap at 500 prevents runaway costs, and for a personal coaching app the occasional off-by-one is not harmful. The spec explicitly treats the credit limit as a budget guideline, not a billing boundary.

### Day boundary

The current code uses `new Date().setHours(0, 0, 0, 0)` which resolves to **midnight UTC** (Convex actions run server-side). The UI will say "Resets daily" rather than "Resets at midnight" to avoid implying local midnight.

### `addToChat` code path

The `chatMessages.addToChat` mutation inserts assistant-role messages when analysis results are posted to chat. These are already counted by the combined usage query (they have `role: "assistant"`), and the analysis itself is gated by the rate check in `ai.ts`. No additional rate check is needed on this path, but it's noted here for completeness.

## Backend Changes

### New files

- `convex/constants.ts` — shared constants (`ALLOWED_CREDIT_LIMITS`, `DEFAULT_CREDIT_LIMIT`, `SAFETY_CAP`, `WARNING_THRESHOLD`).
- `convex/creditLimit.ts` — shared `checkCreditLimit(ctx, userId)` function used by both `chat.ts` and `ai.ts`.

### New Convex functions

- `users.updateDailyCreditLimit` — mutation to update the user's limit. Validates input is one of `ALLOWED_CREDIT_LIMITS`.
- `users.getCreditStatus` — query returning `{ used, limit, effectiveLimit, warning, chatCount, analysisCount }` for the current user. Reactive — drives all warning/limit-reached UI.
- `users.getUsageHistory` — query returning last 7 days of usage computed from `chatMessages` and `aiAnalyses` grouped by date.

### Modified functions

- `chat.sendMessage` — replace `checkCombinedRateLimit` with shared `checkCreditLimit`.
- `ai.ts` — replace `checkRateLimit` with shared `checkCreditLimit` (now counts combined usage, not just analyses).

### Schema change

```ts
// convex/schema.ts — users table, add:
dailyCreditLimit: v.optional(v.number()),
```

No migration needed — field is optional, defaults to `20` in application logic.

## Frontend Changes

### Warning and limit-reached UI — reactive approach

All warning/limit states are driven by the reactive `users.getCreditStatus` query, not by action return values. This is idiomatic for Convex and avoids changing the return type of `sendMessage`.

- Chat page subscribes to `getCreditStatus`.
- When `warning: true` → show toast: "You have N credits remaining today. [Adjust limit →]"
- When `used >= effectiveLimit` → disable chat input, show banner.

### Profile page — new "Usage & Limits" section

Added below the Strava connection section on `/profile`. Three cards:

1. **Today's Usage** — progress bar showing `used / limit` credits. Breakdown of chat messages vs analyses. "Resets daily" label.
2. **Daily Credit Limit** — pill/button selector for 20 / 40 / 60 / No Limit. Active selection highlighted in lime green (`#C8FC03`). Saves immediately on click via `users.updateDailyCreditLimit` mutation.
3. **Usage History** — 7-day bar chart computed from existing tables. Today highlighted in solid lime. Days that hit the limit get a red top border. Date labels below each bar.

### Warning toast (chat page)

Driven by reactive `getCreditStatus` query. When `warning` is true, show a toast at the top of the chat: "You have N credits remaining today. [Adjust limit →]" linking to `/profile`.

### Limit reached — chat page

- Disable chat input, placeholder text: "Daily credit limit reached. Resets daily."
- Small banner above input with link to settings.

### Limit reached — analysis buttons

- Disable "Analyze" and "Analyze Progress" buttons.
- Tooltip on hover: "No credits remaining today."

### Limit lowered below current usage

When the user selects a limit lower than their current usage, show a confirmation: "You've already used N credits today. Setting the limit to X will block further AI interactions until tomorrow. Continue?"

### No visual clutter when under limit

No persistent counter in the chat UI. Usage info lives only on the profile page. Warnings only appear when approaching or hitting the limit.

## Design Tokens

Follows existing app color scheme:
- Background: `#0A0A0A`, `#1A1A2A`
- Primary accent: `#C8FC03` (lime green)
- Text primary: white
- Text secondary: `#9CA3AF`
- Border: `rgba(255,255,255,0.1)`
- Limit-reached indicator: `#ef4444` (red)

## Edge Cases

- **User has no `dailyCreditLimit` set** → default to `20` (backwards compatible with current behavior).
- **Limit changed mid-day** → takes effect immediately. Confirmation dialog if lowering below current usage.
- **"No Limit" with safety cap** → `dailyCreditLimit: 0` maps to effective limit of `500`. UI shows "No Limit" but backend enforces 500.
- **Multiple tabs** → Convex reactivity ensures all tabs see the same usage state via `getCreditStatus`.
- **Usage history gaps** → days with no usage return 0 from the computed query; chart shows 0.
- **Concurrent requests** → soft limit, accepted. See Race Conditions section.
- **Day resets at UTC midnight** → UI says "Resets daily" to avoid timezone confusion.
