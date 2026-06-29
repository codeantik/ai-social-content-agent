"use client";

import { useState, useEffect } from "react";
import { useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { AnimatedBackground } from "@/components/AnimatedBackground";
import { Sidebar } from "@/components/Sidebar";
import { ChatPanel, GREETING } from "@/components/ChatPanel";
import { ResultPanel } from "@/components/ResultPanel";
import { clarify, type ChatMessage } from "@/lib/api";
import { useGenerateStream } from "@/lib/useGenerateStream";
import { getSessionId } from "@/lib/session";
import type { FacebookConnection, GenerationResult, LinkedInConnection, Mode } from "@/lib/types";

const FB_STORAGE_KEY = "content-agent:fb-oauth";
const LI_STORAGE_KEY = "content-agent:li-oauth";

function readFbConnectionFromStorage(): FacebookConnection {
  const empty: FacebookConnection = { connected: false, token: null, pages: [], selectedPageId: null, error: null };
  if (typeof window === "undefined") return empty;
  const raw = sessionStorage.getItem(FB_STORAGE_KEY);
  if (!raw) return empty;
  sessionStorage.removeItem(FB_STORAGE_KEY);
  try {
    const parsed = JSON.parse(raw);
    if (parsed.error) return { ...empty, error: parsed.error };
    return { connected: true, token: parsed.token, pages: parsed.pages ?? [], selectedPageId: parsed.pages?.[0]?.id ?? null, error: null };
  } catch { return empty; }
}

function readLiConnectionFromStorage(): LinkedInConnection {
  const empty: LinkedInConnection = { connected: false, token: null, orgId: "", error: null };
  if (typeof window === "undefined") return empty;
  const raw = sessionStorage.getItem(LI_STORAGE_KEY);
  if (!raw) return empty;
  sessionStorage.removeItem(LI_STORAGE_KEY);
  try {
    const parsed = JSON.parse(raw);
    if (parsed.error) return { ...empty, error: parsed.error };
    return { connected: true, token: parsed.token, orgId: "", error: null };
  } catch { return empty; }
}

export default function Home() {
  const [mode, setMode] = useState<Mode>("chat");
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [chatReady, setChatReady] = useState(false);
  const [sessionId] = useState(() => getSessionId());
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    function check() {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      if (mobile) setSidebarOpen(false);
    }
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const [generateImage, setGenerateImage] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<File | null>(null);

  const [result, setResult] = useState<GenerationResult | null>(null);
  const [editorContent, setEditorContent] = useState("");

  const [fbConnection, setFbConnection] = useState<FacebookConnection>(() => readFbConnectionFromStorage());
  const [liConnection, setLiConnection] = useState<LinkedInConnection>(() => readLiConnectionFromStorage());

  const clarifyMutation = useMutation({
    mutationFn: (history: ChatMessage[]) => clarify(history),
  });

  const { start: startGenerate, progressLabel, isStreaming } = useGenerateStream();

  function handleSendMessage(text: string) {
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    clarifyMutation.mutate(next, {
      onSuccess: (data) => {
        setMessages((m) => [...m, { role: "assistant", content: data.response }]);
        if (data.ready) setChatReady(true);
      },
    });
  }

  function handleVoiceTranscript(text: string) {
    if (mode === "chat") handleSendMessage(text);
  }

  async function handleGenerate() {
    const userMessages = messages.slice(1).filter((m) => m.role === "user");
    const originalQuery = userMessages[0]?.content ?? "";
    const clarificationContext = userMessages.map((m) => m.content).join("\n");

    const final = await startGenerate({
      brief: originalQuery,
      sessionId,
      generateImage,
      summary: clarificationContext,
      image: uploadedImage,
    });

    setResult({
      content: final.content,
      retrievalSources: final.retrieval_sources,
      imageBase64: final.image_base64,
      imageError: final.image_error,
      originalQuery,
      hasImage: generateImage || !!uploadedImage,
      imageUploaded: !!uploadedImage,
    });
    setEditorContent(final.content);
    setMode("result");
  }

  function handleStartOver() {
    setMode("chat");
    setMessages([GREETING]);
    setChatReady(false);
    setResult(null);
    setUploadedImage(null);
  }

  const fbEnabled = process.env.NEXT_PUBLIC_FACEBOOK_ENABLED === "true";
  const liEnabled = process.env.NEXT_PUBLIC_LINKEDIN_ENABLED === "true";

  return (
    <div style={{ position: "relative", minHeight: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <AnimatedBackground />

      {/* Header */}
      <motion.header
        initial={{ y: -24, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        style={{
          position: "relative",
          zIndex: 10,
          background: "rgba(12,5,16,0.82)",
          backdropFilter: "blur(28px) saturate(1.6)",
          WebkitBackdropFilter: "blur(28px) saturate(1.6)",
          padding: isMobile ? "0 16px" : "0 32px",
          height: 62,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          boxShadow: "0 8px 32px rgba(0,0,0,0.45)",
        }}
      >
        {/* Animated bottom border with shimmer sweep */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 1, overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(244,63,94,0.14)" }} />
          <motion.div
            style={{
              position: "absolute", top: 0, width: "38%", height: "100%",
              background: "linear-gradient(90deg, transparent 0%, rgba(244,63,94,0.9) 40%, rgba(168,85,247,0.7) 60%, transparent 100%)",
            }}
            animate={{ x: ["-38%", "270%"] }}
            transition={{ duration: 3.8, ease: "easeInOut", repeat: Infinity, repeatDelay: 3.5 }}
          />
        </div>

        {/* Logo + wordmark */}
        <div style={{ display: "flex", alignItems: "center", gap: 13 }}>
          {/* Animated logo container */}
          <motion.div
            animate={{
              boxShadow: [
                "0 0 0 1px rgba(244,63,94,0.30), 0 0 16px rgba(244,63,94,0.30)",
                "0 0 0 1px rgba(244,63,94,0.55), 0 0 28px rgba(244,63,94,0.55), 0 0 48px rgba(168,85,247,0.22)",
                "0 0 0 1px rgba(244,63,94,0.30), 0 0 16px rgba(244,63,94,0.30)",
              ],
            }}
            transition={{ duration: 3.2, ease: "easeInOut", repeat: Infinity }}
            style={{
              width: 40, height: 40, borderRadius: 13, flexShrink: 0,
              background: "linear-gradient(145deg, #be123c 0%, #f43f5e 45%, #7c3aed 100%)",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            {/* Icon: diagonal pen stroke → neural cluster */}
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
              {/* Pen body */}
              <path d="M6 16 L13.5 8.5" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeOpacity="0.92" />
              {/* Nib tip */}
              <path d="M4.5 17.5 C4.5 17.5 5.2 15.8 6 16 C6.8 16.2 7.5 17 7.5 17 Z"
                fill="white" fillOpacity="0.75" />
              {/* Primary AI node */}
              <circle cx="14.2" cy="7.8" r="2.1" fill="white" fillOpacity="0.92" />
              {/* Satellite nodes */}
              <circle cx="18" cy="5" r="1.35" fill="white" fillOpacity="0.60" />
              <circle cx="18" cy="10.6" r="1.35" fill="white" fillOpacity="0.60" />
              {/* Connections */}
              <line x1="14.2" y1="7.8" x2="18" y2="5"   stroke="white" strokeWidth="1.0" strokeLinecap="round" strokeOpacity="0.50" />
              <line x1="14.2" y1="7.8" x2="18" y2="10.6" stroke="white" strokeWidth="1.0" strokeLinecap="round" strokeOpacity="0.50" />
              <line x1="18"   y1="5"   x2="18" y2="10.6" stroke="white" strokeWidth="0.75" strokeLinecap="round" strokeOpacity="0.28" />
            </svg>
          </motion.div>

          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <span style={{
              fontSize: 15,
              fontWeight: 700,
              letterSpacing: "-0.035em",
              lineHeight: 1,
              background: "linear-gradient(95deg, #fce7f3 0%, #fae8ff 55%, #ffedd5 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
            }}>
              Content Creator AI
            </span>
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              {/* Live status dot */}
              <motion.span
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 2.4, ease: "easeInOut", repeat: Infinity }}
                style={{ width: 5, height: 5, borderRadius: "50%", background: "#34d399", display: "inline-block", flexShrink: 0 }}
              />
              <span style={{ fontSize: 10.5, color: "var(--text-muted)", letterSpacing: "0.02em" }}>
                AI Content Agent
              </span>
            </div>
          </div>
        </div>

        {/* Toggle button */}
        <motion.button
          onClick={() => setSidebarOpen((v) => !v)}
          aria-label={sidebarOpen ? "Hide side panel" : "Show side panel"}
          whileHover={{ scale: 1.04, backgroundColor: "rgba(244,63,94,0.12)", borderColor: "rgba(244,63,94,0.35)" }}
          whileTap={{ scale: 0.96 }}
          style={{
            display: "flex", alignItems: "center", gap: 7,
            background: "rgba(255,255,255,0.045)",
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: 9,
            padding: isMobile ? "7px 10px" : "7px 14px",
            color: "rgba(241,245,249,0.55)",
            cursor: "pointer",
            fontSize: 12,
            letterSpacing: "0.01em",
            fontWeight: 500,
          }}
        >
          {/* Panel layout icon */}
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
            <rect x="1" y="1" width="5.5" height="13" rx="1.8"
              fill="currentColor" fillOpacity={sidebarOpen ? 0.55 : 0.20} />
            <rect x="8" y="1" width="6" height="13" rx="1.8"
              fill="currentColor" fillOpacity={sidebarOpen ? 0.20 : 0.55} />
          </svg>
          {!isMobile && (sidebarOpen ? "Hide panel" : "Show panel")}
        </motion.button>
      </motion.header>

      <div style={{ position: "relative", zIndex: 10, display: "flex", flex: 1, overflow: "hidden" }}>
        {/* Mobile backdrop */}
        {isMobile && sidebarOpen && (
          <div
            onClick={() => setSidebarOpen(false)}
            style={{
              position: "fixed", inset: 0, zIndex: 20,
              background: "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)",
            }}
          />
        )}

        {/* Sidebar — overlay on mobile, inline on desktop */}
        <motion.div
          initial={false}
          animate={
            isMobile
              ? { x: sidebarOpen ? 0 : -300, opacity: sidebarOpen ? 1 : 0 }
              : { width: sidebarOpen ? 300 : 0, opacity: sidebarOpen ? 1 : 0 }
          }
          transition={{ duration: 0.28, ease: "easeInOut" }}
          style={
            isMobile
              ? { position: "fixed", top: 62, left: 0, bottom: 0, width: 300, zIndex: 30, overflow: "hidden" }
              : { overflow: "hidden", flexShrink: 0 }
          }
        >
          <div style={{ width: 300 }}>
            <Sidebar
              generateImage={generateImage}
              onGenerateImageChange={setGenerateImage}
              uploadedImage={uploadedImage}
              onUploadedImageChange={setUploadedImage}
              onVoiceTranscript={handleVoiceTranscript}
              fbEnabled={fbEnabled}
              fbConnection={fbConnection}
              onFbSelectPage={(pageId) => setFbConnection((c) => ({ ...c, selectedPageId: pageId }))}
              onFbDisconnect={() => setFbConnection({ connected: false, token: null, pages: [], selectedPageId: null, error: null })}
              liEnabled={liEnabled}
              liConnection={liConnection}
              onLiOrgIdChange={(orgId) => setLiConnection((c) => ({ ...c, orgId }))}
              onLiDisconnect={() => setLiConnection({ connected: false, token: null, orgId: "", error: null })}
            />
          </div>
        </motion.div>

        {/* Main */}
        <main style={{
          flex: 1,
          overflowY: "auto",
          padding: isMobile ? "16px 16px" : "28px 32px",
          minWidth: 0,
        }}>
          {mode === "chat" ? (
            <ChatPanel
              messages={messages}
              onSendMessage={handleSendMessage}
              chatReady={chatReady}
              onGenerate={handleGenerate}
              isClarifying={clarifyMutation.isPending}
              isGenerating={isStreaming}
              progressLabel={progressLabel}
            />
          ) : result ? (
            <ResultPanel
              result={result}
              editorContent={editorContent}
              onEditorContentChange={setEditorContent}
              onStartOver={handleStartOver}
              fbConnection={fbConnection}
              liConnection={liConnection}
            />
          ) : null}
        </main>
      </div>
    </div>
  );
}
