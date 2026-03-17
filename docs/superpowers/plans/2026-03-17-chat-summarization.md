# Chat Sliding Window + Summarization Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Limit chat message storage to ~20 messages per user by summarizing older messages into a running summary, preserving context while reducing DB usage.

**Architecture:** After each AI response, a background job checks if messages exceed 30. If so, it summarizes the oldest batch via Claude, stores the summary on the user record, and deletes the old messages. The summary is prepended to the system prompt on subsequent chats.

**Tech Stack:** Convex (mutations, actions, scheduler), Anthropic Claude API

---

### Task 1: Add `chatSummary` field to users schema

**Files:**
- Modify: `convex/schema.ts:6-20`

- [ ] **Step 1: Add chatSummary to users table**

Add `chatSummary: v.optional(v.string())` to the users table definition, after `lastSyncAt`:

```ts
lastSyncAt: v.optional(v.number()),
chatSummary: v.optional(v.string()),
```

- [ ] **Step 2: Verify Convex compiles**

Run: `npx convex dev --once`
Expected: "Convex functions ready!"

- [ ] **Step 3: Commit**

```bash
git add convex/schema.ts
git commit -m "feat: add chatSummary field to users table"
```

---

### Task 2: Add helper queries and mutations for compaction

**Files:**
- Modify: `convex/chatMessages.ts`
- Modify: `convex/users.ts`

- [ ] **Step 1: Add `countForUser` internal query to `chatMessages.ts`**

Returns the total message count for a user:

```ts
export const countForUser = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("chatMessages")
      .withIndex("by_userId_createdAt", (q) => q.eq("userId", args.userId))
      .collect();
    return messages.length;
  },
});
```

- [ ] **Step 2: Add `listAllForUser` internal query to `chatMessages.ts`**

Returns all messages for a user ordered by createdAt asc (used by compaction to read full history):

```ts
export const listAllForUser = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("chatMessages")
      .withIndex("by_userId_createdAt", (q) => q.eq("userId", args.userId))
      .order("asc")
      .collect();
  },
});
```

- [ ] **Step 3: Add `deleteMessages` internal mutation to `chatMessages.ts`**

Deletes a batch of messages by ID:

```ts
export const deleteMessages = internalMutation({
  args: {
    messageIds: v.array(v.id("chatMessages")),
  },
  handler: async (ctx, args) => {
    for (const id of args.messageIds) {
      await ctx.db.delete(id);
    }
  },
});
```

- [ ] **Step 4: Add `updateChatSummary` internal mutation to `users.ts`**

```ts
export const updateChatSummary = internalMutation({
  args: {
    userId: v.id("users"),
    chatSummary: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.userId, { chatSummary: args.chatSummary });
  },
});
```

- [ ] **Step 5: Verify Convex compiles**

Run: `npx convex dev --once`
Expected: "Convex functions ready!"

- [ ] **Step 6: Commit**

```bash
git add convex/chatMessages.ts convex/users.ts
git commit -m "feat: add helper queries/mutations for chat compaction"
```

---

### Task 3: Implement `compactHistory` internal action

**Files:**
- Modify: `convex/chat.ts`

- [ ] **Step 1: Add the COMPACT_THRESHOLD and KEEP_RECENT constants**

Add near the top of `chat.ts`, after the existing helpers:

```ts
const COMPACT_THRESHOLD = 30;
const KEEP_RECENT = 20;
```

- [ ] **Step 2: Add `compactHistory` internal action**

Add at the bottom of `chat.ts`:

```ts
import { internalAction } from "./_generated/server";

export const compactHistory = internalAction({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const { userId } = args;

    // 1. Count messages
    const count = await ctx.runQuery(
      internal.chatMessages.countForUser,
      { userId }
    ) as number;

    if (count <= COMPACT_THRESHOLD) return;

    // 2. Load all messages
    const allMessages: any[] = await ctx.runQuery(
      internal.chatMessages.listAllForUser,
      { userId }
    );

    // 3. Split: oldest to summarize, newest to keep
    const toSummarize = allMessages.slice(0, allMessages.length - KEEP_RECENT);
    if (toSummarize.length === 0) return;

    // 4. Load existing summary
    const user = await ctx.runQuery(internal.users.getById, { userId });
    const existingSummary = user?.chatSummary ?? "";

    // 5. Build summarization prompt
    const transcript = toSummarize
      .map((m: any) => `${m.role}: ${m.content}`)
      .join("\n");

    const prompt = existingSummary
      ? `Here is the existing conversation summary:\n${existingSummary}\n\nHere are newer messages to incorporate:\n${transcript}\n\nProduce an updated summary that captures all key decisions, preferences, goals, and context from both the existing summary and the new messages. Keep it concise (max 500 words). Write in third person about the athlete.`
      : `Summarize this coaching conversation. Capture key decisions, athlete preferences, goals, training history context, and any plans discussed. Keep it concise (max 500 words). Write in third person about the athlete.\n\n${transcript}`;

    // 6. Call Claude to summarize
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      console.error("compactHistory: ANTHROPIC_API_KEY not set, skipping");
      return;
    }

    const client = new Anthropic({ apiKey });
    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const summary = response.content
      .filter((block) => block.type === "text")
      .map((block) => (block as { type: "text"; text: string }).text)
      .join("\n");

    // 7. Store summary on user record
    await ctx.runMutation(internal.users.updateChatSummary, {
      userId,
      chatSummary: summary,
    });

    // 8. Delete old messages
    await ctx.runMutation(internal.chatMessages.deleteMessages, {
      messageIds: toSummarize.map((m: any) => m._id),
    });
  },
});
```

- [ ] **Step 3: Update the import at top of chat.ts**

Change:
```ts
import { action } from "./_generated/server";
```
To:
```ts
import { action, internalAction } from "./_generated/server";
```

- [ ] **Step 4: Verify Convex compiles**

Run: `npx convex dev --once`
Expected: "Convex functions ready!"

- [ ] **Step 5: Commit**

```bash
git add convex/chat.ts
git commit -m "feat: add compactHistory internal action for chat summarization"
```

---

### Task 4: Wire compaction into sendMessage and inject summary into context

**Files:**
- Modify: `convex/chat.ts`

- [ ] **Step 1: Schedule compaction after AI response**

In the `sendMessage` handler, after the assistant message is inserted (after line 252), add:

```ts
// Schedule background compaction
await ctx.scheduler.runAfter(0, internal.chat.compactHistory, {
  userId: user._id,
});
```

- [ ] **Step 2: Include chatSummary in the system prompt**

In the `sendMessage` handler, after loading the user (line 84), the user object already contains `chatSummary`. Update the `contextPreamble` construction to prepend the summary.

After the existing `contextPreamble` is built (after line 174), add:

```ts
const summaryBlock = user.chatSummary
  ? `CONVERSATION HISTORY SUMMARY:\n${user.chatSummary}\n\n`
  : "";

const systemPrompt = `${BASE_COACHING_PROMPT}\n\n${summaryBlock}${contextPreamble}`;
```

And remove the existing `systemPrompt` line:
```ts
// Remove this line:
const systemPrompt = `${BASE_COACHING_PROMPT}\n\n${contextPreamble}`;
```

- [ ] **Step 3: Verify Convex compiles**

Run: `npx convex dev --once`
Expected: "Convex functions ready!"

- [ ] **Step 4: Verify Next.js builds**

Run: `npx next build`
Expected: Compiled successfully

- [ ] **Step 5: Commit**

```bash
git add convex/chat.ts
git commit -m "feat: wire chat compaction and inject summary into AI context"
```
