# Add to Chat + Compact Command Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "Add to Chat" button on AI analysis cards that inserts analysis context into chat (showing a short label in UI), and a manual "/compact" button in the chat header to trigger chat compaction on demand.

**Architecture:** Add `displayText` optional field to `chatMessages` schema. The insert mutation accepts it, the chat page renders it when present, and the AI always receives `content`. A new `addToChat` mutation inserts analysis with a display label. A `compactNow` client-callable action wraps the existing `compactHistory` without threshold.

**Tech Stack:** Convex, Next.js, React

---

### Task 1: Add `displayText` field to chatMessages schema and insert mutation

**Files:**
- Modify: `convex/schema.ts`
- Modify: `convex/chatMessages.ts`

- [ ] **Step 1: Add displayText to chatMessages table in schema**

In `convex/schema.ts`, add `displayText: v.optional(v.string())` to the `chatMessages` table definition, after the `content` field:

```ts
  chatMessages: defineTable({
    userId: v.id("users"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    displayText: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_userId_createdAt", ["userId", "createdAt"]),
```

- [ ] **Step 2: Update `insert` mutation to accept displayText**

In `convex/chatMessages.ts`, update the `insert` mutation args and handler:

```ts
export const insert = internalMutation({
  args: {
    userId: v.id("users"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    displayText: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const content =
      args.role === "user" ? args.content.slice(0, 2000) : args.content;

    return await ctx.db.insert("chatMessages", {
      userId: args.userId,
      role: args.role,
      content,
      ...(args.displayText ? { displayText: args.displayText } : {}),
      createdAt: Date.now(),
    });
  },
});
```

- [ ] **Step 3: Add `addToChat` mutation to chatMessages.ts**

This is a client-callable mutation (not internal) that inserts an analysis as a user context message:

```ts
export const addToChat = mutation({
  args: {
    content: v.string(),
    displayText: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();

    if (!user) throw new Error("User not found");

    return await ctx.db.insert("chatMessages", {
      userId: user._id,
      role: "user",
      content: args.content,
      displayText: args.displayText,
      createdAt: Date.now(),
    });
  },
});
```

Note: Add `mutation` to the imports from `./_generated/server`. The current import is:
```ts
import { internalMutation, internalQuery, query } from "./_generated/server";
```
Change to:
```ts
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
```

- [ ] **Step 4: Verify Convex compiles**

Run: `npx convex dev --once`
Expected: "Convex functions ready!"

- [ ] **Step 5: Commit**

```bash
git add convex/schema.ts convex/chatMessages.ts
git commit -m "feat: add displayText field and addToChat mutation"
```

---

### Task 2: Update ChatMessage component to render displayText

**Files:**
- Modify: `components/chat-message.tsx`

- [ ] **Step 1: Add displayText to the props interface**

```ts
interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  displayText?: string;
  createdAt: number;
}
```

- [ ] **Step 2: Update the component to use displayText when present**

Update the function signature and the user message rendering. When `displayText` is present, render it with a distinct "context" style — italic, muted, with a small icon:

```ts
export default function ChatMessage({ role, content, displayText, createdAt }: ChatMessageProps) {
  const isUser = role === "user";

  // Context message (analysis added to chat)
  if (isUser && displayText) {
    return (
      <div className="flex flex-col items-end gap-1">
        <div
          className="max-w-[85%] px-4 py-2.5 text-sm leading-relaxed flex items-center gap-2"
          style={{
            background: "rgba(200,252,3,0.08)",
            border: "1px solid rgba(200,252,3,0.15)",
            borderRadius: "16px 16px 4px 16px",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C8FC03" strokeWidth="2">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
          <span className="text-white/60 italic text-xs">{displayText}</span>
        </div>
        <span className="text-xs text-white/40 pr-1">{relativeTime(createdAt)}</span>
      </div>
    );
  }

  if (isUser) {
    // ... existing user message rendering (unchanged)
  }

  // ... existing assistant message rendering (unchanged)
}
```

- [ ] **Step 3: Commit**

```bash
git add components/chat-message.tsx
git commit -m "feat: render displayText as context bubble in chat"
```

