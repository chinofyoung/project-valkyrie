"use client";

import { metersToKm } from "@/lib/utils";

interface Activity {
  startDate: number;
  distance: number;
}

interface WeeklyChartProps {
  activities: Activity[];
}

const DAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"];

/** Get the Monday of the current week (week starts Monday) */
function getWeekStart(): Date {
  const now = new Date();
  const day = now.getDay(); // 0 = Sunday
  const daysFromMonday = day === 0 ? 6 : day - 1;
  const monday = new Date(now);
  monday.setHours(0, 0, 0, 0);
  monday.setDate(now.getDate() - daysFromMonday);
  return monday;
}

export function WeeklyChart({ activities }: WeeklyChartProps) {
  const weekStart = getWeekStart();
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  // Sum distance per day of week (index 0 = Monday, 6 = Sunday)
  const dailyDistances: number[] = [0, 0, 0, 0, 0, 0, 0];

  for (const activity of activities) {
    const date = new Date(activity.startDate);
    if (date >= weekStart && date < weekEnd) {
      const day = date.getDay();
      const index = day === 0 ? 6 : day - 1;
      dailyDistances[index] += activity.distance;
    }
  }

  const totalWeeklyMeters = dailyDistances.reduce((sum, d) => sum + d, 0);
  const maxDistance = Math.max(...dailyDistances, 1); // avoid div by zero

  const MAX_BAR_HEIGHT = 80; // px

  return (
    <div className="bg-[#1A1A2A] rounded-2xl border border-white/5 p-5 mb-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-semibold uppercase tracking-widest text-[#9CA3AF]">
          This Week
        </span>
        <span className="text-xl font-bold font-mono text-white">
          {metersToKm(totalWeeklyMeters)}{" "}
          <span className="text-xs text-[#9CA3AF] font-normal font-sans">km</span>
        </span>
      </div>

      {/* Bars */}
      <div className="flex items-end gap-2" style={{ height: `${MAX_BAR_HEIGHT + 24}px` }}>
        {dailyDistances.map((distance, index) => {
          const haRun = distance > 0;
          const barHeight = haRun
            ? Math.max(8, Math.round((distance / maxDistance) * MAX_BAR_HEIGHT))
            : 4;

          return (
            <div
              key={index}
              className="flex-1 flex flex-col items-center justify-end gap-1.5"
              style={{ height: `${MAX_BAR_HEIGHT + 24}px` }}
            >
              <div
                className={`w-full rounded-md transition-all ${
                  haRun ? "bg-[#C8FC03]" : "bg-[#C8FC03]/15"
                }`}
                style={{ height: `${barHeight}px`, minHeight: "4px" }}
              />
              <span className="text-[10px] text-[#9CA3AF]">{DAY_LABELS[index]}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
