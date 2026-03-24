"use client";

import { useState } from "react";

interface AiInsightCardProps {
  content: string | null;
  loading: boolean;
  onAnalyze: () => void;
  onAddToChat?: (content: string) => void | Promise<void>;
  label: string;
  defaultExpanded?: boolean;
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

export function AiInsightCard({ content, loading, onAnalyze, onAddToChat, label, defaultExpanded }: AiInsightCardProps) {
  const [collapsed, setCollapsed] = useState(!defaultExpanded);
  const [addingToChat, setAddingToChat] = useState(false);

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
        <button
          onClick={() => setCollapsed((prev) => !prev)}
          className="flex items-center justify-between w-full mb-3 group"
        >
          <div className="inline-flex items-center gap-1.5 bg-[#C8FC03]/10 text-[#C8FC03] text-[11px] font-semibold px-2.5 py-1 rounded-full">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
            </svg>
            AI Coach
          </div>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-[#C8FC03]/60 group-hover:text-[#C8FC03] transition-all duration-300"
            style={{ transform: collapsed ? "rotate(-90deg)" : "rotate(0deg)" }}
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </button>
        <div>{renderContent(collapsed ? content.split(/\s+/).slice(0, 120).join(" ") + "..." : content)}</div>
        {!collapsed && (
          <div className="flex items-center gap-3 mt-4">
            <button
              onClick={onAnalyze}
              disabled={loading}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold bg-white/5 border border-white/5 text-[#9CA3AF] hover:text-white hover:bg-white/10 active:scale-95 active:bg-white/15 transition-all duration-100 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className={loading ? "animate-spin" : ""} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Re-analyze
            </button>
            {onAddToChat && content && (
              <button
                onClick={async () => {
                  setAddingToChat(true);
                  try { await onAddToChat(content); } finally { setAddingToChat(false); }
                }}
                disabled={addingToChat}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold bg-[#C8FC03]/10 border border-[#C8FC03]/20 text-[#C8FC03] hover:bg-[#C8FC03]/20 active:scale-95 active:bg-[#C8FC03]/30 transition-all duration-100 disabled:opacity-50"
              >
                {addingToChat ? (
                  <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                  </svg>
                )}
                {addingToChat ? "Adding..." : "Add to Chat"}
              </button>
            )}
          </div>
        )}
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
