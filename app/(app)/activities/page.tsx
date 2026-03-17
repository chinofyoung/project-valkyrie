"use client";

import { useState } from "react";
// @ts-ignore
import { useQuery } from "convex/react";
// @ts-ignore
import { api } from "@/convex/_generated/api";
import { ActivityCard } from "@/components/activity-card";

type FilterTab = "runs" | "bike" | "hike" | "walk" | "all";

const PAGE_SIZE = 10;

const FILTER_CONFIG: Record<FilterTab, { label: string; types?: string[] }> = {
  runs: { label: "Runs", types: ["Run", "TrailRun"] },
  bike: { label: "Bike", types: ["Ride", "VirtualRide", "MountainBikeRide", "GravelRide", "EBikeRide"] },
  hike: { label: "Hike", types: ["Hike"] },
  walk: { label: "Walk", types: ["Walk"] },
  all: { label: "All" },
};

export default function ActivitiesPage() {
  const [activeTab, setActiveTab] = useState<FilterTab>("runs");
  const [page, setPage] = useState(0);
  const activities = useQuery(api.activities.list, { limit: 100 }) ?? undefined;

  const isLoading = activities === undefined;

  const filterTypes = FILTER_CONFIG[activeTab].types;
  const filteredActivities = isLoading
    ? []
    : filterTypes
    ? activities.filter((a: any) => filterTypes.includes(a.type))
    : activities;

  const totalPages = Math.ceil(filteredActivities.length / PAGE_SIZE);
  const paginatedActivities = filteredActivities.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleTabChange = (tab: FilterTab) => {
    setActiveTab(tab);
    setPage(0);
  };

  return (
    <div className="pb-8">
      {/* Header */}
      <div className="py-5">
        <div className="text-2xl font-bold text-white">
          Activities
          {!isLoading && (
            <span className="ml-2 text-base font-normal text-[#9CA3AF]">
              ({filteredActivities.length})
            </span>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-4">
        {(Object.entries(FILTER_CONFIG) as [FilterTab, { label: string }][]).map(([key, { label }]) => (
          <button
            key={key}
            onClick={() => handleTabChange(key)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
              activeTab === key
                ? "bg-[#C8FC03] text-black"
                : "bg-white/5 border border-white/5 text-[#9CA3AF] hover:text-white"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="bg-[#1A1A2A] rounded-2xl border border-white/5 p-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-4 py-3.5 border-b border-white/5 last:border-b-0"
            >
              {/* Icon placeholder */}
              <div className="w-11 h-11 rounded-xl bg-white/5 animate-pulse flex-shrink-0" />

              {/* Info placeholder */}
              <div className="flex-1 min-w-0 space-y-2">
                <div className="h-3.5 bg-white/5 animate-pulse rounded w-2/5" />
                <div className="h-3 bg-white/5 animate-pulse rounded w-1/3" />
              </div>

              {/* Stat columns placeholder */}
              <div className="flex items-center gap-4 md:gap-8 flex-shrink-0">
                <div className="text-right hidden md:flex flex-col gap-1.5 items-end">
                  <div className="h-2.5 bg-white/5 animate-pulse rounded w-8" />
                  <div className="h-3.5 bg-white/5 animate-pulse rounded w-12" />
                </div>
                <div className="text-right hidden sm:flex flex-col gap-1.5 items-end">
                  <div className="h-2.5 bg-white/5 animate-pulse rounded w-8" />
                  <div className="h-3.5 bg-white/5 animate-pulse rounded w-14" />
                </div>
                <div className="text-right flex flex-col gap-1.5 items-end">
                  <div className="h-4 bg-white/5 animate-pulse rounded w-12" />
                  <div className="h-2.5 bg-white/5 animate-pulse rounded w-5" />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && filteredActivities.length === 0 && (
        <div className="bg-[#1A1A2A] rounded-2xl border border-white/5 p-8 text-center">
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
          <div className="text-sm text-[#9CA3AF]">
            Sync your Strava data to get started.
          </div>
        </div>
      )}

      {/* Activity list */}
      {!isLoading && filteredActivities.length > 0 && (
        <>
          <div className="bg-[#1A1A2A] rounded-2xl border border-white/5 p-5">
            {paginatedActivities.map((activity: any) => (
              <ActivityCard key={activity._id} activity={activity} />
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <button
                onClick={() => setPage((p) => p - 1)}
                disabled={page === 0}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-white/5 border border-white/5 text-[#9CA3AF] hover:text-white transition-colors disabled:opacity-30 disabled:hover:text-[#9CA3AF]"
              >
                Previous
              </button>
              <span className="text-sm text-[#9CA3AF]">
                {page + 1} / {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={page >= totalPages - 1}
                className="px-4 py-2 rounded-xl text-sm font-semibold bg-white/5 border border-white/5 text-[#9CA3AF] hover:text-white transition-colors disabled:opacity-30 disabled:hover:text-[#9CA3AF]"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
