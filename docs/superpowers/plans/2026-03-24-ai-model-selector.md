# AI Model Selector & OpenRouter Credits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users pick their preferred OpenRouter model from a dropdown on the Settings page and view their remaining OpenRouter credit balance.

**Architecture:** New shared `convex/models.ts` defines the allowed model list (single source of truth). Schema gets a `preferredModel` field on users. AI actions read user preference and validate before API calls. New `ModelSelector` component on the profile page shows grouped dropdown + credit balance.

**Tech Stack:** Convex (backend), Next.js 16 + React 19 (frontend), OpenAI SDK (OpenRouter), Tailwind CSS v4

**Spec:** `docs/superpowers/specs/2026-03-24-ai-model-selector-design.md`

---

### Task 1: Create shared model constants

**Files:**
- Create: `convex/models.ts`

This file is the single source of truth for allowed models — used by both backend validation and frontend UI.

- [ ] **Step 1: Create `convex/models.ts`**

```ts
export const DEFAULT_MODEL = "anthropic/claude-sonnet-4";

export type ModelTier = "free" | "paid";

export interface ModelOption {
  id: string;
  name: string;
  tier: ModelTier;
  inputCostPer1M: number;
  outputCostPer1M: number;
}

// Pricing verified 2026-03-24 — review when adding/updating models
export const AVAILABLE_MODELS: ModelOption[] = [
  // Free
  { id: "meta-llama/llama-4-maverick:free", name: "Llama 4 Maverick", tier: "free", inputCostPer1M: 0, outputCostPer1M: 0 },
  { id: "google/gemini-2.0-flash-exp:free", name: "Gemini 2.0 Flash", tier: "free", inputCostPer1M: 0, outputCostPer1M: 0 },
  { id: "qwen/qwen3-8b:free", name: "Qwen3 8B", tier: "free", inputCostPer1M: 0, outputCostPer1M: 0 },
  // Paid
  { id: "anthropic/claude-sonnet-4", name: "Claude Sonnet 4", tier: "paid", inputCostPer1M: 3.0, outputCostPer1M: 15.0 },
  { id: "anthropic/claude-3.5-haiku", name: "Claude Haiku 3.5", tier: "paid", inputCostPer1M: 0.8, outputCostPer1M: 4.0 },
  { id: "openai/gpt-4o", name: "GPT-4o", tier: "paid", inputCostPer1M: 2.5, outputCostPer1M: 10.0 },
  { id: "openai/gpt-4o-mini", name: "GPT-4o Mini", tier: "paid", inputCostPer1M: 0.15, outputCostPer1M: 0.6 },
  { id: "google/gemini-2.5-pro", name: "Gemini 2.5 Pro", tier: "paid", inputCostPer1M: 1.25, outputCostPer1M: 10.0 },
  { id: "meta-llama/llama-4-maverick", name: "Llama 4 Maverick", tier: "paid", inputCostPer1M: 0.2, outputCostPer1M: 0.6 },
];

export const ALLOWED_MODEL_IDS = AVAILABLE_MODELS.map((m) => m.id);

export function isAllowedModel(modelId: string): boolean {
  return ALLOWED_MODEL_IDS.includes(modelId);
}

export function getModelOrDefault(modelId: string | undefined): string {
  if (modelId && isAllowedModel(modelId)) return modelId;
  return DEFAULT_MODEL;
}
```

- [ ] **Step 2: Commit**

```bash
git add convex/models.ts
git commit -m "feat: add shared model constants for OpenRouter model selection"
```

---

### Task 2: Add `preferredModel` to schema and user mutations

**Files:**
- Modify: `convex/schema.ts:5-22` (users table)
- Modify: `convex/users.ts` (add mutation + action)

- [ ] **Step 1: Add `preferredModel` field to users table in `convex/schema.ts`**

Add after line 20 (`dailyCreditLimit`):
```ts
    preferredModel: v.optional(v.string()),
```

- [ ] **Step 2: Add `updatePreferredModel` mutation to `convex/users.ts`**

Add this import at the top:
```ts
import { isAllowedModel } from "./models";
```

Add this mutation after the existing `updateDailyCreditLimit` (after line 172):
```ts
export const updatePreferredModel = mutation({
  args: { modelId: v.string() },
  handler: async (ctx, args) => {
    if (!isAllowedModel(args.modelId)) {
      throw new Error("Invalid model selection");
    }
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");
    const user = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    if (!user) throw new Error("User not found");
    await ctx.db.patch(user._id, { preferredModel: args.modelId });
  },
});
```

