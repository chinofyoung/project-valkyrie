"use client";

import { useState } from "react";
import Link from "next/link";
import { useUser } from "@clerk/nextjs";
// @ts-ignore
import { useQuery, useAction } from "convex/react";
// @ts-ignore
import { api } from "@/convex/_generated/api";
import { ActivityCard } from "@/components/activity-card";
import { WeeklyChart } from "@/components/weekly-chart";
import { StatCard } from "@/components/stat-card";
import { AiInsightCard } from "@/components/ai-insight-card";
import { metersToKm, speedToPace, formatDuration, formatRelativeDate } from "@/lib/utils";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

export default function DashboardPage() {
  const { user } = useUser();
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  const activities = useQuery(api.activities.list, { limit: 20 }) ?? [];
  // @ts-ignore
  const latestInsight = useQuery(api.aiAnalyses.getLatestInsight);
  // @ts-ignore
  const analyzeProgress = useAction(api.ai.analyzeProgress);

  async function handleAnalyzeProgress() {
    setAnalyzing(true);
    setAnalyzeError(null);
    try {
      await analyzeProgress({});
    } catch (err: any) {
      setAnalyzeError(err?.message ?? "Analysis failed. Please try again.");
    } finally {
      setAnalyzing(false);
    }
  }

  const firstName = user?.firstName ?? user?.username ?? "Athlete";
  const initials = (user?.firstName?.[0] ?? "") + (user?.lastName?.[0] ?? "");

  const latestRun = activities[0] ?? null;
  const recentActivities = activities.slice(0, 5);

  return (
    <div className="pb-8">
      {/* Header */}
      <div className="flex items-center justify-between py-5">
        <div>
          <div className="text-sm text-[#9CA3AF]">{getGreeting()}</div>
          <div className="text-2xl font-bold text-white mt-0.5">{firstName}</div>
        </div>
        <div className="flex items-center gap-3">
          {/* Desktop action buttons — shown inline with header on md+ */}
          <button className="hidden md:flex items-center gap-2 px-4 py-2 rounded-xl bg-[#C8FC03] text-black font-semibold text-sm">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Sync Strava
          </button>
          <button
            onClick={handleAnalyzeProgress}
            disabled={analyzing}
            className="hidden md:flex items-center gap-2 px-4 py-2 rounded-xl bg-white/5 border border-white/5 text-white font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            {analyzing ? "Analyzing..." : "Analyze Progress"}
          </button>
          <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#C8FC03] to-[#22C55E] flex items-center justify-center font-bold text-base text-black select-none">
            {initials || firstName[0]?.toUpperCase()}
          </div>
        </div>
      </div>

      {/* Quick Actions — mobile only */}
      <div className="flex gap-3 mb-4 md:hidden">
        <button className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-[#C8FC03] text-black font-semibold text-sm">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Sync Strava
        </button>
        <button
          onClick={handleAnalyzeProgress}
          disabled={analyzing}
          className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-white/5 border border-white/5 text-white font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
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
          {analyzing ? "Analyzing..." : "Analyze Progress"}
        </button>
      </div>

      {/* Empty state — no activities */}
      {activities.length === 0 && (
        <div className="bg-[#1A1A2A] rounded-2xl border border-white/5 p-8 text-center mb-4">
          <div className="w-14 h-14 rounded-2xl bg-[#C8FC03]/10 flex items-center justify-center mx-auto mb-4">
            <svg
              width="28"
              height="28"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#C8FC03"
              strokeWidth="2"
            >
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          </div>
          <div className="text-white font-semibold mb-2">No activities yet</div>
          <div className="text-sm text-[#9CA3AF] mb-4">
            Sync your Strava account to import your runs and get started.
          </div>
          <button className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#C8FC03] text-black text-sm font-semibold">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Sync Strava
          </button>
        </div>
      )}

      {/* Desktop 2-column grid: Latest Run + Weekly Chart side by side */}
      {activities.length > 0 && (
        <div className="md:grid md:grid-cols-2 md:gap-5 md:items-start md:mb-5">
          {/* Latest Run Card */}
          {latestRun && (
            <div
              className="rounded-2xl border border-[#C8FC03]/15 p-5 mb-4 md:mb-0"
              style={{ background: "linear-gradient(135deg, #1A1A2A 0%, #1a2a1a 100%)" }}
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-widest text-[#9CA3AF]">
                  Latest Run
                </span>
                <Link
                  href={`/activities/${latestRun._id}`}
                  className="text-xs font-semibold text-[#C8FC03]"
                >
                  View Details
                </Link>
              </div>
              <div className="text-lg font-bold text-white mb-1">{latestRun.name}</div>
              <div className="text-xs text-[#9CA3AF] mb-4">{formatRelativeDate(latestRun.startDate)}</div>
              {/* 4 stats on desktop, 3 on mobile */}
              <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
                <StatCard value={metersToKm(latestRun.distance)} label="km" />
                <StatCard value={speedToPace(latestRun.averageSpeed)} label="min/km" />
                <StatCard value={formatDuration(latestRun.movingTime)} label="time" />
                {latestRun.averageHeartrate != null && (
                  <StatCard value={`${Math.round(latestRun.averageHeartrate)}`} label="avg hr" />
                )}
              </div>
            </div>
          )}

          {/* Weekly Chart */}
          <div className="mb-4 md:mb-0">
            <WeeklyChart activities={activities} />
          </div>
        </div>
      )}

      {/* Latest Run Card — mobile only when no activities in 2-col */}
      {latestRun && activities.length === 0 && (
        <div
          className="rounded-2xl border border-[#C8FC03]/15 p-5 mb-4"
          style={{ background: "linear-gradient(135deg, #1A1A2A 0%, #1a2a1a 100%)" }}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-widest text-[#9CA3AF]">
              Latest Run
            </span>
            <Link
              href={`/activities/${latestRun._id}`}
              className="text-xs font-semibold text-[#C8FC03]"
            >
              View Details
            </Link>
          </div>
          <div className="text-lg font-bold text-white mb-1">{latestRun.name}</div>
          <div className="text-xs text-[#9CA3AF] mb-4">{formatRelativeDate(latestRun.startDate)}</div>
          <div className="grid grid-cols-3 gap-3">
            <StatCard value={metersToKm(latestRun.distance)} label="km" />
            <StatCard value={speedToPace(latestRun.averageSpeed)} label="min/km" />
            <StatCard value={formatDuration(latestRun.movingTime)} label="time" />
          </div>
        </div>
      )}

      {/* Error message */}
      {analyzeError && (
        <div className="mb-4 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
          {analyzeError}
        </div>
      )}

      {/* AI Insight Card — full width */}
      <div className="mb-4 md:mb-5">
        <AiInsightCard
          content={latestInsight?.content ?? null}
          loading={analyzing}
          onAnalyze={handleAnalyzeProgress}
          label="Analyze Progress"
        />
      </div>

      {/* Recent Activities — full width */}
      {activities.length > 0 && (
        <div className="bg-[#1A1A2A] rounded-2xl border border-white/5 p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold uppercase tracking-widest text-[#9CA3AF]">
              Recent Activities
            </span>
            <Link href="/activities" className="text-xs font-semibold text-[#C8FC03]">
              See All
            </Link>
          </div>
          <div>
            {recentActivities.map((activity: any) => (
              <ActivityCard key={activity._id} activity={activity} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
