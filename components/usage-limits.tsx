"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export function UsageHistory() {
  const usageHistory = useQuery(api.users.getUsageHistory);

  if (!usageHistory || usageHistory.length === 0) return null;

  const maxTotal = Math.max(...usageHistory.map((d) => d.total), 1);

  // SVG dimensions
  const width = 500;
  const height = 120;
  const padX = 0;
  const padTop = 16;
  const padBottom = 4;
  const graphW = width - padX * 2;
  const graphH = height - padTop - padBottom;

  const points = usageHistory.map((day, i) => {
    const x = padX + (i / (usageHistory.length - 1)) * graphW;
    const y = padTop + graphH - (day.total / maxTotal) * graphH;
    return { x, y, ...day };
  });

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaPath = `${linePath} L${points[points.length - 1].x},${height - padBottom} L${points[0].x},${height - padBottom} Z`;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-white">Usage History</h2>
        <p className="text-sm text-gray-400">AI interactions over the last 7 days</p>
      </div>

      <div className="rounded-xl border border-white/10 bg-[#1A1A2A] p-5">
        {/* Line graph */}
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full" preserveAspectRatio="none">
          {/* Gradient fill */}
          <defs>
            <linearGradient id="usageGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#C8FC03" stopOpacity="0.25" />
              <stop offset="100%" stopColor="#C8FC03" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Area fill */}
          <path d={areaPath} fill="url(#usageGradient)" />

          {/* Line */}
          <path d={linePath} fill="none" stroke="#C8FC03" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />

          {/* Data points */}
          {points.map((p, i) => {
            const isToday = i === points.length - 1;
            return (
              <g key={p.date}>
                <circle cx={p.x} cy={p.y} r={isToday ? 4 : 3} fill={isToday ? "#C8FC03" : "#1A1A2A"} stroke="#C8FC03" strokeWidth="2" />
                <text
                  x={p.x}
                  y={p.y - 8}
                  textAnchor="middle"
                  className={`text-[11px] ${isToday ? "font-semibold" : ""}`}
                  fill={isToday ? "#C8FC03" : "#6B7280"}
                  fontSize="11"
                >
                  {p.total}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Date labels */}
        <div className="mt-3 flex">
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
                  isToday ? "font-semibold text-[#C8FC03]" : "text-gray-500"
                }`}
              >
                {label}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