- [ ] **Step 3: Add `getOpenRouterCredits` action to `convex/users.ts`**

Add `action` to the import from `./_generated/server` at line 1:
```ts
import { action, internalMutation, internalQuery, mutation, query } from "./_generated/server";
```

Add this action after `updatePreferredModel`:
```ts
export const getOpenRouterCredits = action({
  handler: async () => {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) return null;

    try {
      const res = await fetch("https://openrouter.ai/api/v1/auth/key", {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) return null;
      const data = await res.json();
      // data.data has: label, usage, limit, is_free_tier, rate_limit
      const { limit, usage } = data.data;
      return {
        limit: limit as number | null,       // null = unlimited
        usage: usage as number,              // total spent in dollars
        remaining: limit != null ? limit - usage : null,  // null = unlimited
        isUnlimited: limit == null,
      };
    } catch {
      return null;
    }
  },
});
```

- [ ] **Step 4: Commit**

```bash
git add convex/schema.ts convex/users.ts
git commit -m "feat: add preferredModel to schema and model/credits endpoints"
```

---

### Task 3: Update AI actions to use user's preferred model

**Files:**
- Modify: `convex/ai.ts` — lines 1, 257, 272, 463, 477
- Modify: `convex/chat.ts` — lines 1, 244

**Do NOT change `compactNow` (line 376) or `compactHistory` (line 444) in `convex/chat.ts`** — these internal summarization tasks stay on hardcoded `anthropic/claude-sonnet-4` for reliability.

- [ ] **Step 1: Update `convex/ai.ts` — add import and resolve model**

Add import at line 1:
```ts
import { getModelOrDefault } from "./models";
```

In `analyzeRun`, add this line before the `client.chat.completions.create()` call (before line 256):
```ts
    const model = getModelOrDefault(user.preferredModel);
```

Then make these exact replacements in `analyzeRun`:

Line 257 — change:
```ts
      model: "anthropic/claude-sonnet-4",
```
to:
```ts
      model,
```

Line 272 — change:
```ts
      model: "anthropic/claude-sonnet-4",
```
to:
```ts
      model,
```

- [ ] **Step 2: Update `convex/ai.ts` — `analyzeProgress`**

In `analyzeProgress`, add this line before the `client.chat.completions.create()` call (before line 462):
```ts
    const model = getModelOrDefault(user.preferredModel);
```

Line 463 — change:
```ts
      model: "anthropic/claude-sonnet-4",
```
to:
```ts
      model,
```

Line 477 — change:
```ts
      model: "anthropic/claude-sonnet-4",
```
to:
```ts
      model,
```

- [ ] **Step 3: Update `convex/chat.ts` — `sendMessage` only**

Add import at line 1:
```ts
import { getModelOrDefault } from "./models";
```

In `sendMessage`, after the user is fetched (after line 101), add:
```ts
    const model = getModelOrDefault(user.preferredModel);
```

Line 244 — change:
```ts
          model: "anthropic/claude-sonnet-4",
```
to:
```ts
          model,
```

- [ ] **Step 4: Commit**

```bash
git add convex/ai.ts convex/chat.ts
git commit -m "feat: use user's preferred model in AI actions"
```

---

### Task 4: Build the ModelSelector component

**Files:**
- Create: `components/model-selector.tsx`

- [ ] **Step 1: Create `components/model-selector.tsx`**

