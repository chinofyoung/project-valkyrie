"use client";

import { useState } from "react";
// @ts-ignore
import { useQuery } from "convex/react";
// @ts-ignore
import { api } from "@/convex/_generated/api";
import { ActivityCard } from "@/components/activity-card";

const RUN_TYPES = ["Run", "TrailRun"];

export default function ActivitiesPage() {
  const [showAll, setShowAll] = useState(false);
  const activities = useQuery(api.activities.list, { limit: 100 }) ?? undefined;

  const isLoading = activities === undefined;

  const filteredActivities = isLoading
    ? []
    : showAll
    ? activities
    : activities.filter((a: any) => RUN_TYPES.includes(a.type));

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

      {/* Filter Toggle */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setShowAll(false)}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
            !showAll
              ? "bg-[#C8FC03] text-black"
              : "bg-white/5 border border-white/5 text-[#9CA3AF] hover:text-white"
          }`}
        >
          Runs
        </button>
        <button
          onClick={() => setShowAll(true)}
          className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${
            showAll
              ? "bg-[#C8FC03] text-black"
              : "bg-white/5 border border-white/5 text-[#9CA3AF] hover:text-white"
          }`}
        >
          All
        </button>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="bg-[#1A1A2A] rounded-2xl border border-white/5 p-8 text-center">
          <div className="text-sm text-[#9CA3AF]">Loading activities...</div>
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
        <div className="bg-[#1A1A2A] rounded-2xl border border-white/5 p-5">
          {filteredActivities.map((activity: any) => (
            <ActivityCard key={activity._id} activity={activity} />
          ))}
        </div>
      )}
    </div>
  );
}
