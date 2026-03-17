"use client";

import Link from "next/link";
import { formatRelativeDate, metersToKm, speedToPace, speedToKmh, formatDuration, isCyclingType, activityTypeLabel } from "@/lib/utils";

interface Activity {
  _id: string;
  name: string;
  type: string;
  startDate: number;
  distance: number;
  averageSpeed: number;
  movingTime: number;
  averageHeartrate?: number;
}

interface ActivityCardProps {
  activity: Activity;
  hasAnalysis?: boolean;
}

export function ActivityCard({ activity, hasAnalysis }: ActivityCardProps) {
  return (
    <Link
      href={`/activities/${activity._id}`}
      className="flex items-center gap-4 py-3.5 border-b border-white/5 last:border-b-0 hover:bg-white/[0.02] active:bg-white/[0.06] active:scale-[0.98] transition-all duration-100 -mx-2 px-2 rounded-lg"
    >
      {/* Activity icon */}
      <div className="w-11 h-11 rounded-xl bg-[#C8FC03]/10 flex items-center justify-center flex-shrink-0">
        <ActivityIcon type={activity.type} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-white truncate flex items-center gap-1.5">
          {activity.name}
          {hasAnalysis && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="#C8FC03" className="flex-shrink-0" opacity="0.6">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
          )}
        </div>
        <div className="text-xs text-[#9CA3AF] mt-0.5">
          {formatRelativeDate(activity.startDate)} &middot; {formatDuration(activity.movingTime)}
          {activity.averageHeartrate && (
            <span> &middot; {Math.round(activity.averageHeartrate)} bpm</span>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="flex items-center gap-4 md:gap-8 flex-shrink-0">
        <div className="text-right hidden md:block">
          <div className="text-xs text-[#9CA3AF] uppercase tracking-wide">Time</div>
          <div className="text-sm font-mono font-semibold text-white">
            {formatDuration(activity.movingTime)}
          </div>
        </div>
        <div className="text-right hidden sm:block">
          <div className="text-xs text-[#9CA3AF] uppercase tracking-wide">
            {isCyclingType(activity.type) ? "Speed" : "Pace"}
          </div>
          <div className="text-sm font-mono font-semibold text-white">
            {isCyclingType(activity.type)
              ? `${speedToKmh(activity.averageSpeed)} km/h`
              : speedToPace(activity.averageSpeed)}
          </div>
        </div>
        {activity.averageHeartrate && (
          <div className="text-right hidden md:block">
            <div className="text-xs text-[#9CA3AF] uppercase tracking-wide">HR</div>
            <div className="text-sm font-mono font-semibold text-white">
              {Math.round(activity.averageHeartrate)}
            </div>
          </div>
        )}
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

function ActivityIcon({ type }: { type: string }) {
  if (isCyclingType(type)) {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C8FC03" strokeWidth="2">
        <circle cx="5.5" cy="17.5" r="3.5" />
        <circle cx="18.5" cy="17.5" r="3.5" />
        <path d="M15 6a1 1 0 100-2 1 1 0 000 2zM12 17.5V14l-3-3 4-3 2 3h3" />
      </svg>
    );
  }
  if (type === "Walk" || type === "Hike") {
    return (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C8FC03" strokeWidth="2">
        <path d="M13 4a1 1 0 100-2 1 1 0 000 2zM7 21l3-4 2.5 3L17 12M10 17l-2-4 5-3-1-3" />
      </svg>
    );
  }
  // Default: running icon (Run, TrailRun, etc.)
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#C8FC03" strokeWidth="2">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  );
}
