interface ChatMessageProps {
  role: "user" | "assistant";
  content: string;
  createdAt: number;
}

function renderContent(content: string): React.ReactNode {
  // Split on **text** markers and render bold segments
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

export default function ChatMessage({ role, content, createdAt }: ChatMessageProps) {
  const isUser = role === "user";

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
