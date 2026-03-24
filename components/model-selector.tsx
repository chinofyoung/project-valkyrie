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