---

### Task 3: Update chat page to pass displayText to ChatMessage

**Files:**
- Modify: `app/(app)/chat/page.tsx`

- [ ] **Step 1: Pass displayText prop to ChatMessage**

In the messages map (around line 147), update:

```tsx
{messages.map((msg: any) => (
  <ChatMessage
    key={msg._id}
    role={msg.role}
    content={msg.content}
    displayText={msg.displayText}
    createdAt={msg.createdAt}
  />
))}
```

- [ ] **Step 2: Commit**

```bash
git add app/(app)/chat/page.tsx
git commit -m "feat: pass displayText to ChatMessage component"
```

---

### Task 4: Add "Add to Chat" button to AiInsightCard

**Files:**
- Modify: `components/ai-insight-card.tsx`

- [ ] **Step 1: Add onAddToChat prop to the interface**

```ts
interface AiInsightCardProps {
  content: string | null;
  loading: boolean;
  onAnalyze: () => void;
  onAddToChat?: (content: string) => void;
  label: string;
}
```

- [ ] **Step 2: Update the component signature and add the button**

Update the function signature:
```ts
export function AiInsightCard({ content, loading, onAnalyze, onAddToChat, label }: AiInsightCardProps) {
```

In the content state (where `!collapsed` shows the "Re-analyze" button, around line 119-126), add an "Add to Chat" button next to it:

```tsx
{!collapsed && (
  <div className="flex items-center gap-4 mt-4">
    <button
      onClick={onAnalyze}
      className="text-xs text-[#9CA3AF] hover:text-[#C8FC03] transition-colors underline underline-offset-2"
    >
      Re-analyze
    </button>
    {onAddToChat && content && (
      <button
        onClick={() => onAddToChat(content)}
        className="text-xs text-[#9CA3AF] hover:text-[#C8FC03] transition-colors underline underline-offset-2"
      >
        Add to Chat
      </button>
    )}
  </div>
)}
```

This replaces the existing standalone Re-analyze button.

- [ ] **Step 3: Commit**

```bash
git add components/ai-insight-card.tsx
git commit -m "feat: add 'Add to Chat' button to AiInsightCard"
```

---

### Task 5: Wire "Add to Chat" in activity detail page and dashboard

**Files:**
- Modify: `app/(app)/activities/[id]/page.tsx`
- Modify: `app/(app)/dashboard/page.tsx`

- [ ] **Step 1: Wire in activity detail page**

In `app/(app)/activities/[id]/page.tsx`:

Add imports:
```ts
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
```

Inside the component, add:
```ts
const router = useRouter();
const addToChat = useMutation(api.chatMessages.addToChat);
```

Add a handler:
```ts
async function handleAddToChat(analysisContent: string) {
  await addToChat({
    content: analysisContent,
    displayText: `— ${activity.name} analysis added`,
  });
  router.push("/chat");
}
```

Update the AiInsightCard:
```tsx
<AiInsightCard
  content={existingAnalysis?.content ?? null}
  loading={analyzing}
  onAnalyze={handleAnalyzeRun}
  onAddToChat={handleAddToChat}
  label="Analyze Run"
/>
```

- [ ] **Step 2: Wire in dashboard page**

In `app/(app)/dashboard/page.tsx`:

Add imports (useRouter and useMutation should be added if not present):
```ts
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
```

Inside the component, add:
```ts
const router = useRouter();
const addToChat = useMutation(api.chatMessages.addToChat);
```

Add a handler:
```ts
async function handleAddInsightToChat(insightContent: string) {
  await addToChat({
    content: insightContent,
    displayText: "— Progress analysis added",
  });
  router.push("/chat");
}
```

Update the AiInsightCard (around line 360):
```tsx
<AiInsightCard
  content={latestInsight?.content ?? null}
  loading={analyzing}
  onAnalyze={handleAnalyzeProgress}
  onAddToChat={handleAddInsightToChat}
  label="Analyze Progress"
/>
```

- [ ] **Step 3: Verify Next.js builds**

Run: `npx next build`
Expected: Compiled successfully

