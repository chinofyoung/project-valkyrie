import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
        <MarkdownContent content={content} />
      </div>
      <span className="text-xs text-white/40 pl-1">{relativeTime(createdAt)}</span>
    </div>
  );
}
