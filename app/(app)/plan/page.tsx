"use client";

import { useState } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
// @ts-ignore
import { api } from "@/convex/_generated/api";
import Link from "next/link";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type WorkoutType = "easy" | "tempo" | "interval" | "long" | "rest";

interface Workout {
  day: string;
  description: string;
  type: string;
  completed: boolean;
}

interface Week {
  weekNumber: number;
  workouts: Workout[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateRange(startMs: number, endMs: number): string {
  const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  return `${new Date(startMs).toLocaleDateString(undefined, opts)} – ${new Date(endMs).toLocaleDateString(undefined, opts)}`;
}

function getOverallProgress(weeks: Week[]): { completed: number; total: number; pct: number } {
  let completed = 0;
  let total = 0;
  for (const week of weeks) {
    for (const workout of week.workouts) {
      total++;
      if (workout.completed) completed++;
    }
  }
  return { completed, total, pct: total === 0 ? 0 : Math.round((completed / total) * 100) };
}

function getCurrentWeekNumber(startMs: number, weeks: Week[]): number {
  const msPerWeek = 7 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const elapsed = now - startMs;
  const weekIndex = Math.floor(elapsed / msPerWeek);
  const clamped = Math.max(0, Math.min(weekIndex, weeks.length - 1));
  return weeks[clamped]?.weekNumber ?? 1;
}

const WORKOUT_TYPES = ["easy", "tempo", "interval", "long", "rest", "ride", "walk"] as const;

const WORKOUT_TYPE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  easy:     { bg: "bg-green-900/60",  text: "text-green-300",  label: "Easy" },
  tempo:    { bg: "bg-yellow-900/60", text: "text-yellow-300", label: "Tempo" },
  interval: { bg: "bg-red-900/60",    text: "text-red-300",    label: "Interval" },
  long:     { bg: "bg-blue-900/60",   text: "text-blue-300",   label: "Long" },
  rest:     { bg: "bg-zinc-800",      text: "text-zinc-400",   label: "Rest" },
  ride:     { bg: "bg-purple-900/60", text: "text-purple-300", label: "Ride" },
  walk:     { bg: "bg-teal-900/60",   text: "text-teal-300",   label: "Walk" },
};

function workoutTypeStyle(type: string) {
  return WORKOUT_TYPE_STYLES[type.toLowerCase()] ?? WORKOUT_TYPE_STYLES.rest;
}

function msToDateInput(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dateInputToMs(val: string): number {
  return new Date(val + "T00:00:00").getTime();
}

// ---------------------------------------------------------------------------
// Date computation helpers
// ---------------------------------------------------------------------------

const DAY_OFFSETS: Record<string, number> = {
  Monday: 0, Tuesday: 1, Wednesday: 2, Thursday: 3,
  Friday: 4, Saturday: 5, Sunday: 6,
};

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const MS_PER_DAY = 86400000;

function getWorkoutDate(planStartMs: number, weekNumber: number, day: string): Date {
  const offset = DAY_OFFSETS[day] ?? 0;
  return new Date(planStartMs + ((weekNumber - 1) * 7 + offset) * MS_PER_DAY);
}

function formatWorkoutDate(date: Date): string {
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function restructureWeeksForDateRange(
  weeks: Week[],
  oldStartMs: number,
  newStartMs: number,
  newEndMs: number,
): { weeks: Week[]; removedCount: number } {
  // Collect all workouts with their computed dates
  const all: { dateMs: number; workout: Workout }[] = [];
  for (const week of weeks) {
    for (const workout of week.workouts) {
      const date = getWorkoutDate(oldStartMs, week.weekNumber, workout.day);
      all.push({ dateMs: date.getTime(), workout });
    }
  }

  // Filter to workouts within new range
  const inRange = all.filter(({ dateMs }) => dateMs >= newStartMs && dateMs < newEndMs);
  const removedCount = all.length - inRange.length;

  // Build new weeks grouped by 7-day intervals from new start
  const totalDays = Math.max(0, Math.ceil((newEndMs - newStartMs) / MS_PER_DAY));
  const totalWeeks = Math.max(1, Math.ceil(totalDays / 7));

  const newWeeks: Week[] = Array.from({ length: totalWeeks }, (_, i) => ({
    weekNumber: i + 1,
    workouts: [],
  }));

  for (const { dateMs, workout } of inRange) {
    const daysSinceStart = Math.floor((dateMs - newStartMs) / MS_PER_DAY);
    const weekIdx = Math.min(Math.floor(daysSinceStart / 7), totalWeeks - 1);
    const dayName = DAY_NAMES[new Date(dateMs).getDay()];
    newWeeks[weekIdx].workouts.push({ ...workout, day: dayName });
  }

  return { weeks: newWeeks, removedCount };
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function WeekSection({
  week,
  defaultOpen,
  planId,
  planStartMs,
  editing,
  onToggle,
  onUpdateWorkout,
  onDeleteWorkout,
  onAddWorkout,
}: {
  week: Week;
  defaultOpen: boolean;
  planId: string;
  planStartMs: number;
  editing: boolean;
  onToggle: (weekNumber: number, workoutIndex: number) => void;
  onUpdateWorkout: (weekNumber: number, workoutIndex: number, field: keyof Workout, value: string) => void;
  onDeleteWorkout: (weekNumber: number, workoutIndex: number) => void;
  onAddWorkout: (weekNumber: number) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const completedCount = week.workouts.filter((w) => w.completed).length;

  // Compute date range for the week header
  const weekStartDate = new Date(planStartMs + (week.weekNumber - 1) * 7 * MS_PER_DAY);
  const weekEndDate = new Date(weekStartDate.getTime() + 6 * MS_PER_DAY);
  const weekDateRange = `${formatWorkoutDate(weekStartDate)} – ${formatWorkoutDate(weekEndDate)}`;

  return (
    <div className="rounded-2xl border border-white/10 bg-[#1A1A2A] overflow-hidden">
      {/* Week header */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/5 transition-colors"
      >
        <div>
          <span className="font-semibold text-white">Week {week.weekNumber}</span>
          <span className="ml-2 text-xs text-white/40">{weekDateRange}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-[#9CA3AF]">
            {completedCount}/{week.workouts.length} completed
          </span>
          <svg
            className={`w-4 h-4 text-[#9CA3AF] transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Workout list */}
      {open && (
        <ul className="divide-y divide-white/5 border-t border-white/10">
          {week.workouts.map((workout, idx) => {
            const typeStyle = workoutTypeStyle(workout.type);
            const workoutDate = getWorkoutDate(planStartMs, week.weekNumber, workout.day);
            const dateStr = formatWorkoutDate(workoutDate);

            if (editing) {
              return (
                <li key={idx} className="px-5 py-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={workout.day}
                      onChange={(e) => onUpdateWorkout(week.weekNumber, idx, "day", e.target.value)}
                      className="w-28 px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-[#C8FC03]/50"
                      placeholder="Day"
                    />
                    <select
                      value={workout.type.toLowerCase()}
                      onChange={(e) => onUpdateWorkout(week.weekNumber, idx, "type", e.target.value)}
                      className="px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-[#C8FC03]/50"
                    >
                      {WORKOUT_TYPES.map((t) => (
                        <option key={t} value={t}>
                          {(WORKOUT_TYPE_STYLES[t]?.label ?? t)}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => onDeleteWorkout(week.weekNumber, idx)}
                      className="ml-auto p-1.5 rounded-lg hover:bg-red-500/10 text-white/40 hover:text-red-400 transition-colors"
                      title="Remove workout"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  <input
                    type="text"
                    value={workout.description}
                    onChange={(e) => onUpdateWorkout(week.weekNumber, idx, "description", e.target.value)}
                    className="w-full px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm text-white/70 focus:outline-none focus:border-[#C8FC03]/50"
                    placeholder="Workout description"
                  />
                </li>
              );
            }

            return (
              <li key={idx} className="flex items-start gap-4 px-5 py-4">
                {/* Checkbox */}
                <button
                  onClick={() => onToggle(week.weekNumber, idx)}
                  className="mt-0.5 flex-shrink-0 w-11 h-11 flex items-center justify-center -m-3 rounded-xl transition-colors"
                  aria-label={workout.completed ? "Mark incomplete" : "Mark complete"}
                >
                  <span className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                    workout.completed
                      ? "bg-[#C8FC03] border-[#C8FC03]"
                      : "border-white/30"
                  }`}>
                    {workout.completed && (
                      <svg className="w-3 h-3 text-black" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </span>
                </button>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`font-medium text-sm ${workout.completed ? "line-through text-[#9CA3AF]" : "text-white"}`}>
                      {workout.day}
                    </span>
                    <span className="text-xs text-white/30">{dateStr}</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${typeStyle.bg} ${typeStyle.text}`}>
                      {typeStyle.label}
                    </span>
                  </div>
                  <p className={`mt-1 text-sm ${workout.completed ? "line-through text-zinc-600" : "text-[#9CA3AF]"}`}>
                    {workout.description}
                  </p>
                </div>
              </li>
            );
          })}
          {editing && (
            <li className="px-5 py-3">
              <button
                onClick={() => onAddWorkout(week.weekNumber)}
                className="flex items-center gap-1.5 text-xs text-[#C8FC03]/70 hover:text-[#C8FC03] transition-colors"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Add workout
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export default function PlanPage() {
  const plan = useQuery(api.trainingPlans.getActivePlan);
  const toggleWorkout = useMutation(api.trainingPlans.toggleWorkout);
  const updateStatus = useMutation(api.trainingPlans.updateStatus);
  const updatePlan = useMutation(api.trainingPlans.updatePlan);
  const adjustPlanWorkouts = useAction(api.chat.adjustPlanWorkouts);
  const [showAbandonConfirm, setShowAbandonConfirm] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editGoal, setEditGoal] = useState("");
  const [editStartDate, setEditStartDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");
  const [editWeeks, setEditWeeks] = useState<Week[]>([]);
  const [editWeeksBaseStart, setEditWeeksBaseStart] = useState(0);
  const [removedCount, setRemovedCount] = useState(0);
  const [adjusting, setAdjusting] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);

  // Loading state
  if (plan === undefined) {
    return (
      <div className="pb-8">
        <div className="mb-8">
          <div className="bg-white/5 animate-pulse rounded h-7 w-2/3 mb-2" />
          <div className="bg-white/5 animate-pulse rounded h-4 w-1/3 mb-5" />
          <div className="flex items-center gap-3 mb-2">
            <div className="flex-1 h-2 rounded-full bg-white/5 animate-pulse" />
            <div className="bg-white/5 animate-pulse rounded h-4 w-10" />
          </div>
          <div className="bg-white/5 animate-pulse rounded h-3 w-1/4" />
        </div>
        <div className="space-y-3">
          {[4, 3, 4].map((rowCount, weekIdx) => (
            <div
              key={weekIdx}
              className="rounded-2xl border border-white/5 bg-[#1A1A2A] overflow-hidden"
            >
              <div className="flex items-center justify-between px-5 py-4">
                <div className="bg-white/5 animate-pulse rounded h-5 w-20" />
                <div className="bg-white/5 animate-pulse rounded h-4 w-24" />
              </div>
              <ul className="divide-y divide-white/5 border-t border-white/5">
                {Array.from({ length: rowCount }).map((_, rowIdx) => (
                  <li key={rowIdx} className="flex items-start gap-4 px-5 py-4">
                    <div className="bg-white/5 animate-pulse rounded w-5 h-5 mt-0.5 flex-shrink-0" />
                    <div className="flex-1 min-w-0 space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="bg-white/5 animate-pulse rounded h-4 w-16" />
                        <div className="bg-white/5 animate-pulse rounded-full h-4 w-14" />
                      </div>
                      <div className="bg-white/5 animate-pulse rounded h-3 w-3/4" />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Empty state
  if (plan === null) {
    return (
      <div className="flex items-center justify-center py-20 px-4">
        <div className="rounded-2xl border border-white/10 bg-[#1A1A2A] p-8 max-w-md w-full text-center">
          <div className="w-14 h-14 rounded-full bg-[#C8FC03]/10 flex items-center justify-center mx-auto mb-5">
            <svg className="w-7 h-7 text-[#C8FC03]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-white mb-2">No active training plan</h2>
          <p className="text-[#9CA3AF] text-sm mb-8 leading-relaxed">
            Ask your AI coach to create a personalized plan based on your training data
          </p>
          <Link
            href="/chat"
            className="inline-block px-6 py-3 rounded-xl bg-[#C8FC03] text-black font-semibold text-sm hover:bg-[#b8ec00] transition-colors"
          >
            Go to Chat
          </Link>
        </div>
      </div>
    );
  }

  // Active plan view
  const activePlan = plan!;
  const weeks = editing ? editWeeks : (activePlan.weeks as Week[]);
  const planStartMs = editing ? dateInputToMs(editStartDate) : activePlan.startDate;
  const { completed, total, pct } = getOverallProgress(activePlan.weeks as Week[]);
  const currentWeekNumber = getCurrentWeekNumber(activePlan.startDate, activePlan.weeks as Week[]);

  // Detect empty weeks in the saved plan (for AI fix banner)
  const hasEmptyWeeks = !editing && (activePlan.weeks as Week[]).some((w) => w.workouts.length === 0);

  function handleToggle(weekNumber: number, workoutIndex: number) {
    toggleWorkout({ planId: activePlan._id, weekNumber, workoutIndex });
  }

  function startEditing() {
    setEditGoal(activePlan.goal);
    setEditStartDate(msToDateInput(activePlan.startDate));
    setEditEndDate(msToDateInput(activePlan.endDate));
    setEditWeeks(JSON.parse(JSON.stringify(activePlan.weeks)));
    setEditWeeksBaseStart(activePlan.startDate);
    setRemovedCount(0);
    setEditing(true);
  }

  function cancelEditing() {
    setEditing(false);
    setRemovedCount(0);
  }

  async function saveEdits() {
    await updatePlan({
      planId: activePlan._id,
      goal: editGoal,
      startDate: dateInputToMs(editStartDate),
      endDate: dateInputToMs(editEndDate),
      weeks: editWeeks,
    });
    setEditing(false);
    setRemovedCount(0);
  }

  function handleStartDateChange(val: string) {
    const newStartMs = dateInputToMs(val);
    const newEndMs = dateInputToMs(editEndDate);
    const { weeks: newWeeks, removedCount: removed } = restructureWeeksForDateRange(
      editWeeks, editWeeksBaseStart, newStartMs, newEndMs
    );
    setEditWeeks(newWeeks);
    setEditWeeksBaseStart(newStartMs);
    setEditStartDate(val);
    setRemovedCount((prev) => prev + removed);
  }

  function handleEndDateChange(val: string) {
    const newStartMs = dateInputToMs(editStartDate);
    const newEndMs = dateInputToMs(val);
    const { weeks: newWeeks, removedCount: removed } = restructureWeeksForDateRange(
      editWeeks, editWeeksBaseStart, newStartMs, newEndMs
    );
    setEditWeeks(newWeeks);
    setEditEndDate(val);
    setRemovedCount((prev) => prev + removed);
  }

  function handleUpdateWorkout(weekNumber: number, workoutIndex: number, field: keyof Workout, value: string) {
    setEditWeeks((prev) =>
      prev.map((w) => {
        if (w.weekNumber !== weekNumber) return w;
        return {
          ...w,
          workouts: w.workouts.map((wo, i) =>
            i === workoutIndex ? { ...wo, [field]: value } : wo
          ),
        };
      })
    );
  }

  function handleDeleteWorkout(weekNumber: number, workoutIndex: number) {
    setEditWeeks((prev) =>
      prev.map((w) => {
        if (w.weekNumber !== weekNumber) return w;
        return { ...w, workouts: w.workouts.filter((_, i) => i !== workoutIndex) };
      })
    );
  }

  function handleAddWorkout(weekNumber: number) {
    setEditWeeks((prev) =>
      prev.map((w) => {
        if (w.weekNumber !== weekNumber) return w;
        return {
          ...w,
          workouts: [...w.workouts, { day: "Monday", description: "", type: "easy", completed: false }],
        };
      })
    );
  }

  async function handleAdjustWithAI() {
    setAdjusting(true);
    setAdjustError(null);
    try {
      await adjustPlanWorkouts({ planId: activePlan._id });
    } catch (err) {
      setAdjustError(err instanceof Error ? err.message : "Failed to adjust plan");
    } finally {
      setAdjusting(false);
    }
  }

  async function handleAbandon() {
    await updateStatus({ planId: activePlan._id, status: "abandoned" });
    setShowAbandonConfirm(false);
  }

  return (
    <div className="pb-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between gap-3 mb-1">
          {editing ? (
            <input
              type="text"
              value={editGoal}
              onChange={(e) => setEditGoal(e.target.value)}
              className="flex-1 text-2xl font-bold text-white bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 focus:outline-none focus:border-[#C8FC03]/50"
            />
          ) : (
            <h1 className="text-2xl font-bold text-white">{activePlan.goal}</h1>
          )}
          {!editing && (
            <button
              onClick={startEditing}
              className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium text-white/60 bg-white/5 hover:bg-white/10 transition-colors"
            >
              Edit
            </button>
          )}
        </div>

        {editing ? (
          <div className="flex items-center gap-2 mb-5">
            <input
              type="date"
              value={editStartDate}
              onChange={(e) => handleStartDateChange(e.target.value)}
              className="px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-[#C8FC03]/50"
            />
            <span className="text-white/40 text-sm">to</span>
            <input
              type="date"
              value={editEndDate}
              onChange={(e) => handleEndDateChange(e.target.value)}
              className="px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm text-white focus:outline-none focus:border-[#C8FC03]/50"
            />
          </div>
        ) : (
          <p className="text-[#9CA3AF] text-sm mb-5">
            {formatDateRange(activePlan.startDate, activePlan.endDate)}
          </p>
        )}

        {/* Progress bar */}
        <div className="flex items-center gap-3 mb-2">
          <div className="flex-1 h-2 rounded-full bg-white/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-[#C8FC03] transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-sm font-semibold text-[#C8FC03] w-12 text-right">
            {pct}%
          </span>
        </div>
        <p className="text-xs text-[#9CA3AF]">
          {completed} of {total} workouts completed
        </p>
      </div>

      {/* Edit mode: removed workouts banner */}
      {editing && removedCount > 0 && (
        <div className="mb-4 rounded-xl border border-yellow-500/20 bg-yellow-500/5 px-4 py-3 flex items-center gap-3">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FACC15" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="flex-shrink-0">
            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" />
          </svg>
          <p className="text-xs text-yellow-200/80">
            {removedCount} workout{removedCount !== 1 ? "s" : ""} removed due to date changes.
            Save and use <strong>Adjust with AI</strong> to fill gaps.
          </p>
        </div>
      )}

      {/* View mode: empty weeks / AI fix banner */}
      {hasEmptyWeeks && !adjusting && (
        <div className="mb-4 rounded-xl border border-[#C8FC03]/20 bg-[#C8FC03]/5 px-4 py-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-white font-medium">Some weeks have no workouts</p>
            <p className="text-xs text-white/50 mt-0.5">AI can fill in the gaps based on your training context</p>
          </div>
          <button
            onClick={handleAdjustWithAI}
            className="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium text-black bg-[#C8FC03] hover:bg-[#b8ec00] transition-colors"
          >
            Adjust with AI
          </button>
        </div>
      )}

      {/* AI adjusting indicator */}
      {adjusting && (
        <div className="mb-4 rounded-xl border border-[#C8FC03]/20 bg-[#C8FC03]/5 px-4 py-3 flex items-center gap-3">
          <div className="flex gap-1 items-center">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="w-1.5 h-1.5 rounded-full bg-[#C8FC03]"
                style={{
                  animation: "bounce 1.2s infinite",
                  animationDelay: `${i * 0.2}s`,
                }}
              />
            ))}
          </div>
          <p className="text-xs text-white/70">AI is adjusting your plan...</p>
        </div>
      )}

      {/* AI adjust error */}
      {adjustError && (
        <div className="mb-4 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3">
          <p className="text-xs text-red-400">{adjustError}</p>
        </div>
      )}

      {/* Week sections */}
      <div className="space-y-3 mb-6">
        {weeks.map((week) => (
          <WeekSection
            key={week.weekNumber}
            week={week}
            defaultOpen={week.weekNumber === currentWeekNumber}
            planId={activePlan._id}
            planStartMs={planStartMs}
            editing={editing}
            onToggle={handleToggle}
            onUpdateWorkout={handleUpdateWorkout}
            onDeleteWorkout={handleDeleteWorkout}
            onAddWorkout={handleAddWorkout}
          />
        ))}
      </div>

      {/* Edit mode actions */}
      {editing && (
        <div className="flex gap-2 mb-6">
          <button
            onClick={saveEdits}
            className="px-4 py-2 rounded-lg text-xs font-medium text-black bg-[#C8FC03] hover:bg-[#b8ec00] transition-colors"
          >
            Save Changes
          </button>
          <button
            onClick={cancelEditing}
            className="px-4 py-2 rounded-lg text-xs font-medium text-white/60 bg-white/5 hover:bg-white/10 transition-colors"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Abandon plan */}
      {!editing && (
        <>
          {!showAbandonConfirm ? (
            <button
              onClick={() => setShowAbandonConfirm(true)}
              className="px-4 py-2 rounded-lg text-xs text-red-400 bg-red-500/10 hover:bg-red-500/20 transition-colors"
            >
              Abandon Plan
            </button>
          ) : (
            <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-4 max-w-sm">
              <p className="text-sm text-white font-medium mb-1">Abandon this plan?</p>
              <p className="text-xs text-[#9CA3AF] mb-3">
                This cannot be undone.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowAbandonConfirm(false)}
                  className="px-3 py-1.5 rounded-lg border border-white/15 text-white text-xs font-medium hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAbandon}
                  className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-500 transition-colors"
                >
                  Abandon
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Bounce animation for AI indicator */}
      <style jsx global>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-4px); }
        }
      `}</style>
    </div>
  );
}
