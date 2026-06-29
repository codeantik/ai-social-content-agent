"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  RotateCcw, Scissors, Hash, Briefcase, Smile, Send, Copy, Check,
  ChevronDown, ChevronUp, Image as ImageIcon,
} from "lucide-react";

function FbIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect width="24" height="24" rx="5" fill="#f43f5e" />
      <path d="M16.5 8H14a1 1 0 0 0-1 1v2h3.5l-.5 3H13v7h-3v-7H8v-3h2V9a4 4 0 0 1 4-4h2.5v3Z" fill="white" />
    </svg>
  );
}

function LiIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect width="24" height="24" rx="5" fill="#a855f7" />
      <path d="M7 9.5h2.5V17H7V9.5ZM8.25 8.5a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5ZM17 17h-2.5v-3.5c0-1-.4-1.5-1.2-1.5-.8 0-1.3.6-1.3 1.5V17H9.5V9.5H12v1c.4-.7 1.2-1.2 2.2-1.2 1.8 0 2.8 1.2 2.8 3.3V17Z" fill="white" />
    </svg>
  );
}
import { editContent, publishToFacebook, publishToLinkedIn } from "@/lib/api";
import type { FacebookConnection, GenerationResult, LinkedInConnection } from "@/lib/types";

const QUICK_ACTIONS = [
  { label: "Shorter", icon: <Scissors size={13} />, instruction: "Make it concisely shorter; remove filler words" },
  { label: "Hashtags", icon: <Hash size={13} />, instruction: "Add 3–5 relevant hashtags at the end" },
  { label: "Formal", icon: <Briefcase size={13} />, instruction: "Rewrite in a more professional, formal tone" },
  { label: "Casual", icon: <Smile size={13} />, instruction: "Rewrite in a friendlier, more casual tone" },
];

type Props = {
  result: GenerationResult;
  editorContent: string;
  onEditorContentChange: (v: string) => void;
  onStartOver: () => void;
  fbConnection: FacebookConnection;
  liConnection: LinkedInConnection;
};