- [ ] **Step 4: Commit**

```bash
git add app/(app)/activities/[id]/page.tsx app/(app)/dashboard/page.tsx
git commit -m "feat: wire Add to Chat on activity detail and dashboard"
```

---

### Task 6: Add `/compact` button to chat header

**Files:**
- Modify: `convex/chat.ts`
- Modify: `app/(app)/chat/page.tsx`

- [ ] **Step 1: Add `compactNow` client-callable action to `chat.ts`**

Add at the bottom of `convex/chat.ts`, before the existing `compactHistory`:

```ts
export const compactNow = action({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    // @ts-ignore
    const user = await ctx.runQuery(api.users.currentUser, {});
    if (!user) throw new Error("User not found");

    const userId = user._id;

    // Load all messages
    const allMessages: any[] = await ctx.runQuery(
      internal.chatMessages.listAllForUser,
      { userId }
    );

    if (allMessages.length <= KEEP_RECENT) return;

    // Split: oldest to summarize, newest to keep
    const toSummarize = allMessages.slice(0, allMessages.length - KEEP_RECENT);

    // Load existing summary
    const existingSummary = user.chatSummary ?? "";

    // Build summarization prompt
    const transcript = toSummarize
      .map((m: any) => `${m.role}: ${m.content}`)
      .join("\n");

    const prompt = existingSummary
      ? `Here is the existing conversation summary:\n${existingSummary}\n\nHere are newer messages to incorporate:\n${transcript}\n\nProduce an updated summary that captures all key decisions, preferences, goals, and context from both the existing summary and the new messages. Keep it concise (max 500 words). Write in third person about the athlete.`
      : `Summarize this coaching conversation. Capture key decisions, athlete preferences, goals, training history context, and any plans discussed. Keep it concise (max 500 words). Write in third person about the athlete.\n\n${transcript}`;

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("ANTHROPIC_API_KEY not set");

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

    await ctx.runMutation(internal.users.updateChatSummary, {
      userId,
      chatSummary: summary,
    });

    await ctx.runMutation(internal.chatMessages.deleteMessages, {
      messageIds: toSummarize.map((m: any) => m._id),
    });
  },
});
```

- [ ] **Step 2: Add compact button to chat page header**

In `app/(app)/chat/page.tsx`, add state and action:

```ts
const [compacting, setCompacting] = useState(false);
const compactNow = useAction(api.chat.compactNow);

async function handleCompact() {
  setCompacting(true);
  try {
    await compactNow({});
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Compact failed";
    setError(msg);
  } finally {
    setCompacting(false);
  }
}
```

In the header div (around line 64-78), add a compact button between the header text and the "Online" badge:

```tsx
<div className="flex items-center justify-between px-4 py-4 border-b border-white/10">
  <div>
    <h1 className="text-xl font-bold text-white">AI Coach</h1>
    <p className="text-xs text-white/50 mt-0.5">Always aware of your training</p>
  </div>
  <div className="flex items-center gap-2">
    <button
      onClick={handleCompact}
      disabled={compacting}
      title="Compact chat"
      className="p-2 rounded-lg hover:bg-white/5 transition-colors disabled:opacity-50"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke={compacting ? "#C8FC03" : "#9CA3AF"}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={compacting ? "animate-spin" : ""}
      >
        <path d="M4 14h6m-6-4h6m4 0h6m-6 4h6M12 2v20" />
      </svg>
    </button>
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10" style={{ background: "#1A1A2A" }}>
      <span className="w-2 h-2 rounded-full" style={{ background: "#C8FC03" }} />
      <span className="text-xs font-medium" style={{ color: "#C8FC03" }}>Online</span>
    </div>
  </div>
</div>
```

- [ ] **Step 3: Verify Convex compiles**

Run: `npx convex dev --once`
Expected: "Convex functions ready!"

- [ ] **Step 4: Verify Next.js builds**

Run: `npx next build`
Expected: Compiled successfully

- [ ] **Step 5: Commit**

```bash
git add convex/chat.ts app/(app)/chat/page.tsx
git commit -m "feat: add /compact button to chat header"
```
