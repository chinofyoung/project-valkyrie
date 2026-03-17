"use client";

import Link from "next/link";
import { formatRelativeDate, metersToKm, speedToPace, formatDuration } from "@/lib/utils";

interface Activity {
  _id: string;
  name: string;
  startDate: number;
  distance: number;
  averageSpeed: number;
  movingTime: number;
  averageHeartrate?: number;
}

interface ActivityCardProps {
  activity: Activity;
}

export function ActivityCard({ activity }: ActivityCardProps) {
  return (
    <Link
      href={`/activities/${activity._id}`}
      className="flex items-center gap-4 py-3.5 border-b border-white/5 last:border-b-0 hover:bg-white/[0.02] transition-colors -mx-2 px-2 rounded-lg"
    >
      {/* Activity icon */}
      <div className="w-11 h-11 rounded-xl bg-[#C8FC03]/10 flex items-center justify-center flex-shrink-0">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#C8FC03"
          strokeWidth="2"
        >
          <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
        </svg>
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-white truncate">{activity.name}</div>
        <div className="text-xs text-[#9CA3AF] mt-0.5">
          {formatRelativeDate(activity.startDate)} &middot; {formatDuration(activity.movingTime)}
          {activity.averageHeartrate && (
            <span> &middot; {Math.round(activity.averageHeartrate)} bpm</span>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 flex-shrink-0">
        <div className="text-right hidden sm:block">
          <div className="text-xs text-[#9CA3AF] uppercase tracking-wide">Pace</div>
          <div className="text-sm font-mono font-semibold text-white">
            {speedToPace(activity.averageSpeed)}
          </div>
        </div>
        <div className="text-right">
          <div className="text-base font-mono font-bold text-white">
            {metersToKm(activity.distance)}
          </div>
          <div className="text-xs text-[#9CA3AF]">km</div>
        </div>
      </div>
    </Link>
  );
}