```tsx
"use client";

import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { AVAILABLE_MODELS, DEFAULT_MODEL } from "@/convex/models";
import type { ModelOption } from "@/convex/models";
import { useState, useEffect, useRef } from "react";

export function ModelSelector() {
  const user = useQuery(api.users.currentUser);
  const updateModel = useMutation(api.users.updatePreferredModel);
  const fetchCredits = useAction(api.users.getOpenRouterCredits);

  const [credits, setCredits] = useState<{
    limit: number | null;
    usage: number;
    remaining: number | null;
    isUnlimited: boolean;
  } | null>(null);
  const [creditsLoading, setCreditsLoading] = useState(true);
  const [creditsError, setCreditsError] = useState(false);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetchCredits()
      .then((result) => {
        if (result) {
          setCredits(result);
        } else {
          setCreditsError(true);
        }
      })
      .catch(() => setCreditsError(true))
      .finally(() => setCreditsLoading(false));
  }, [fetchCredits]);

  if (!user) return null;

  const currentModel = user.preferredModel ?? DEFAULT_MODEL;
  const freeModels = AVAILABLE_MODELS.filter((m) => m.tier === "free");
  const paidModels = AVAILABLE_MODELS.filter((m) => m.tier === "paid");

  const handleSelect = async (modelId: string) => {
    if (modelId === currentModel) return;
    await updateModel({ modelId });
  };

  const renderModelRow = (model: ModelOption) => {
    const isActive = currentModel === model.id;
    return (
      <button
        key={model.id}
        onClick={() => handleSelect(model.id)}
        className={`w-full flex items-center justify-between rounded-lg border px-4 py-3 text-sm transition-colors ${
          isActive
            ? "border-[#C8FC03] bg-[#C8FC03]/10 text-[#C8FC03]"
            : "border-white/10 text-gray-400 hover:border-white/20 hover:text-gray-300"
        }`}
      >
        <span className="font-medium">{model.name}</span>
        <span className="text-xs tabular-nums">
          {model.inputCostPer1M === 0 && model.outputCostPer1M === 0
            ? "Free"
            : `$${model.inputCostPer1M} / $${model.outputCostPer1M}`}
        </span>
      </button>
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-white">AI Model</h2>
        <p className="text-sm text-gray-400">
          Choose which model powers your coaching
        </p>
      </div>

      {/* Model list */}
      <div className="rounded-xl border border-white/10 bg-[#1A1A2A] p-5 space-y-4">
        {/* Pricing header */}
        <div className="flex items-center justify-between text-xs text-gray-500 px-4">
          <span>Model</span>
          <span>Input / Output per 1M tokens</span>
        </div>

        {/* Free tier */}
        <div className="space-y-2">
          <span className="text-xs font-medium uppercase tracking-wide text-gray-500 px-1">
            Free
          </span>
          <div className="space-y-1.5">
            {freeModels.map(renderModelRow)}
          </div>
        </div>

        {/* Paid tier */}
        <div className="space-y-2">
          <span className="text-xs font-medium uppercase tracking-wide text-gray-500 px-1">
            Paid
          </span>
          <div className="space-y-1.5">
            {paidModels.map(renderModelRow)}
          </div>
        </div>
      </div>

      {/* OpenRouter credit balance */}
      <div className="rounded-xl border border-white/10 bg-[#1A1A2A] px-5 py-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-400">OpenRouter Balance</span>
          <span className="text-sm font-semibold text-white">
            {creditsLoading
              ? "---"
              : creditsError
                ? "Unavailable"
                : credits?.isUnlimited
                  ? "Unlimited"
                  : `$${credits?.remaining?.toFixed(2) ?? "0.00"}`}
          </span>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add components/model-selector.tsx
git commit -m "feat: add ModelSelector component with model list and credit balance"
```

---

### Task 5: Add ModelSelector to the Settings page

**Files:**
- Modify: `app/(app)/profile/page.tsx:9,114-115`

- [ ] **Step 1: Add import and render ModelSelector**

Add import at line 9 (after `UsageLimits` import):
```ts
import { ModelSelector } from "@/components/model-selector";
```

Insert the `ModelSelector` component before the `UsageLimits` line (before line 115):
```tsx
      {/* AI Model */}
      <ModelSelector />

```

So the section order becomes: Strava Connection -> AI Model -> Usage & Limits -> Danger Zone.

- [ ] **Step 2: Commit**

```bash
git add app/(app)/profile/page.tsx
git commit -m "feat: add AI Model section to settings page"
```

---

### Task 6: Verify end-to-end

- [ ] **Step 1: Run `npx convex dev` and confirm no schema/type errors**

Run: `npx convex dev --once`
Expected: Successful deployment with no errors

- [ ] **Step 2: Run `npx tsc --noEmit` to check types**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Open the settings page in browser and verify**

Manual checks:
1. Settings page shows "AI Model" section above "Usage & Limits"
2. Models are listed in two groups (Free / Paid) with pricing
3. Current model (Claude Sonnet 4) is highlighted in green
4. Clicking a different model updates the selection
5. OpenRouter balance displays below the model list
6. Chat and analysis features use the selected model

- [ ] **Step 4: Final commit if any fixes needed**
