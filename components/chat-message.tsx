interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  displayText?: string;
  createdAt: number;
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

export default function ChatMessage({ role, content, displayText, createdAt }: ChatMessageProps) {
  const isUser = role === "user";

  // Context message (analysis added to chat)
  if (displayText) {
    return (
      <div className="flex flex-col items-start gap-1">
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
        <span className="text-xs text-white/40 pl-1">{relativeTime(createdAt)}</span>
      </div>
    );
  }

  if (isUser) {
    return (
      <div className="flex flex-col items-end gap-1">
        <div
          className="max-w-[85%] px-4 py-3 text-sm leading-relaxed text-black"
          style={{
            background: "#C8FC03",
            borderRadius: "16px 16px 4px 16px",
          }}
        >
          {renderContent(content)}
        </div>
        <span className="text-xs text-white/40 pr-1">{relativeTime(createdAt)}</span>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <div
        className="max-w-[85%] px-4 py-3 text-sm leading-relaxed text-white/90"
        style={{
          background: "#1A1A2A",
          borderLeft: "2px solid #C8FC03",
          borderRadius: "16px 16px 16px 4px",
        }}
      >
        {renderContent(content)}
      </div>
      <span className="text-xs text-white/40 pl-1">{relativeTime(createdAt)}</span>
    </div>
  );
}
