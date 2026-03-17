"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
// @ts-ignore
import { useQuery, useAction, useMutation } from "convex/react";
// @ts-ignore
import { api } from "@/convex/_generated/api";
import { StatCard } from "@/components/stat-card";
import { AiInsightCard } from "@/components/ai-insight-card";
import { RouteMap } from "@/components/route-map";
import {
  metersToKm,
  speedToPace,
  speedToKmh,
  formatDuration,
  formatRelativeDate,
  isCyclingType,
  activityTypeLabel,
} from "@/lib/utils";

interface PageProps {
  params: Promise<{ id: string }>;
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function ActivityDetailPage({ params }: PageProps) {
  const { id } = use(params);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  // @ts-ignore
  const activity = useQuery(api.activities.getById, { id });
  // @ts-ignore
  const existingAnalysis = useQuery(api.aiAnalyses.getForActivity, { activityId: id });
  // @ts-ignore
  const analyzeRun = useAction(api.ai.analyzeRun);
  const router = useRouter();
  // @ts-ignore
  const addToChat = useMutation(api.chatMessages.addToChat);

  async function handleAddToChat(analysisContent: string) {
    await addToChat({
      content: analysisContent,
      displayText: `— ${activity?.name ?? "Activity"} analysis added`,
    });
    router.push("/chat");
  }

  async function handleAnalyzeRun() {
    setAnalyzing(true);
    setAnalyzeError(null);
    try {
      // @ts-ignore
      await analyzeRun({ activityId: id });
    } catch (err: any) {
      setAnalyzeError(err?.message ?? "Analysis failed. Please try again.");
    } finally {
      setAnalyzing(false);
    }
  }

  if (activity === undefined) {
    return (
      <div className="pb-8">
        {/* Header skeleton */}
        <div className="py-5">
          <div className="bg-white/5 animate-pulse rounded h-4 w-20 mb-6" />
          <div className="bg-white/5 animate-pulse rounded h-7 w-2/3 mb-2" />
          <div className="bg-white/5 animate-pulse rounded h-4 w-40" />
        </div>

        {/* Stats grid skeleton */}
        <div className="bg-[#1A1A2A] rounded-2xl border border-white/5 p-5 mb-4">
          <div className="grid grid-cols-3 md:grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-2">
                <div className="bg-white/5 animate-pulse rounded h-7 w-3/4" />
                <div className="bg-white/5 animate-pulse rounded h-3 w-1/2" />
              </div>
            ))}
          </div>
        </div>

