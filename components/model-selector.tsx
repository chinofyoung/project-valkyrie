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

  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [freeOpen, setFreeOpen] = useState(true);
  const [paidOpen, setPaidOpen] = useState(true);

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

  useEffect(() => {
    if (user && selectedModel === null) {
      setSelectedModel(user.preferredModel ?? DEFAULT_MODEL);
    }
  }, [user, selectedModel]);

  if (!user) return null;

  const savedModel = user.preferredModel ?? DEFAULT_MODEL;
  const activeSelectedModel = selectedModel ?? savedModel;
  const hasUnsavedChange = activeSelectedModel !== savedModel;

  const freeModels = AVAILABLE_MODELS.filter((m) => m.tier === "free");
  const paidModels = AVAILABLE_MODELS.filter((m) => m.tier === "paid");

  const handleSelect = (modelId: string) => {
    setSelectedModel(modelId);
  };

  const handleSave = async () => {
    await updateModel({ modelId: activeSelectedModel });
  };

  const renderModelCard = (model: ModelOption) => {
    const isActive = activeSelectedModel === model.id;
    return (
      <button
        key={model.id}
        onClick={() => handleSelect(model.id)}
        className={`rounded-lg border px-3 py-2.5 text-left transition-colors ${
          isActive
            ? "border-[#C8FC03] bg-[#C8FC03]/10 text-[#C8FC03]"
            : "border-white/10 text-gray-400 hover:border-white/20 hover:text-gray-300"
        }`}
      >
        <span className="block text-sm font-medium truncate">{model.name}</span>
        <span className="block text-[11px] tabular-nums mt-0.5 opacity-70">
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

      {/* Model grid */}
      <div className="rounded-xl border border-white/10 bg-[#1A1A2A] p-5 space-y-4">
        {/* Free tier */}
        <div className="space-y-2">
          <button
            onClick={() => setFreeOpen((o) => !o)}
            className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-gray-500 px-1 cursor-pointer hover:text-gray-300 transition-colors"
          >
            <span>{freeOpen ? "▾" : "▸"}</span>
            <span>Free</span>
          </button>
          {freeOpen && (
            <div className="grid grid-cols-3 gap-2">
              {freeModels.map(renderModelCard)}
            </div>
          )}
        </div>

        {/* Paid tier */}
        <div className="space-y-2">
          <button
            onClick={() => setPaidOpen((o) => !o)}
            className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-gray-500 px-1 cursor-pointer hover:text-gray-300 transition-colors"
          >
            <span>{paidOpen ? "▾" : "▸"}</span>
            <span>Paid</span>
          </button>
          {paidOpen && (
            <div className="grid grid-cols-3 gap-2">
              {paidModels.map(renderModelCard)}
            </div>
          )}
        </div>

        {/* Save button */}
        {hasUnsavedChange && (
          <div className="pt-1">
            <button
              onClick={handleSave}
              className="bg-[#C8FC03] text-black font-semibold rounded-lg px-5 py-2.5 text-sm hover:opacity-90 transition-opacity"
            >
              Save
            </button>
          </div>
        )}
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
