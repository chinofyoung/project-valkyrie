"use client";

import { use } from "react";
import Link from "next/link";
// @ts-ignore
import { useQuery } from "convex/react";
// @ts-ignore
import { api } from "@/convex/_generated/api";
import { StatCard } from "@/components/stat-card";
import {
  metersToKm,
  speedToPace,
  formatDuration,
  formatRelativeDate,
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

  // @ts-ignore
  const activity = useQuery(api.activities.getById, { id });

  if (activity === undefined) {
    return (
      <div className="max-w-2xl mx-auto px-4 pb-8">
        <div className="py-5">
          <BackButton />
        </div>
        <div className="bg-[#1A1A2A] rounded-2xl border border-white/5 p-8 text-center">
          <div className="text-sm text-[#9CA3AF]">Loading activity...</div>
        </div>
      </div>
    );
  }

  if (activity === null) {
    return (
      <div className="max-w-2xl mx-auto px-4 pb-8">
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
    <div className="max-w-2xl mx-auto px-4 pb-8">
      {/* Header */}
      <div className="py-5">
        <BackButton />
        <h1 className="text-2xl font-bold text-white mt-4 leading-tight">
          {activity.name}
        </h1>
        <div className="text-sm text-[#9CA3AF] mt-1">
          {formatDate(activity.startDate)}
        </div>
      </div>

      {/* Stats Grid */}
      <div className="bg-[#1A1A2A] rounded-2xl border border-white/5 p-5 mb-4">
        <div className="grid grid-cols-3 gap-4">
          <StatCard value={metersToKm(activity.distance)} label="km" />
          <StatCard value={speedToPace(activity.averageSpeed)} label="min/km" />
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

      {/* Map Placeholder */}
      {hasMap && (
        <div className="bg-[#1A1A2A] rounded-2xl border border-white/5 p-5 mb-4 flex flex-col items-center justify-center gap-3 min-h-[140px]">
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#9CA3AF"
            strokeWidth="1.5"
          >
            <path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6-3V7m6 16l4.553-2.276A1 1 0 0021 19.382V8.618a1 1 0 00-.553-.894L15 5m0 12V5m0 0L9 7" />
          </svg>
          <div className="text-sm text-[#9CA3AF]">Map coming soon</div>
        </div>
      )}

      {/* Splits Table */}
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
                    Pace
                  </th>
                  <th className="px-5 py-3 text-right text-xs font-semibold text-[#9CA3AF] uppercase tracking-wide">
                    Elev
                  </th>
                </tr>
              </thead>
              <tbody>
                {activity.splits.map((split: any, i: number) => (
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
                      {speedToPace(split.averageSpeed ?? 0)}
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
        disabled
        className="w-full py-3.5 rounded-xl bg-[#C8FC03] text-black font-semibold text-sm mb-4 cursor-not-allowed opacity-50 flex items-center justify-center gap-2"
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
        Analyze Run
      </button>

      {/* AI Analysis Placeholder */}
      <div
        className="rounded-2xl border border-[#C8FC03]/20 p-5 relative overflow-hidden"
        style={{ background: "#1A1A2A" }}
      >
        {/* Top accent line */}
        <div
          className="absolute top-0 left-0 right-0 h-0.5"
          style={{ background: "linear-gradient(90deg, #C8FC03, transparent)" }}
        />
        <div className="inline-flex items-center gap-1.5 bg-[#C8FC03]/10 text-[#C8FC03] text-[11px] font-semibold px-2.5 py-1 rounded-full mb-3">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
          AI Coach
        </div>
        <div className="text-sm text-white/70 leading-relaxed">
          Run analysis will appear here after clicking Analyze Run.
        </div>
      </div>
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