        {/* Splits table skeleton */}
        <div className="bg-[#1A1A2A] rounded-2xl border border-white/5 mb-4 overflow-hidden">
          <div className="px-5 py-4 border-b border-white/5">
            <div className="bg-white/5 animate-pulse rounded h-3 w-12" />
          </div>
          <div className="px-5 py-3 flex gap-4 border-b border-white/5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="bg-white/5 animate-pulse rounded h-3 flex-1" />
            ))}
          </div>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="px-5 py-3 flex gap-4 border-b border-white/5 last:border-b-0">
              {Array.from({ length: 5 }).map((_, j) => (
                <div key={j} className="bg-white/5 animate-pulse rounded h-4 flex-1" />
              ))}
            </div>
          ))}
        </div>

        {/* Button skeleton */}
        <div className="bg-white/5 animate-pulse rounded-xl h-12 w-full md:w-36" />
      </div>
    );
  }

  if (activity === null) {
    return (
      <div className="pb-8">
        <div className="py-5">
          <BackButton />
        </div>
        <div className="bg-[#1A1A2A] rounded-2xl border border-white/5 p-8 text-center">
          <div className="text-white font-semibold mb-2">Activity not found</div>
          <div className="text-sm text-[#9CA3AF]">
            This activity may have been removed or you don&apos;t have access.
          </div>
        </div>
      </div>
    );
  }

  const hasMap = !!(activity.map?.summaryPolyline);
  const hasSplits = Array.isArray(activity.splits) && activity.splits.length > 0;

  return (
    <div className="pb-8">
      {/* Header */}
      <div className="py-5">
        <BackButton />
        <h1 className="text-2xl font-bold text-white mt-4 leading-tight">
          {activity.name}
        </h1>
        <div className="text-sm text-[#9CA3AF] mt-1">
          {activityTypeLabel(activity.type)} &middot; {formatDate(activity.startDate)}
        </div>
      </div>

      {/* Desktop: Stats + Map side by side; Mobile: stacked */}
      <div className="md:grid md:grid-cols-2 md:gap-5 md:items-start md:mb-5">
        {/* Stats Grid — 3 cols mobile, 4 cols desktop */}
        <div className="bg-[#1A1A2A] rounded-2xl border border-white/5 p-5 mb-4 md:mb-0">
          <div className="grid grid-cols-3 md:grid-cols-4 gap-4">
            <StatCard value={metersToKm(activity.distance)} label="km" />
            {isCyclingType(activity.type) ? (
              <StatCard value={speedToKmh(activity.averageSpeed)} label="km/h" />
            ) : (
              <StatCard value={speedToPace(activity.averageSpeed)} label="min/km" />
            )}
            <StatCard value={formatDuration(activity.movingTime)} label="time" />
            <StatCard
              value={`${Math.round(activity.totalElevationGain)}m`}
              label="elevation"
            />
            {activity.averageHeartrate != null && (
              <StatCard
                value={`${Math.round(activity.averageHeartrate)}`}
                label="avg bpm"
              />
            )}
            {activity.averageCadence != null && (
              <StatCard
                value={`${Math.round(activity.averageCadence * 2)}`}
                label="spm"
              />
            )}
            {activity.calories != null && (
              <StatCard value={`${Math.round(activity.calories)}`} label="cal" />
            )}
          </div>
        </div>

        {/* Route Map — beside stats on desktop, below on mobile */}
        {hasMap && (
          <div className="bg-[#1A1A2A] rounded-2xl border border-white/5 mb-4 md:mb-0 overflow-hidden min-h-[200px] md:min-h-full">
            <RouteMap
              polyline={activity.map!.summaryPolyline!}
              className="w-full h-full min-h-[200px]"
            />
          </div>
        )}
      </div>

      {/* Splits Table — full width */}
      {hasSplits && (
        <div className="bg-[#1A1A2A] rounded-2xl border border-white/5 mb-4 overflow-hidden">
          <div className="px-5 py-4 border-b border-white/5">
            <span className="text-xs font-semibold uppercase tracking-widest text-[#9CA3AF]">
              Splits
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="px-5 py-3 text-left text-xs font-semibold text-[#9CA3AF] uppercase tracking-wide">
                    Split
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-[#9CA3AF] uppercase tracking-wide">
                    Distance
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-[#9CA3AF] uppercase tracking-wide">
                    {isCyclingType(activity.type) ? "Speed" : "Pace"}
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-[#9CA3AF] uppercase tracking-wide">
                    Time
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-[#9CA3AF] uppercase tracking-wide">
                    Elev
                  </th>
                </tr>
              </thead>
              <tbody>
                {activity.splits?.map((split: any, i: number) => (
                  <tr
                    key={i}
                    className="border-b border-white/5 last:border-b-0 hover:bg-white/[0.02] transition-colors"
                  >
                    <td className="px-5 py-3 text-white font-medium">
                      {i + 1}
                    </td>
                    <td className="px-5 py-3 text-right text-white font-mono">
                      {metersToKm(split.distance)} km
                    </td>
                    <td className="px-5 py-3 text-right text-white font-mono">
                      {isCyclingType(activity.type)
                        ? `${speedToKmh(split.averageSpeed ?? 0)} km/h`
                        : speedToPace(split.averageSpeed ?? 0)}
                    </td>
                    <td className="px-5 py-3 text-right text-white font-mono">
                      {formatDuration(split.movingTime ?? 0)}
                    </td>
                    <td className="px-5 py-3 text-right text-[#9CA3AF] font-mono">
                      {split.elevationDifference != null
                        ? `${split.elevationDifference > 0 ? "+" : ""}${Math.round(split.elevationDifference)}m`
                        : "--"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Analyze Run Button */}
      <button
        onClick={handleAnalyzeRun}
        disabled={analyzing}
        className="w-full md:w-auto md:px-8 py-3.5 rounded-xl bg-[#C8FC03] text-black font-semibold text-sm mb-4 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed transition-opacity"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
        {analyzing ? "Analyzing..." : `Analyze ${activityTypeLabel(activity.type)}`}
      </button>

      {/* Error message */}
      {analyzeError && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {analyzeError}
        </div>
      )}

      {/* AI Analysis Card */}
      <AiInsightCard
        content={existingAnalysis?.content ?? null}
        loading={analyzing}
        onAnalyze={handleAnalyzeRun}
        onAddToChat={handleAddToChat}
        label={`Analyze ${activityTypeLabel(activity?.type ?? "Run")}`}
        defaultExpanded
      />
    </div>
  );
}

function BackButton() {
  return (
    <Link
      href="/activities"
      className="inline-flex items-center gap-1.5 text-sm text-[#9CA3AF] hover:text-white transition-colors"
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M19 12H5M5 12l7 7M5 12l7-7" />
      </svg>
      Activities
    </Link>
  );
}
