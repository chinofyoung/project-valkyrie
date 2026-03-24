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
- Dates (`startDate`, `endDate`) are calculated when transitioning from `draft` → `active`. "Next Monday" means the upcoming Monday strictly after today. If today is Monday, start = the following Monday (7 days away). This matches the existing `chat.ts` logic.
- Convex mutations execute in serializable transactions, so concurrent `startPlan` calls are safe — only one will see the current active plan and abandon it.

**Migration:** These changes are backward-compatible. Existing plans already have `startDate` and `endDate` set. The new optional fields (`startedAt`, `completedAt`) will simply be absent on existing records, which is fine.

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

**Multiple pending plans:** If the AI generates a new plan while a prior message still has an unsaved `pendingPlan`, both coexist. Each message independently shows its own preview card. The user can save whichever one they want. Old pending plans are not auto-cleared — they remain available until the user saves or the message is compacted.

**Compaction behavior:** During chat compaction, messages with unsaved `pendingPlan` fields are compacted normally. The pending plan data is lost. This is acceptable — if the user hasn't saved a plan after 30+ messages, it's stale. No special handling needed.

## Chat Confirmation Flow

### Current flow
1. AI response contains `` ```json { "trainingPlan": ... } ``` ``
2. `chat.ts` regex-extracts the JSON block
3. Plan is auto-created as `active`
4. JSON block is stripped from the displayed message

### New flow
1. AI response contains `` ```json { "trainingPlan": ... } ``` ``
2. `chat.ts` regex-extracts the JSON block
3. **Plan is NOT auto-created.** Instead, the parsed plan data is stored as `pendingPlan` on the assistant chat message.
4. JSON block is stripped from the displayed message text.
5. Chat UI detects `pendingPlan` on the message and renders a **plan preview card** below the message.
6. User clicks "Save as Draft" → calls `savePlanAsDraft` action which atomically creates the draft plan AND clears `pendingPlan` from the message.
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
- Actions: "Complete Plan" button (always available — user decides when they're done), "Abandon Plan" button

#### 2. Drafts Section
Shown only if drafts exist. Header: "Drafts" with count badge.
- List of draft plan cards, sorted by `createdAt` descending (newest first)
- Each card shows: goal, number of weeks, total workouts count
- Actions per card: "Start Plan" button, "Delete" button (trash icon)
- Starting a plan when one is already active shows confirmation dialog: "Starting this plan will abandon your current plan. Continue?"

#### 3. History Section
Collapsible section at the bottom. Header: "History" (collapsed by default).
- Shows completed and abandoned plans, sorted by `completedAt` or `createdAt` descending (newest first)
- Each entry shows: goal, date range, final completion percentage, status badge (completed/abandoned)
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

**New public mutations (all authenticate via `ctx.auth`):**
- `createDraft({ goal, weeks })` — resolves user from auth, creates plan with `status: "draft"`, no dates
- `startPlan({ planId })` — validates ownership, checks for existing active plan and abandons it, calculates dates (start = next Monday, end = start + weeks * 7), transitions to `active`, sets `startedAt`
- `completePlan({ planId })` — validates ownership and active status, transitions to `completed`, sets `completedAt`
- `abandonPlan({ planId })` — validates ownership and active status, transitions to `abandoned`
- `deletePlan({ planId })` — validates ownership, hard deletes the plan from DB

**New internal mutation:**
- `createDraftInternal({ userId, goal, weeks })` — called by `savePlanAsDraft` action from chat flow

**Modified:**
- `listForUser` — add `.sort()` client-side or order by `createdAt` descending. The existing `by_userId_status` index groups by status; the plan page will partition results by status client-side.

**Removed:**
- `updateStatus` — replaced by `startPlan`, `completePlan`, `abandonPlan`
- `create` internal mutation — replaced by `createDraftInternal`. The old auto-create-as-active flow is removed.

### `convex/chat.ts`

**`sendMessage` action changes:**
- After regex-extracting a plan JSON block, **do not** call `trainingPlans.create`
- Instead, pass the parsed plan data to `chatMessages.insert` as `pendingPlan`
- The `cleanedResponse` logic (stripping JSON block) stays the same

### `convex/chatMessages.ts`
- Update `insert` mutation to accept optional `pendingPlan` field
- Add new internal mutation: `clearPendingPlan({ messageId })` — sets `pendingPlan` to undefined
- Ensure `list` query returns `pendingPlan` field

### New: `convex/trainingPlans.ts` — `savePlanAsDraft` action
A public **action** that atomically:
1. Calls `createDraftInternal` to create the draft plan
2. Calls `chatMessages.clearPendingPlan` to clear the pending plan from the message

This ensures the draft is created and the pending plan is cleared together. If either fails, the action throws and neither side-effect persists (Convex actions with sequential mutations).

### `app/(app)/plan/page.tsx`
Full rewrite:
- Query `trainingPlans.listForUser` (returns all plans)
- Partition plans by status: active, draft, completed/abandoned
- Render three sections as described above
- Implement start/complete/abandon/delete actions with confirmation dialogs

### `app/(app)/chat/page.tsx`
- Check each assistant message for `pendingPlan`
- Render plan preview card inline below message text
- "Save as Draft" button calls `trainingPlans.savePlanAsDraft`
- After save, show "Saved to Drafts" disabled state with link to `/plan`

### `components/chat-message.tsx`
- Accept optional `pendingPlan` prop
- Render plan preview card when present

## Testing Considerations

- Verify only one active plan exists at any time after start/abandon operations
- Verify draft plans have no dates; active plans always have dates
- Verify pendingPlan is cleared after saving as draft (atomic operation)
- Verify deleting an active plan doesn't leave orphaned state
- Verify the chat confirmation flow end-to-end: AI generates → preview shown → user saves → draft appears on plan page
- Verify starting a draft when another plan is active shows confirmation and properly abandons the old plan
- Verify multiple unsaved pendingPlans on different messages coexist correctly
- Verify compaction of messages with unsaved pendingPlan does not cause errors
- Verify "Complete Plan" works at any progress level
- Verify existing plans (without startedAt/completedAt) render correctly after schema change

## Out of Scope

- Inline plan editing on the plan page (modifications go through chat)
- Multiple simultaneous active plans
- Plan templates or presets
- Plan sharing between users
- Notifications or reminders for upcoming workouts
