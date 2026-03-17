/** Convert m/s to min/km pace string like "5:24" */
export function speedToPace(metersPerSecond: number): string {
  if (metersPerSecond <= 0) return "--:--";
  const minPerKm = 1000 / metersPerSecond / 60;
  const mins = Math.floor(minPerKm);
  const secs = Math.round((minPerKm - mins) * 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

/** Convert m/s to km/h string like "28.5" */
export function speedToKmh(metersPerSecond: number): string {
  if (metersPerSecond <= 0) return "--";
  return (metersPerSecond * 3.6).toFixed(1);
}

const CYCLING_TYPES = ["Ride", "VirtualRide", "MountainBikeRide", "GravelRide", "EBikeRide"];

/** Check if an activity type is a cycling type */
export function isCyclingType(type: string): boolean {
  return CYCLING_TYPES.includes(type);
}

/** Get a human-readable label for an activity type */
export function activityTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    Run: "Run",
    TrailRun: "Trail Run",
    Walk: "Walk",
    Hike: "Hike",
    Ride: "Ride",
    VirtualRide: "Virtual Ride",
    MountainBikeRide: "MTB Ride",
    GravelRide: "Gravel Ride",
    EBikeRide: "E-Bike Ride",
  };
  return labels[type] ?? type;
}

/** Format meters to km with 1 decimal */
export function metersToKm(meters: number): string {
  return (meters / 1000).toFixed(1);
}

/** Format seconds to "MM:SS" or "H:MM:SS" */
export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Format timestamp to relative date like "Today", "Yesterday", or "Mon, Mar 15" */
export function formatRelativeDate(timestamp: number): string {
  const now = new Date();
  const date = new Date(timestamp);
  const diffDays = Math.floor((now.getTime() - date.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}
