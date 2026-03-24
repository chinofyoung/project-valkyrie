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
