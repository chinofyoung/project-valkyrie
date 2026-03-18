"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ALLOWED_CREDIT_LIMITS, DEFAULT_CREDIT_LIMIT } from "@/convex/constants";
import { useState } from "react";

const LIMIT_LABELS: Record<number, string> = {
  20: "20",
  40: "40",
  60: "60",
  0: "No Limit",
};

export function UsageLimits() {
  const creditStatus = useQuery(api.users.getCreditStatus);
  const usageHistory = useQuery(api.users.getUsageHistory);
  const updateLimit = useMutation(api.users.updateDailyCreditLimit);
  const [showConfirm, setShowConfirm] = useState<number | null>(null);

  if (!creditStatus) return null;

  const currentLimit = creditStatus.limit ?? DEFAULT_CREDIT_LIMIT;
  const progressPercent = Math.min(
    (creditStatus.used / creditStatus.effectiveLimit) * 100,
    100
  );

  const handleLimitChange = async (newLimit: number) => {
    // If lowering below current usage, confirm first
    if (newLimit !== 0 && newLimit < creditStatus.used) {
      setShowConfirm(newLimit);
      return;
    }
    await updateLimit({ limit: newLimit });
    setShowConfirm(null);
  };

  const confirmLimitChange = async () => {
    if (showConfirm !== null) {
      await updateLimit({ limit: showConfirm });
      setShowConfirm(null);
    }
  };

  const maxHistory = usageHistory
    ? Math.max(...usageHistory.map((d) => d.total), 1)
    : 1;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-white">Usage & Limits</h2>
        <p className="text-sm text-gray-400">
          Manage your daily AI credit allowance
        </p>
      </div>

      {/* Today's Usage */}
      <div className="rounded-xl border border-white/10 bg-[#1A1A2A] p-5">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-medium uppercase tracking-wide text-gray-400">
            Today&apos;s Usage
          </span>
          <span className="text-sm font-semibold text-[#C8FC03]">
            {creditStatus.used} / {currentLimit === 0 ? "∞" : creditStatus.effectiveLimit} credits
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-[#C8FC03] transition-all duration-300"
            style={{ width: `${currentLimit === 0 ? 0 : progressPercent}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between">
          <span className="text-xs text-gray-500">
            {creditStatus.chatCount} chat + {creditStatus.analysisCount} analyses
          </span>
          <span className="text-xs text-gray-500">Resets daily</span>
        </div>
      </div>

      {/* Daily Limit Selector */}
      <div className="rounded-xl border border-white/10 bg-[#1A1A2A] p-5">
        <div className="mb-3">
          <span className="text-[15px] font-medium text-white">
            Daily Credit Limit
          </span>
        </div>
        <div className="flex gap-2">
          {ALLOWED_CREDIT_LIMITS.map((limit) => (
            <button
              key={limit}
              onClick={() => handleLimitChange(limit)}
              className={`flex-1 rounded-lg border py-2.5 text-sm font-medium transition-colors ${
                currentLimit === limit
                  ? "border-[#C8FC03] bg-[#C8FC03]/10 text-[#C8FC03]"
                  : "border-white/10 text-gray-400 hover:border-white/20 hover:text-gray-300"
              }`}
            >
              {LIMIT_LABELS[limit]}
            </button>
          ))}
        </div>

        {/* Confirmation dialog */}
        {showConfirm !== null && (
          <div className="mt-3 rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3">
            <p className="text-sm text-yellow-200">
              You&apos;ve already used {creditStatus.used} credits today. Setting the
              limit to {showConfirm} will block further AI interactions until
              tomorrow. Continue?
            </p>
            <div className="mt-2 flex gap-2">
              <button
                onClick={confirmLimitChange}
                className="rounded-md bg-yellow-600 px-3 py-1 text-xs font-medium text-white hover:bg-yellow-500"
              >
                Yes, change it
              </button>
              <button
                onClick={() => setShowConfirm(null)}
                className="rounded-md bg-white/10 px-3 py-1 text-xs font-medium text-gray-300 hover:bg-white/20"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Usage History */}
      {usageHistory && usageHistory.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-[#1A1A2A] p-5">
          <div className="mb-4">
            <span className="text-[15px] font-medium text-white">
              Usage History
            </span>
            <span className="ml-2 text-[13px] text-gray-500">Last 7 days</span>
          </div>
          <div className="flex items-end gap-2" style={{ height: 100 }}>
            {usageHistory.map((day, i) => {
              const isToday = i === usageHistory.length - 1;
              const barHeight =
                maxHistory > 0 ? (day.total / maxHistory) * 100 : 0;
              const hitLimit =
                currentLimit !== 0 && day.total >= currentLimit;
              return (
                <div
                  key={day.date}
                  className="flex flex-1 flex-col items-center gap-1"
                >
                  <span
                    className={`text-[11px] ${
                      isToday
                        ? "font-semibold text-[#C8FC03]"
                        : "text-gray-500"
                    }`}
                  >
                    {day.total}
                  </span>
                  <div
                    className={`w-full rounded-t ${
                      isToday
                        ? "bg-[#C8FC03]"
                        : "bg-[#C8FC03]/30"
                    } ${hitLimit ? "border-t-2 border-red-500" : ""}`}
                    style={{
                      height: `${Math.max(barHeight, 4)}%`,
                      transition: "height 0.3s",
                    }}
                  />
                </div>
              );
            })}
          </div>
          <div className="mt-2 flex gap-2">
            {usageHistory.map((day, i) => {
              const isToday = i === usageHistory.length - 1;
              const label = isToday
                ? "Today"
                : new Date(day.date + "T00:00:00").toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  });
              return (
                <div
                  key={day.date}
                  className={`flex-1 text-center text-[11px] ${
                    isToday
                      ? "font-semibold text-[#C8FC03]"
                      : "text-gray-500"
                  }`}
                >
                  {label}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
