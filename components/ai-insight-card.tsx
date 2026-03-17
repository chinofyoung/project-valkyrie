"use client";

interface AiInsightCardProps {
  content: string | null;
  loading: boolean;
  onAnalyze: () => void;
  label: string;
}

function renderContent(text: string) {
  const paragraphs = text.split(/\n{1,}/g).filter((p) => p.trim().length > 0);

  return paragraphs.map((paragraph, pIdx) => {
    // Split on **bold** markers and render spans
    const parts = paragraph.split(/\*\*(.+?)\*\*/g);
    return (
      <p key={pIdx} className="text-sm text-white/80 leading-relaxed mb-3 last:mb-0">
        {parts.map((part, i) =>
          i % 2 === 1 ? (
            <strong key={i} className="text-white font-semibold">
              {part}
            </strong>
          ) : (
            <span key={i}>{part}</span>
          )
        )}
      </p>
    );
  });
}

export function AiInsightCard({ content, loading, onAnalyze, label }: AiInsightCardProps) {
  if (loading) {
    return (
      <div
        className="rounded-2xl border border-[#C8FC03]/20 p-5 relative overflow-hidden"
        style={{ background: "#1A1A2A" }}
      >
        {/* Top accent line */}
        <div
          className="absolute top-0 left-0 right-0 h-0.5"
          style={{ background: "linear-gradient(90deg, #C8FC03, transparent)" }}
        />
        <div className="inline-flex items-center gap-1.5 bg-[#C8FC03]/10 text-[#C8FC03] text-[11px] font-semibold px-2.5 py-1 rounded-full mb-3">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
          AI Coach
        </div>
        <div className="flex items-center gap-3">
          {/* Pulsing dots */}
          <div className="flex gap-1.5">
            <span
              className="w-2 h-2 rounded-full bg-[#C8FC03] animate-bounce"
              style={{ animationDelay: "0ms" }}
            />
            <span
              className="w-2 h-2 rounded-full bg-[#C8FC03] animate-bounce"
              style={{ animationDelay: "150ms" }}
            />
            <span
              className="w-2 h-2 rounded-full bg-[#C8FC03] animate-bounce"
              style={{ animationDelay: "300ms" }}
            />
          </div>
          <span className="text-sm text-[#9CA3AF] animate-pulse">Analyzing...</span>
        </div>
        {/* Skeleton lines */}
        <div className="mt-4 space-y-2">
          <div className="h-3 bg-white/5 rounded animate-pulse w-full" />
          <div className="h-3 bg-white/5 rounded animate-pulse w-5/6" />
          <div className="h-3 bg-white/5 rounded animate-pulse w-4/5" />
        </div>
      </div>
    );
  }

  if (content) {
    return (
      <div
        className="rounded-2xl border border-[#C8FC03]/20 p-5 relative overflow-hidden"
        style={{ background: "#1A1A2A" }}
      >
        {/* Top accent bar */}
        <div
          className="absolute top-0 left-0 right-0 h-0.5"
          style={{ background: "linear-gradient(90deg, #C8FC03, transparent)" }}
        />
        <div className="inline-flex items-center gap-1.5 bg-[#C8FC03]/10 text-[#C8FC03] text-[11px] font-semibold px-2.5 py-1 rounded-full mb-3">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
          AI Coach
        </div>
        <div>{renderContent(content)}</div>
        <button
          onClick={onAnalyze}
          className="mt-4 text-xs text-[#9CA3AF] hover:text-[#C8FC03] transition-colors underline underline-offset-2"
        >
          Re-analyze
        </button>
      </div>
    );
  }

  // No content, not loading — show analyze prompt
  return (
    <div
      className="rounded-2xl border border-[#C8FC03]/20 p-5 relative overflow-hidden"
      style={{ background: "#1A1A2A" }}
    >
      {/* Top accent line */}
      <div
        className="absolute top-0 left-0 right-0 h-0.5"
        style={{ background: "linear-gradient(90deg, #C8FC03, transparent)" }}
      />
      <div className="inline-flex items-center gap-1.5 bg-[#C8FC03]/10 text-[#C8FC03] text-[11px] font-semibold px-2.5 py-1 rounded-full mb-3">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
        </svg>
        AI Coach
      </div>
      <div className="text-sm text-white/50 leading-relaxed">
        Click <span className="text-white/70 font-medium">{label}</span> above to get personalized coaching feedback.
      </div>
    </div>
  );
}
