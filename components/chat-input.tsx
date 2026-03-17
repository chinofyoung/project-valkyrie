"use client";

import { useState } from "react";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled: boolean;
}

export default function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [value, setValue] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
  };

  const nearLimit = value.length > 1800;

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-center gap-2.5 px-4 py-3 border-t border-white/10"
      style={{ background: "rgba(10, 10, 10, 0.95)" }}
    >
      <div className="relative flex-1">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value.slice(0, 2000))}
          placeholder="Ask your coach..."
          disabled={disabled}
          className="w-full px-4 py-2.5 rounded-full text-sm text-white placeholder-white/40 outline-none border border-white/10 disabled:opacity-50"
          style={{ background: "#1A1A2A" }}
          maxLength={2000}
        />
        {nearLimit && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/50">
            {value.length}/2000
          </span>
        )}
      </div>

      <button
        type="submit"
        disabled={disabled || !value.trim()}
        className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-full disabled:opacity-50 active:scale-90 transition-transform duration-100"
        style={{ background: "#C8FC03" }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="#000">
          <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
        </svg>
      </button>
    </form>
  );
}
