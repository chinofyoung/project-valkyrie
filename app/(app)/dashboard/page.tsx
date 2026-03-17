"use client";

import { useState } from "react";
import Link from "next/link";
import { useUser, UserButton } from "@clerk/nextjs";
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

function formatEffortTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function effortPace(distance: number, movingTime: number): string {
  if (distance <= 0 || movingTime <= 0) return "--";
  const secondsPerKm = movingTime / (distance / 1000);
  const min = Math.floor(secondsPerKm / 60);
  const sec = Math.round(secondsPerKm % 60);
  return `${min}:${sec.toString().padStart(2, "0")}`;
}

function getBestPerDistance(efforts: any[]): any[] {
  const map = new Map<string, any>();
  for (const e of efforts) {
    const existing = map.get(e.name);
    if (!existing || e.movingTime < existing.movingTime) {
      map.set(e.name, e);
    }
  }
  return Array.from(map.values()).sort((a, b) => a.distance - b.distance);
}

function BestEffortsSection({ efforts }: { efforts: any[] }) {
  const bests = getBestPerDistance(efforts);
  return (
    <div className="mt-4 md:mt-5 bg-[#1A1A2A] rounded-2xl border border-white/5 p-5">
      <span className="text-xs font-semibold uppercase tracking-widest text-[#9CA3AF] block mb-3">
        Best Efforts
      </span>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {bests.map((effort: any) => (
          <div
            key={effort.name}
            className="rounded-xl border border-white/5 p-3.5"
            style={{ background: "rgba(200,252,3,0.03)" }}
          >
            <div className="text-xs text-[#9CA3AF] mb-1">{effort.name}</div>
            <div className="text-lg font-bold text-white">{formatEffortTime(effort.movingTime)}</div>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-[#9CA3AF]">{effortPace(effort.distance, effort.movingTime)} /km</span>
              <span className="text-xs text-white/30">·</span>
              <span className="text-xs text-[#9CA3AF]">{formatRelativeDate(effort.startDate)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { user } = useUser();
  const [analyzing, setAnalyzing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  const activities = useQuery(api.activities.list, { limit: 20 });
  // @ts-ignore
  const latestInsight = useQuery(api.aiAnalyses.getLatestProgressOverview);
  // @ts-ignore
  const analyzeProgress = useAction(api.ai.analyzeProgress);
  // @ts-ignore
  const startSync = useAction(api.strava.startSync);
  // @ts-ignore
  const syncBestEfforts = useAction(api.strava.syncBestEfforts);
  // @ts-ignore
  const bestEfforts = useQuery(api.bestEfforts.listForUser);

  async function handleSync() {
    setSyncing(true);
    try {
      await startSync({});
      await syncBestEfforts({});
    } catch (err: any) {
      setAnalyzeError(err?.message ?? "Sync failed. Please try again.");
    } finally {
      setSyncing(false);
    }
  }

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

  const latestRun = activities?.[0] ?? null;
  const recentActivities = activities?.slice(0, 5) ?? [];

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
          <button
            onClick={handleSync}
            disabled={syncing}
            className="hidden md:flex items-center gap-2 px-4 py-2 rounded-xl bg-[#C8FC03] text-black font-semibold text-sm disabled:opacity-50"
          >
            <svg className={syncing ? "animate-spin" : ""} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {syncing ? "Syncing..." : "Sync Strava"}
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
          <UserButton appearance={{ elements: { avatarBox: "w-11 h-11" } }} />
        </div>
      </div>

      {/* Quick Actions — mobile only */}
      <div className="flex gap-3 mb-4 md:hidden">
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-[#C8FC03] text-black font-semibold text-sm disabled:opacity-50"
        >
          <svg
            className={syncing ? "animate-spin" : ""}
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          {syncing ? "Syncing..." : "Sync Strava"}
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

      {/* Skeleton loading state — shown while activities query is in-flight */}
      {activities === undefined && (
        <>
          {/* 2-column grid skeleton: Latest Run + Weekly Chart */}
          <div className="md:grid md:grid-cols-2 md:gap-5 md:items-start md:mb-5">
            {/* Latest Run card skeleton */}
            <div className="bg-[#1A1A2A] border border-white/5 rounded-2xl p-5 mb-4 md:mb-0">
              {/* Header row */}
              <div className="flex items-center justify-between mb-3">
                <div className="bg-white/5 animate-pulse rounded h-3 w-20" />
                <div className="bg-white/5 animate-pulse rounded h-3 w-16" />
              </div>
              {/* Run name */}
              <div className="bg-white/5 animate-pulse rounded h-5 w-48 mb-2" />
              {/* Date */}
              <div className="bg-white/5 animate-pulse rounded h-3 w-24 mb-4" />
              {/* 4 stat boxes */}
              <div className="grid grid-cols-3 md:grid-cols-4 gap-3">
                {[...Array(4)].map((_, i) => (
                  <div key={i} className="bg-white/5 animate-pulse rounded-xl h-16" />
                ))}
              </div>
            </div>

            {/* Weekly Chart skeleton */}
            <div className="bg-[#1A1A2A] border border-white/5 rounded-2xl p-5 mb-4 md:mb-0">
              <div className="bg-white/5 animate-pulse rounded h-3 w-24 mb-4" />
              <div className="bg-white/5 animate-pulse rounded h-40 w-full" />
            </div>
          </div>

          {/* AI Insight Card skeleton */}
          <div className="bg-[#1A1A2A] border border-white/5 rounded-2xl p-5 mb-4 md:mb-5">
            <div className="bg-white/5 animate-pulse rounded h-3 w-28 mb-3" />
            <div className="bg-white/5 animate-pulse rounded h-4 w-full mb-2" />
            <div className="bg-white/5 animate-pulse rounded h-4 w-5/6 mb-2" />
            <div className="bg-white/5 animate-pulse rounded h-4 w-4/6" />
          </div>

          {/* Recent Activities skeleton */}
          <div className="bg-[#1A1A2A] border border-white/5 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="bg-white/5 animate-pulse rounded h-3 w-32" />
              <div className="bg-white/5 animate-pulse rounded h-3 w-12" />
            </div>
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="bg-white/5 animate-pulse rounded-xl h-14 w-full" />
              ))}
            </div>
          </div>
        </>
      )}

      {/* Empty state — loaded but no activities */}
      {activities !== undefined && activities.length === 0 && (
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
          <button
            onClick={handleSync}
            disabled={syncing}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#C8FC03] text-black text-sm font-semibold disabled:opacity-50"
          >
            <svg
              className={syncing ? "animate-spin" : ""}
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {syncing ? "Syncing..." : "Sync Strava"}
          </button>
        </div>
      )}

      {/* Desktop 2-column grid: Latest Run + Weekly Chart side by side */}
      {activities !== undefined && activities.length > 0 && (
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
      {activities !== undefined && activities.length > 0 && (
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

      {/* Best Efforts */}
      {bestEfforts === undefined && activities !== undefined && activities.length > 0 && (
        <div className="mt-4 md:mt-5 bg-[#1A1A2A] rounded-2xl border border-white/5 p-5">
          <div className="bg-white/5 animate-pulse rounded h-3 w-24 mb-4" />
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-white/5 animate-pulse rounded-xl h-24" />
            ))}
          </div>
        </div>
      )}

      {bestEfforts && bestEfforts.length > 0 && (
        <BestEffortsSection efforts={bestEfforts} />
      )}
    </div>
  );
}
