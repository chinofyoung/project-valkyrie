# AI Model Selector & OpenRouter Credits Display

## Summary

Add a new "AI Model" section to the Settings page that lets users pick their preferred OpenRouter model from a curated list (with pricing info) and view their remaining OpenRouter credit balance.

## Motivation

The model is currently hardcoded to `anthropic/claude-sonnet-4`. Users should be able to choose between models based on quality, speed, and cost — including free options.

## Design

### New "AI Model" Section

Located on the Settings page (`/profile`), positioned above the existing "Usage & Limits" section.

**Model Selector:**
- Dropdown/select showing curated models grouped under "Free" and "Paid" headers
- Each option displays: model name, input cost ($/1M tokens), output cost ($/1M tokens)
- Selected model persisted to user's `preferredModel` field
- Default: `anthropic/claude-sonnet-4`

**OpenRouter Credit Balance:**
- Displayed below the model selector
- Fetched via OpenRouter's `/api/v1/auth/key` endpoint (returns `limit`, `usage`, remaining)
- Shows remaining balance in dollars
- Refreshes on page load

### Curated Model List

Hardcoded constant, grouped by tier:

**Free:**
| Model | ID | Input $/1M | Output $/1M |
|---|---|---|---|
| Llama 4 Maverick | `meta-llama/llama-4-maverick:free` | $0.00 | $0.00 |
| Gemini 2.0 Flash | `google/gemini-2.0-flash-exp:free` | $0.00 | $0.00 |
| Qwen3 8B | `qwen/qwen3-8b:free` | $0.00 | $0.00 |

**Paid:**
| Model | ID | Input $/1M | Output $/1M |
|---|---|---|---|
| Claude Sonnet 4 | `anthropic/claude-sonnet-4` | $3.00 | $15.00 |
| Claude Haiku 3.5 | `anthropic/claude-3.5-haiku` | $0.80 | $4.00 |
| GPT-4o | `openai/gpt-4o` | $2.50 | $10.00 |
| GPT-4o Mini | `openai/gpt-4o-mini` | $0.15 | $0.60 |
| Gemini 2.5 Pro | `google/gemini-2.5-pro` | $1.25 | $10.00 |
| Llama 4 Maverick | `meta-llama/llama-4-maverick` | $0.20 | $0.60 |

### Backend Changes

**Shared model constant (`convex/models.ts`):**
- Single source of truth for the allowed model list (IDs, names, pricing, tier)
- Exported and used by both backend validation and frontend UI to prevent drift

**Schema (`convex/schema.ts`):**
- Add `preferredModel: v.optional(v.string())` to users table

**Mutations/Queries (`convex/users.ts`):**
- Add `updatePreferredModel` mutation — validates model ID against `ALLOWED_MODELS` from `convex/models.ts`, patches user record

**Actions (`convex/users.ts` or new file):**
- Add `getOpenRouterCredits` action — calls `https://openrouter.ai/api/v1/auth/key` with the API key, returns `{ limit, usage, remaining }` or `null` on error
- Handle `limit: null` from OpenRouter (means unlimited/no cap) — return a flag so the UI can display "Unlimited" instead of a dollar amount

**AI files (`convex/ai.ts`, `convex/chat.ts`):**
- Replace hardcoded `"anthropic/claude-sonnet-4"` in `analyzeRun`, `analyzeProgress`, and `sendMessage` with user's `preferredModel` (falling back to default)
- Re-validate the stored `preferredModel` against `ALLOWED_MODELS` before each API call — if not in the list, fall back to default (prevents bypass via direct mutation calls)
- `compactNow` and `compactHistory` keep hardcoded `anthropic/claude-sonnet-4` — these are internal summarization tasks that need a reliable model, not user-facing

### UI Component

New `ModelSelector` component (e.g. `components/model-selector.tsx`):
- Uses `useQuery(api.users.currentUser)` to get current model preference
- Uses `useMutation(api.users.updatePreferredModel)` to save changes
- Uses `useAction(api.users.getOpenRouterCredits)` to fetch balance on mount
- Follows existing dark theme styling with neon green accent
- Grouped dropdown with "Free" / "Paid" headers
- Each row: model name on left, pricing on right
- Credit balance shown below as a simple text line (e.g. "OpenRouter Balance: $12.34")
- Credit balance states: loading (show "---"), error (show "Unavailable"), unlimited key (show "Unlimited"), normal (show dollar amount)
- Guard against duplicate fetches: track loading state and skip re-fetch while in-flight

### Styling

Matches existing patterns:
- Card: `bg-surface rounded-2xl p-6 border border-border`
- Active selection: `border-[#C8FC03] bg-[#C8FC03]/10 text-[#C8FC03]`
- Inactive: `border-white/10 text-gray-400 hover:border-white/20`
- Section title: white text, `text-lg font-semibold`

## Out of Scope

- Dynamic model list fetching from OpenRouter
- Model-specific parameter tuning (temperature, etc.)
- Per-model credit tracking or usage history
