"use client";

import { useState } from "react";
import type { ChatMessage } from "@/lib/api";

const GREETING: ChatMessage = {
  role: "assistant",
  content:
    "Hi! I'm your content creation assistant. Tell me what you'd like to post — " +
    "a LinkedIn post, Facebook post, or Instagram caption for your organization. " +
    "I'll ask a question if I need more details, or you can click **Generate Now** straight away.",
};

export { GREETING };

type Props = {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  chatReady: boolean;
  onGenerate: () => void;
  isClarifying: boolean;
  isGenerating: boolean;
  progressLabel: string | null;
  pendingVoiceText?: string;
};

export function ChatPanel({
  messages,
  onSendMessage,
  chatReady,
  onGenerate,
  isClarifying,
  isGenerating,
  progressLabel,
}: Props) {
  const [input, setInput] = useState("");
  const hasUserMessage = messages.some((m) => m.role === "user");

  function submit() {
    const text = input.trim();
    if (!text || isClarifying) return;
    setInput("");
    onSendMessage(text);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="h-[420px] overflow-y-auto rounded-lg border border-black/10 p-4 flex flex-col gap-3">
        {messages.map((m, i) => (
          <div
            key={i}
            className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
              m.role === "user"
                ? "self-end bg-blue-600 text-white"
                : "self-start bg-black/5"
            }`}
          >
            {m.content}
          </div>
        ))}
        {isClarifying && (
          <div className="self-start text-sm text-black/50">Thinking…</div>
        )}
      </div>

      {hasUserMessage && (
        <button
          type="button"
          onClick={onGenerate}
          disabled={isGenerating}
          className="w-full rounded-lg bg-blue-600 px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          {isGenerating
            ? progressLabel || "Generating…"
            : chatReady
              ? "✅ Generate Now"
              : "🚀 Generate Now"}
        </button>
      )}

      <div className="flex gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
          placeholder="Describe the content you want to create…"
          className="flex-1 rounded-lg border border-black/10 px-3 py-2 text-sm"
          disabled={isGenerating}
        />
        <button
          type="button"
          onClick={submit}
          disabled={isGenerating || isClarifying}
          className="rounded-lg border border-black/10 px-4 py-2 text-sm"
        >
          Send
        </button>
      </div>
    </div>
  );
}
