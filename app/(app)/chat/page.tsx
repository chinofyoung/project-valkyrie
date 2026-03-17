"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useAction } from "convex/react";
// @ts-ignore
import { api } from "@/convex/_generated/api";
import ChatMessage from "@/components/chat-message";
import ChatInput from "@/components/chat-input";

function TypingIndicator() {
  return (
    <div className="flex flex-col items-start gap-1">
      <div
        className="px-4 py-3"
        style={{
          background: "#1A1A2A",
          borderLeft: "2px solid #C8FC03",
          borderRadius: "16px 16px 16px 4px",
        }}
      >
        <div className="flex gap-1 items-center h-5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-2 h-2 rounded-full bg-white/60"
              style={{
                animation: "bounce 1.2s infinite",
                animationDelay: `${i * 0.2}s`,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function ChatPage() {
  const messages = useQuery(api.chatMessages.list, {});
  const isAiResponding = useQuery(api.chatMessages.isAiResponding);
  const sendMessage = useAction(api.chat.sendMessage);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  // Auto-scroll to bottom when messages change or AI starts/stops responding
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isAiResponding]);

  const handleSend = async (message: string) => {
    setError(null);
    try {
      await sendMessage({ message });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to send message";
      setError(msg);
    }
  };

  return (
    <div className="flex flex-col" style={{ background: "#0A0A0A" }}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 border-b border-white/10">
        <div>
          <h1 className="text-xl font-bold text-white">AI Coach</h1>
          <p className="text-xs text-white/50 mt-0.5">Always aware of your training</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10" style={{ background: "#1A1A2A" }}>
          <span
            className="w-2 h-2 rounded-full"
            style={{ background: "#C8FC03" }}
          />
          <span className="text-xs font-medium" style={{ color: "#C8FC03" }}>
            Online
          </span>
        </div>
      </div>

      {/* Messages area */}
      <div className="px-4 py-4 pb-2">
        {messages == null ? (
          // Loading state — skeleton chat bubbles
          <div className="flex flex-col gap-3">
            {/* Assistant bubble (left-aligned, wide) */}
            <div className="flex flex-col items-start gap-1">
              <div
                className="w-[65%] px-4 py-3"
                style={{
                  background: "#1A1A2A",
                  borderLeft: "2px solid rgba(255,255,255,0.08)",
                  borderRadius: "16px 16px 16px 4px",
                }}
              >
                <div className="bg-white/5 animate-pulse rounded h-3 w-full mb-2" />
                <div className="bg-white/5 animate-pulse rounded h-3 w-4/5" />
              </div>
            </div>

            {/* User bubble (right-aligned, short) */}
            <div className="flex flex-col items-end gap-1">
              <div
                className="w-[35%] px-4 py-3"
                style={{
                  borderRadius: "16px 16px 4px 16px",
                  background: "rgba(200,252,3,0.08)",
                  border: "1px solid rgba(200,252,3,0.15)",
                }}
              >
                <div className="bg-white/5 animate-pulse rounded h-3 w-full" />
              </div>
            </div>

            {/* Assistant bubble (left-aligned, medium) */}
            <div className="flex flex-col items-start gap-1">
              <div
                className="w-[55%] px-4 py-3"
                style={{
                  background: "#1A1A2A",
                  borderLeft: "2px solid rgba(255,255,255,0.08)",
                  borderRadius: "16px 16px 16px 4px",
                }}
              >
                <div className="bg-white/5 animate-pulse rounded h-3 w-full mb-2" />
                <div className="bg-white/5 animate-pulse rounded h-3 w-3/5" />
              </div>
            </div>
          </div>
        ) : messages.length === 0 && !isAiResponding ? (
          // Empty / welcome state
          <div className="flex flex-col items-start gap-1">
            <div
              className="max-w-[85%] px-4 py-3 text-sm leading-relaxed text-white/90"
              style={{
                background: "#1A1A2A",
                borderLeft: "2px solid #C8FC03",
                borderRadius: "16px 16px 16px 4px",
              }}
            >
              Hi! I&apos;m your AI running coach. I know your Strava training
              data, so feel free to ask me anything about your running.
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((msg: any) => (
              <ChatMessage
                key={msg._id}
                role={msg.role}
                content={msg.content}
                createdAt={msg.createdAt}
              />
            ))}
            {isAiResponding && <TypingIndicator />}
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="mt-3 px-4 py-2 rounded-lg text-sm text-red-400 border border-red-400/20" style={{ background: "rgba(239,68,68,0.1)" }}>
            {error}
          </div>
        )}

        {/* Scroll anchor */}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <ChatInput onSend={handleSend} disabled={!!isAiResponding} />

      {/* Bounce animation keyframes */}
      <style jsx global>{`
        @keyframes bounce {
          0%, 60%, 100% { transform: translateY(0); }
          30% { transform: translateY(-6px); }
        }
      `}</style>
    </div>
  );
}