export function ResultPanel({ result, editorContent, onEditorContentChange, onStartOver, fbConnection, liConnection }: Props) {
  const [editInput, setEditInput] = useState("");
  const [copied, setCopied] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [publishMsg, setPublishMsg] = useState<{ kind: "fb" | "li"; text: string; ok: boolean } | null>(null);

  const edit = useMutation({
    mutationFn: (instruction: string) => editContent(editorContent, instruction, result.originalQuery),
    onSuccess: (data) => onEditorContentChange(data.content),
  });

  const fbPublish = useMutation({
    mutationFn: () => {
      const page = fbConnection.pages.find((p) => p.id === fbConnection.selectedPageId) ?? fbConnection.pages[0];
      if (!page) throw new Error("No Facebook page selected");
      return publishToFacebook({ page_id: page.id, page_access_token: page.access_token, content: editorContent, image_base64: result.imageBase64 });
    },
    onSuccess: (data) => {
      const parts = data.post_id.split("_");
      const url = parts.length === 2 ? `https://www.facebook.com/${parts[0]}/posts/${parts[1]}` : "https://www.facebook.com/";
      setPublishMsg({ kind: "fb", text: `Published! ${url}`, ok: true });
    },
    onError: (err) => setPublishMsg({ kind: "fb", text: err instanceof Error ? err.message : "Failed", ok: false }),
  });

  const liPublish = useMutation({
    mutationFn: () => {
      if (!liConnection.token) throw new Error("Not connected to LinkedIn");
      return publishToLinkedIn({ org_urn: `urn:li:organization:${liConnection.orgId.trim()}`, access_token: liConnection.token, content: editorContent, image_base64: result.imageBase64 });
    },
    onSuccess: (data) => {
      setPublishMsg({ kind: "li", text: `Published! linkedin.com/feed/update/${data.post_urn}/`, ok: true });
    },
    onError: (err) => setPublishMsg({ kind: "li", text: err instanceof Error ? err.message : "Failed", ok: false }),
  });

  const liOrgValid = /^\d+$/.test(liConnection.orgId.trim());

  function copy() {
    navigator.clipboard.writeText(editorContent).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      style={{ display: "flex", flexDirection: "column", gap: 14, maxWidth: 800, margin: "0 auto" }}
    >
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em" }}>
          Generated Content
        </h2>
        <motion.button
          type="button"
          onClick={onStartOver}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "7px 14px", borderRadius: 10,
            background: "var(--surface)", border: "1px solid var(--border)",
            color: "var(--text-muted)", cursor: "pointer", fontSize: 13,
          }}
        >
          <RotateCcw size={13} />
          Start Over
        </motion.button>
      </div>

      {/* Textarea */}
      <div style={{ position: "relative" }}>
        <textarea
          value={editorContent}
          onChange={(e) => onEditorContentChange(e.target.value)}
          className="input"
          style={{
            width: "100%", minHeight: 300, padding: "16px",
            borderRadius: 14, fontSize: 14, lineHeight: 1.65,
            resize: "vertical", fontFamily: "var(--font-geist-sans)",
          }}
        />
        <button
          type="button"
          onClick={copy}
          style={{
            position: "absolute", top: 10, right: 10,
            display: "flex", alignItems: "center", gap: 5,
            padding: "5px 10px", borderRadius: 7,
            background: "var(--surface)", border: "1px solid var(--border)",
            color: copied ? "var(--success)" : "var(--text-muted)",
            cursor: "pointer", fontSize: 12, transition: "all 0.2s",
          }}
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      {/* Quick actions */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8 }}>
        {QUICK_ACTIONS.map(({ label, icon, instruction }) => (
          <motion.button
            key={label}
            type="button"
            disabled={edit.isPending}
            onClick={() => edit.mutate(instruction)}
            whileHover={{ scale: 1.03, borderColor: "rgba(244,63,94,0.45)" }}
            whileTap={{ scale: 0.97 }}
            style={{
              display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
              padding: "8px 10px", borderRadius: 9,
              background: "var(--surface)", border: "1px solid var(--border)",
              color: "var(--text-muted)", cursor: edit.isPending ? "not-allowed" : "pointer",
              fontSize: 12, fontWeight: 500,
              opacity: edit.isPending ? 0.5 : 1, transition: "all 0.15s",
            }}
          >
            {icon}
            {label}
          </motion.button>
        ))}
      </div>
      {edit.isPending && (
        <p style={{ fontSize: 12, color: "var(--text-muted)" }}>Applying…</p>
      )}

      {/* Edit input */}
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={editInput}
          onChange={(e) => setEditInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && editInput.trim()) {
              edit.mutate(editInput.trim());
              setEditInput("");
            }
          }}
          placeholder="Ask for any changes…"
          className="input"
          style={{ flex: 1, padding: "11px 14px", borderRadius: 10, fontSize: 13 }}
        />
        <motion.button
          type="button"
          onClick={() => { if (editInput.trim()) { edit.mutate(editInput.trim()); setEditInput(""); } }}
          disabled={!editInput.trim() || edit.isPending}
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          style={{
            padding: "11px 16px", borderRadius: 10,
            background: "linear-gradient(135deg,#f43f5e,#a855f7)",
            border: "none", color: "white", cursor: "pointer",
            opacity: (!editInput.trim() || edit.isPending) ? 0.4 : 1, transition: "opacity 0.2s",
          }}
        >
          <Send size={14} />
        </motion.button>
      </div>

      {/* Image */}
      {result.hasImage && (
        <div style={{
          borderRadius: 14, border: "1px solid var(--border)",
          background: "var(--surface)", padding: 14, backdropFilter: "blur(20px)",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10, color: "var(--text-muted)", fontSize: 13 }}>
            <ImageIcon size={14} />
            {result.imageUploaded ? "Your Image" : "Generated Image"}
          </div>
          {result.imageBase64 ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={`data:image/png;base64,${result.imageBase64}`}
              alt="Generated"
              style={{ maxWidth: "100%", borderRadius: 10, border: "1px solid var(--border)" }}
            />
          ) : result.imageError ? (
            <p style={{ fontSize: 13, color: "var(--danger)" }}>Image failed: {result.imageError}</p>
          ) : (
            <p style={{ fontSize: 13, color: "var(--text-muted)" }}>Image not available.</p>
          )}
        </div>
      )}

      {/* Sources */}
      {result.retrievalSources.length > 0 && (
        <div style={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--surface)", overflow: "hidden" }}>
          <button
            type="button"
            onClick={() => setShowSources((v) => !v)}
            style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
              padding: "12px 14px", background: "transparent", border: "none",
              color: "var(--text-muted)", cursor: "pointer", fontSize: 13,
            }}
          >
            Sources used ({result.retrievalSources.length})
            {showSources ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          <AnimatePresence>
            {showSources && (
              <motion.ul
                initial={{ height: 0 }}
                animate={{ height: "auto" }}
                exit={{ height: 0 }}
                style={{ overflow: "hidden", listStyle: "disc", padding: "0 14px 12px 28px", margin: 0 }}
              >
                {result.retrievalSources.map((src, i) => (
                  <li key={i} style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 4 }}>{src}</li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Publish */}
      {(fbConnection.connected || (liConnection.connected && liOrgValid)) && (
        <div style={{
          borderRadius: 14, border: "1px solid var(--border)",
          background: "var(--surface)", backdropFilter: "blur(20px)", padding: 14,
        }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: "var(--text-muted)", marginBottom: 10 }}>
            PUBLISH
          </p>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {fbConnection.connected && fbConnection.pages.length > 0 && (
              <motion.button
                type="button"
                onClick={() => fbPublish.mutate()}
                disabled={fbPublish.isPending}
                whileHover={{ scale: 1.02, boxShadow: "0 0 16px rgba(244,63,94,0.22)", backgroundColor: "rgba(244,63,94,0.18)", borderColor: "rgba(244,63,94,0.55)" }}
                whileTap={{ scale: 0.97 }}
                style={{
                  display: "flex", alignItems: "center", gap: 7,
                  padding: "9px 16px", borderRadius: 10,
                  background: "rgba(244,63,94,0.10)", border: "1px solid rgba(244,63,94,0.30)",
                  color: "#fecdd3", cursor: fbPublish.isPending ? "not-allowed" : "pointer",
                  fontSize: 13, fontWeight: 500, transition: "all 0.2s",
                  opacity: fbPublish.isPending ? 0.6 : 1,
                }}
              >
                <FbIcon />
                {fbPublish.isPending ? "Publishing…" : "Post to Facebook"}
              </motion.button>
            )}

            {liConnection.connected && liOrgValid && (
              <motion.button
                type="button"
                onClick={() => liPublish.mutate()}
                disabled={liPublish.isPending}
                whileHover={{ scale: 1.02, boxShadow: "0 0 16px rgba(168,85,247,0.22)", backgroundColor: "rgba(168,85,247,0.18)", borderColor: "rgba(168,85,247,0.55)" }}
                whileTap={{ scale: 0.97 }}
                style={{
                  display: "flex", alignItems: "center", gap: 7,
                  padding: "9px 16px", borderRadius: 10,
                  background: "rgba(168,85,247,0.10)", border: "1px solid rgba(168,85,247,0.28)",
                  color: "#e9d5ff", cursor: liPublish.isPending ? "not-allowed" : "pointer",
                  fontSize: 13, fontWeight: 500, transition: "all 0.2s",
                  opacity: liPublish.isPending ? 0.6 : 1,
                }}
              >
                <LiIcon />
                {liPublish.isPending ? "Publishing…" : "Post to LinkedIn"}
              </motion.button>
            )}
          </div>

          {publishMsg && (
            <motion.p
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                marginTop: 10, fontSize: 12,
                color: publishMsg.ok ? "var(--success)" : "var(--danger)",
              }}
            >
              {publishMsg.ok ? "✓ " : "✕ "}{publishMsg.text}
            </motion.p>
          )}
        </div>
      )}
    </motion.div>
  );
}
