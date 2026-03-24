import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Link from "next/link";
import { useQuery } from "convex/react";
// @ts-ignore
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";

interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  displayText?: string;
  trainingPlanId?: Id<"trainingPlans">;
  createdAt: number;
  onDelete?: () => void;
}

function renderContent(content: string): React.ReactNode {
  const parts = content.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h1: ({ children }) => <h1 className="text-lg font-bold text-white mt-3 mb-1.5 first:mt-0">{children}</h1>,
        h2: ({ children }) => <h2 className="text-base font-bold text-white mt-3 mb-1.5 first:mt-0">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-bold text-white mt-2 mb-1 first:mt-0">{children}</h3>,
        p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
        ul: ({ children }) => <ul className="list-disc pl-4 mb-2 last:mb-0 space-y-1">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 last:mb-0 space-y-1">{children}</ol>,
        li: ({ children }) => <li className="text-sm leading-relaxed">{children}</li>,
        strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>,
        em: ({ children }) => <em className="italic text-white/80">{children}</em>,
        table: ({ children }) => (
          <div className="overflow-x-auto mb-2 last:mb-0">
            <table className="w-full text-xs border-collapse">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="border-b border-white/20">{children}</thead>,
        th: ({ children }) => <th className="text-left py-1.5 px-2 font-semibold text-white/80">{children}</th>,
        td: ({ children }) => <td className="py-1.5 px-2 border-t border-white/10">{children}</td>,
        code: ({ children, className }) => {
          const isBlock = className?.includes("language-");
          if (isBlock) {
            return (
              <pre className="bg-black/30 rounded-lg p-3 mb-2 last:mb-0 overflow-x-auto">
                <code className="text-xs text-green-300">{children}</code>
              </pre>
            );
          }
          return <code className="bg-white/10 rounded px-1 py-0.5 text-xs text-green-300">{children}</code>;
        },
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-[#C8FC03]/40 pl-3 my-2 text-white/60 italic">{children}</blockquote>
        ),
        hr: () => <hr className="border-white/10 my-3" />,
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function DeleteButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-white/10"
      title="Delete message"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-white/40 hover:text-red-400">
        <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
      </svg>
    </button>
  );
}

const WORKOUT_TYPE_COLORS: Record<string, string> = {
  easy: "#4ADE80",
  tempo: "#FACC15",
  interval: "#F87171",
  long: "#60A5FA",
  rest: "#9CA3AF",
  ride: "#A78BFA",
  walk: "#2DD4BF",
};

function TrainingPlanPreview({ planId }: { planId: Id<"trainingPlans"> }) {
  const plan = useQuery(api.trainingPlans.getById, { planId });

  if (plan === undefined) {
    // Loading
    return (
      <div className="mt-3 rounded-xl p-4" style={{ background: "rgba(200,252,3,0.06)", border: "1px solid rgba(200,252,3,0.15)" }}>
        <div className="bg-white/5 animate-pulse rounded h-4 w-3/4 mb-2" />
        <div className="bg-white/5 animate-pulse rounded h-3 w-1/2" />
      </div>
    );
  }

  if (!plan) return null;

  const totalWorkouts = plan.weeks.reduce((sum, w) => sum + w.workouts.length, 0);
  const startStr = new Date(plan.startDate).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const endStr = new Date(plan.endDate).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  // Collect workout type counts for summary
  const typeCounts: Record<string, number> = {};
  for (const week of plan.weeks) {
    for (const workout of week.workouts) {
      const t = workout.type.toLowerCase();
      typeCounts[t] = (typeCounts[t] || 0) + 1;
    }
  }

  return (
    <Link href="/plan" className="block mt-3">
      <div
        className="rounded-xl p-4 transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
        style={{
          background: "linear-gradient(135deg, rgba(200,252,3,0.1) 0%, rgba(200,252,3,0.03) 100%)",
          border: "1px solid rgba(200,252,3,0.2)",
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#C8FC03" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2" />
            <rect x="9" y="3" width="6" height="4" rx="1" />
            <path d="M9 14l2 2 4-4" />
          </svg>
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#C8FC03" }}>
            Training Plan Created
          </span>
        </div>

        {/* Goal */}
        <p className="text-sm font-medium text-white mb-2">{plan.goal}</p>

        {/* Meta */}
        <div className="flex items-center gap-3 text-xs text-white/50 mb-3">
          <span>{plan.weeks.length} weeks</span>
          <span>·</span>
          <span>{totalWorkouts} workouts</span>
          <span>·</span>
          <span>{startStr} – {endStr}</span>
        </div>

        {/* Workout type pills */}
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(typeCounts).map(([type, count]) => (
            <span
              key={type}
              className="px-2 py-0.5 rounded-full text-[10px] font-medium"
              style={{
                background: `${WORKOUT_TYPE_COLORS[type] || "#9CA3AF"}20`,
                color: WORKOUT_TYPE_COLORS[type] || "#9CA3AF",
              }}
            >
              {count} {type}
            </span>
          ))}
        </div>

        {/* CTA */}
        <div className="mt-3 flex items-center gap-1 text-xs font-medium" style={{ color: "#C8FC03" }}>
          <span>View full plan</span>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </div>
      </div>
    </Link>
  );
}

export default function ChatMessage({ role, content, displayText, trainingPlanId, createdAt, onDelete }: ChatMessageProps) {
  const isUser = role === "user";

  // Context message (analysis added to chat)
  if (displayText) {
    return (
      <div className="group flex flex-col items-start gap-1">
        <div className="flex items-center gap-1">
          <div
            className="max-w-[85%] px-4 py-2.5 text-sm leading-relaxed flex items-center gap-2"
            style={{
              background: "rgba(200,252,3,0.08)",
              border: "1px solid rgba(200,252,3,0.15)",
              borderRadius: "16px 16px 16px 4px",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#C8FC03" strokeWidth="2">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
            <span className="text-white/60 italic text-xs">{displayText}</span>
          </div>
          {onDelete && <DeleteButton onClick={onDelete} />}
        </div>
        <span className="text-xs text-white/40 pl-1">{relativeTime(createdAt)}</span>
      </div>
    );
  }

  if (isUser) {
    return (
      <div className="group flex flex-col items-end gap-1">
        <div className="flex items-center gap-1">
          {onDelete && <DeleteButton onClick={onDelete} />}
          <div
            className="max-w-[85%] px-4 py-3 text-sm leading-relaxed text-black"
            style={{
              background: "#C8FC03",
              borderRadius: "16px 16px 4px 16px",
            }}
          >
            {renderContent(content)}
          </div>
        </div>
        <span className="text-xs text-white/40 pr-1">{relativeTime(createdAt)}</span>
      </div>
    );
  }

  return (
    <div className="group flex flex-col items-start gap-1">
      <div className="flex items-center gap-1">
        <div
          className="max-w-[85%] px-4 py-3 text-sm leading-relaxed text-white/90"
          style={{
            background: "#1A1A2A",
            borderLeft: "2px solid #C8FC03",
            borderRadius: "16px 16px 16px 4px",
          }}
        >
          <MarkdownContent content={content} />
          {trainingPlanId && <TrainingPlanPreview planId={trainingPlanId} />}
        </div>
        {onDelete && <DeleteButton onClick={onDelete} />}
      </div>
      <span className="text-xs text-white/40 pl-1">{relativeTime(createdAt)}</span>
    </div>
  );
}
