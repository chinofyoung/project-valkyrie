# Training Plans Redesign — Design Spec

## Overview

Redesign the training plan feature to support multiple plans, a draft-first workflow, explicit user confirmation before saving, and a plan management page with active/drafts/history sections.

## Current State

- AI generates a plan in chat → JSON block auto-extracted via regex → plan created immediately as `active`
- Only one active plan at a time; creating a new one auto-abandons the previous
- Plan page only shows the single active plan or an empty state
- Statuses: `active | completed | abandoned`
- Users can toggle workouts as completed and abandon the plan

## Design Decisions

1. **Draft-first workflow** — Plans are created as drafts. User explicitly starts one to make it active.
2. **One active plan at a time** — Starting a new plan abandons the current active one.
3. **Explicit confirmation in chat** — AI generates a plan, user says "save it" before it becomes a draft.
4. **Modifications through chat only** — No inline editing on the plan page. Users ask the AI to modify plans.
5. **Plan page as management hub** — Active plan at top, drafts in the middle, history at the bottom.
6. **All deletes require confirmation** — Regardless of plan status.

## Data Model Changes

### `trainingPlans` table

**Status field** — add `"draft"`:
```
status: "draft" | "active" | "completed" | "abandoned"
```

**Date fields** — make optional (drafts don't have dates):
```
startDate: v.optional(v.number())
endDate: v.optional(v.number())
```

**New fields:**
```
startedAt: v.optional(v.number())   // timestamp when draft → active
completedAt: v.optional(v.number()) // timestamp when active → completed
```

**Status lifecycle:**
```
AI generates → user confirms in chat → draft
                                         ↓
                                  user starts → active (dates calculated: start = next Monday)
                                                  ↓
                                     user completes → completed
                                     user abandons  → abandoned

Any status → user deletes → hard delete from DB
```

**Key constraints:**
- Only one plan may have `status: "active"` per user at any time.
- Starting a draft auto-abandons the current active plan (with user confirmation in UI).
- Dates (`startDate`, `endDate`) are calculated when transitioning from `draft` → `active`. Start = next Monday, end = start + (weeks.length * 7 days).

### `chatMessages` table

**New optional field:**
```
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
}))
```

This stores the parsed plan JSON on the assistant message, enabling the chat UI to render a preview card with a "Save as Draft" button.

## Chat Confirmation Flow

### Current flow
1. AI response contains `\`\`\`json { "trainingPlan": ... } \`\`\``
2. `chat.ts` regex-extracts the JSON block
3. Plan is auto-created as `active`
4. JSON block is stripped from the displayed message

### New flow
1. AI response contains `\`\`\`json { "trainingPlan": ... } \`\`\``
2. `chat.ts` regex-extracts the JSON block
3. **Plan is NOT auto-created.** Instead, the parsed plan data is stored as `pendingPlan` on the assistant chat message.
4. JSON block is stripped from the displayed message text.
5. Chat UI detects `pendingPlan` on the message and renders a **plan preview card** below the message.
6. User clicks "Save as Draft" → calls a new mutation that creates the plan as `draft` and clears `pendingPlan` from the message.
7. If the user asks the AI for changes instead, the AI generates a new response with an updated `pendingPlan`.

### Plan preview card (in chat)
- Displays: goal, number of weeks, total workout count
- Button: "Save as Draft" (accent color `#C8FC03`)
- After saving: button becomes "Saved to Drafts" (disabled) with a link to `/plan`

## Plan Page Redesign

### Layout (top to bottom)

#### 1. Active Plan Section
Shown only if an active plan exists. Identical to today's plan view:
- Goal title, date range, progress bar
- Week sections (current week expanded by default)
- Workout toggles (check/uncheck completed)
- Actions: "Complete Plan" button, "Abandon Plan" button

#### 2. Drafts Section
Shown only if drafts exist. Header: "Drafts" with count badge.
- List of draft plan cards
- Each card shows: goal, number of weeks, total workouts count
- Actions per card: "Start Plan" button, "Delete" button (trash icon)
- Starting a plan when one is already active shows confirmation dialog: "Starting this plan will abandon your current plan. Continue?"

#### 3. History Section
Collapsible section at the bottom. Header: "History" (collapsed by default).
- Shows completed and abandoned plans
- Each entry shows: goal, date range, final completion percentage, status badge
- Action: "Delete" button (trash icon)

### Empty state
When no plans exist at all (no drafts, no active, no history):
- Same as today — prompt to go to chat and ask the AI coach for a plan

## Backend Changes

### `convex/schema.ts`
- Add `"draft"` to `trainingPlans.status` union
- Make `startDate` and `endDate` optional
- Add `startedAt` and `completedAt` optional fields
- Add `pendingPlan` optional field to `chatMessages`

### `convex/trainingPlans.ts`

**New mutations:**
- `createDraft({ userId, goal, weeks })` — creates plan with `status: "draft"`, no dates
- `startPlan({ planId })` — validates only one active, abandons current if exists, sets dates, transitions to `active`
- `completePlan({ planId })` — transitions active → completed, sets `completedAt`
- `deletePlan({ planId })` — hard deletes the plan from DB

**Modified:**
- `create` internal mutation — update to support optional dates and new statuses
- `listForUser` — already returns all plans, no change needed

**Remove or deprecate:**
- `updateStatus` — replaced by specific `startPlan`, `completePlan`, and new abandon logic

### `convex/chat.ts`

**`sendMessage` action changes:**
- After regex-extracting a plan JSON block, **do not** call `trainingPlans.create`
- Instead, pass the parsed plan data to `chatMessages.insert` as `pendingPlan`
- The `cleanedResponse` logic (stripping JSON block) stays the same

### `convex/chatMessages.ts`
- Update `insert` mutation to accept optional `pendingPlan` field
- Add new mutation: `clearPendingPlan({ messageId })` — sets `pendingPlan` to undefined
- Ensure `list` query returns `pendingPlan` field

### `app/(app)/plan/page.tsx`
Full rewrite:
- Query `trainingPlans.listForUser` (already returns all plans)
- Partition plans by status: active, draft, completed/abandoned
- Render three sections as described above
- Implement start/complete/abandon/delete actions with confirmation dialogs

### `app/(app)/chat/page.tsx`
- Check each assistant message for `pendingPlan`
- Render plan preview card inline below message text
- "Save as Draft" button calls `trainingPlans.createDraft` then `chatMessages.clearPendingPlan`
- After save, show "Saved to Drafts" disabled state with link to `/plan`

### `components/chat-message.tsx`
- Accept optional `pendingPlan` prop
- Render plan preview card when present

## Testing Considerations

- Verify only one active plan exists at any time after start/abandon operations
- Verify draft plans have no dates; active plans always have dates
- Verify pendingPlan is cleared after saving as draft
- Verify deleting an active plan doesn't leave orphaned state
- Verify the chat confirmation flow end-to-end: AI generates → preview shown → user saves → draft appears on plan page
- Verify starting a draft when another plan is active shows confirmation and properly abandons the old plan

## Out of Scope

- Inline plan editing on the plan page (modifications go through chat)
- Multiple simultaneous active plans
- Plan templates or presets
- Plan sharing between users
- Notifications or reminders for upcoming workouts
