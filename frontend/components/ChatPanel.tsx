"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Zap, Bot, User } from "lucide-react";
import type { ChatMessage } from "@/lib/api";

const GREETING: ChatMessage = {
  role: "assistant",
  content:
    "Hi! I'm your content creation assistant. Tell me what you'd like to post — " +
    "a LinkedIn post, Facebook post, or Instagram caption. " +
    "I'll ask a question if I need more details, or click Generate Now to go straight away.",
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
  const bottomRef = useRef<HTMLDivElement>(null);
  const hasUserMessage = messages.some((m) => m.role === "user");

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isClarifying]);

  function submit() {
    const text = input.trim();
    if (!text || isClarifying || isGenerating) return;
    setInput("");
    onSendMessage(text);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 780, margin: "0 auto" }}
    >
      {/* Chat history */}
      <div
        style={{
          minHeight: 360,
          maxHeight: "calc(100vh - 320px)",
          overflowY: "auto",
          borderRadius: 16,
          border: "1px solid var(--border)",
          background: "rgba(7,7,15,0.5)",
          backdropFilter: "blur(20px)",
          padding: "20px 16px",
          display: "flex",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <AnimatePresence initial={false}>
          {messages.map((m, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 10, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.25 }}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                flexDirection: m.role === "user" ? "row-reverse" : "row",
              }}
            >
              {/* Avatar */}
              <div
                style={{
                  width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: m.role === "user"
                    ? "linear-gradient(135deg,#f43f5e,#a855f7)"
                    : "rgba(255,255,255,0.07)",
                  border: "1px solid var(--border)",
                }}
              >
                {m.role === "user"
                  ? <User size={13} color="white" />
                  : <Bot size={13} color="#fda4af" />
                }
              </div>

              {/* Bubble */}
              <div
                style={{
                  maxWidth: "78%",
                  borderRadius: m.role === "user" ? "14px 4px 14px 14px" : "4px 14px 14px 14px",
                  padding: "10px 14px",
                  fontSize: 14,
                  lineHeight: 1.55,
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  background: m.role === "user"
                    ? "linear-gradient(135deg, rgba(244,63,94,0.28), rgba(168,85,247,0.28))"
                    : "rgba(255,255,255,0.05)",
                  border: "1px solid",
                  borderColor: m.role === "user"
                    ? "rgba(244,63,94,0.28)"
                    : "var(--border)",
                  color: "var(--text)",
                }}
              >
                {m.content}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {isClarifying && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            style={{ display: "flex", alignItems: "center", gap: 8 }}
          >
            <div style={{
              width: 28, height: 28, borderRadius: 8,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: "rgba(255,255,255,0.07)", border: "1px solid var(--border)",
            }}>
              <Bot size={13} color="#fda4af" />
            </div>
            <div style={{
              background: "rgba(255,255,255,0.05)", border: "1px solid var(--border)",
              borderRadius: "4px 14px 14px 14px", padding: "10px 16px",
              display: "flex", gap: 4, alignItems: "center",
            }}>
              {[0, 0.15, 0.3].map((delay, i) => (
                <motion.span
                  key={i}
                  style={{ width: 6, height: 6, borderRadius: "50%", background: "#fda4af", display: "block" }}
                  animate={{ opacity: [0.3, 1, 0.3], y: [0, -4, 0] }}
                  transition={{ duration: 1, repeat: Infinity, delay }}
                />
              ))}
            </div>
          </motion.div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Generate button */}
      <AnimatePresence>
        {hasUserMessage && (
          <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            type="button"
            onClick={onGenerate}
            disabled={isGenerating}
            style={{
              width: "100%", padding: "13px",
              borderRadius: 12, border: "none",
              background: isGenerating
                ? "rgba(244,63,94,0.28)"
                : "linear-gradient(135deg,#f43f5e,#a855f7)",
              color: "white", fontWeight: 600, fontSize: 14,
              cursor: isGenerating ? "not-allowed" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
              boxShadow: isGenerating ? "none" : "0 4px 24px rgba(244,63,94,0.40)",
              transition: "all 0.2s",
              position: "relative", overflow: "hidden",
            }}
          >
            {isGenerating && (
              <motion.span
                style={{
                  position: "absolute", inset: 0,
                  background: "linear-gradient(90deg,transparent 25%,rgba(255,255,255,0.1) 50%,transparent 75%)",
                  backgroundSize: "200% 100%",
                }}
                animate={{ backgroundPosition: ["200% center", "-200% center"] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
            )}
            <Zap size={16} />
            {isGenerating ? progressLabel || "Generating…" : chatReady ? "Generate Now" : "Generate Now"}
          </motion.button>
        )}
      </AnimatePresence>

      {/* Input row */}
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
          placeholder="Describe the content you want to create…"
          disabled={isGenerating}
          className="input"
          style={{
            flex: 1, borderRadius: 12, padding: "12px 16px", fontSize: 14,
            opacity: isGenerating ? 0.5 : 1,
          }}
        />
        <motion.button
          type="button"
          onClick={submit}
          disabled={isGenerating || isClarifying || !input.trim()}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          style={{
            padding: "12px 18px", borderRadius: 12,
            background: "linear-gradient(135deg,#f43f5e,#a855f7)",
            border: "none", color: "white", cursor: "pointer",
            display: "flex", alignItems: "center", gap: 6,
            opacity: (isGenerating || isClarifying || !input.trim()) ? 0.4 : 1,
            transition: "opacity 0.2s",
          }}
        >
          <Send size={15} />
        </motion.button>
      </div>
    </motion.div>
  );
}
