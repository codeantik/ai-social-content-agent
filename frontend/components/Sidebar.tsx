"use client";

import { useRef, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, Upload, X } from "lucide-react";
import { FacebookPanel } from "./FacebookPanel";
import { LinkedInPanel } from "./LinkedInPanel";
import { VoiceRecorder } from "./VoiceRecorder";
import type { FacebookConnection, LinkedInConnection } from "@/lib/types";

// ── Brand icons ───────────────────────────────────────────────────────────────
function FacebookIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect width="24" height="24" rx="5" fill="#f43f5e" />
      <path d="M16.5 8H14a1 1 0 0 0-1 1v2h3.5l-.5 3H13v7h-3v-7H8v-3h2V9a4 4 0 0 1 4-4h2.5v3Z" fill="white" />
    </svg>
  );
}

function LinkedInIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect width="24" height="24" rx="5" fill="#a855f7" />
      <path d="M7 9.5h2.5V17H7V9.5ZM8.25 8.5a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5ZM17 17h-2.5v-3.5c0-1-.4-1.5-1.2-1.5-.8 0-1.3.6-1.3 1.5V17H9.5V9.5H12v1c.4-.7 1.2-1.2 2.2-1.2 1.8 0 2.8 1.2 2.8 3.3V17Z" fill="white" />
    </svg>
  );
}

// ── Layout helpers ────────────────────────────────────────────────────────────
const SECTION_ANIM = { initial: { opacity: 0, x: -10 }, animate: { opacity: 1, x: 0 } };

function SectionCard({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  return (
    <motion.div
      variants={SECTION_ANIM}
      initial="initial"
      animate="animate"
      transition={{ duration: 0.3, delay }}
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 14,
        padding: "14px 16px",
        backdropFilter: "blur(20px)",
      }}
    >
      {children}
    </motion.div>
  );
}

function SectionTitle({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 12 }}>
      <span style={{ color: "#fda4af" }}>{icon}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", letterSpacing: "0.02em" }}>{label}</span>
    </div>
  );
}

// ── Image section icons ───────────────────────────────────────────────────────
function SparkleIcon({ active }: { active: boolean }) {
  const c = active ? "#fda4af" : "rgba(255,255,255,0.28)";
  const c2 = active ? "#c084fc" : "rgba(255,255,255,0.18)";
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M10 2.5 L11.2 8 L16.5 9 L11.2 10 L10 15.5 L8.8 10 L3.5 9 L8.8 8 Z"
        fill={c} strokeLinejoin="round" />
      <circle cx="15.5" cy="3.5" r="1.1" fill={c2} />
      <circle cx="4.5" cy="14.5" r="0.9" fill={c2} />
    </svg>
  );
}

function ImageCardIcon({ active }: { active: boolean }) {
  const c = active ? "#34d399" : "rgba(255,255,255,0.28)";
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <rect x="2" y="4" width="16" height="12" rx="2.5" stroke={c} strokeWidth="1.5" />
      <circle cx="7" cy="8.5" r="1.5" fill={c} />
      <path d="M2 13.5 L6.5 10 L9.5 12.5 L13 9.5 L18 13.5" stroke={c} strokeWidth="1.3" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────
type Props = {
  generateImage: boolean;
  onGenerateImageChange: (v: boolean) => void;
  uploadedImage: File | null;
  onUploadedImageChange: (f: File | null) => void;
  onVoiceTranscript: (text: string) => void;
  fbEnabled: boolean;
  fbConnection: FacebookConnection;
  onFbSelectPage: (pageId: string) => void;
  onFbDisconnect: () => void;
  liEnabled: boolean;
  liConnection: LinkedInConnection;
  onLiOrgIdChange: (orgId: string) => void;
  onLiDisconnect: () => void;
};

// ── Sidebar ───────────────────────────────────────────────────────────────────
export function Sidebar({
  generateImage,
  onGenerateImageChange,
  uploadedImage,
  onUploadedImageChange,
  onVoiceTranscript,
  fbEnabled,
  fbConnection,
  onFbSelectPage,
  onFbDisconnect,
  liEnabled,
  liConnection,
  onLiOrgIdChange,
  onLiDisconnect,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!uploadedImage) { setPreviewUrl(null); return; }
    const url = URL.createObjectURL(uploadedImage);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [uploadedImage]);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith("image/")) {
      onGenerateImageChange(false);
      onUploadedImageChange(file);
    }
  }

  return (
    <aside
      style={{
        height: "100%",
        overflowY: "auto",
        borderRight: "1px solid var(--border)",
        background: "rgba(12,5,16,0.65)",
        backdropFilter: "blur(24px)",
        padding: "20px 14px",
        display: "flex",
        flexDirection: "column",
        gap: 10,
      }}
    >
      {/* ── Post Image ──────────────────────────────────────────────────── */}
      <SectionCard delay={0.05}>
        <SectionTitle
          icon={
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
              <rect x="1" y="2.5" width="12" height="9" rx="2" stroke="#fda4af" strokeWidth="1.3" />
              <circle cx="4.5" cy="5.5" r="1.1" fill="#fda4af" />
              <path d="M1 9.5 L4 7.5 L6.5 9 L9.5 6.5 L13 9.5" stroke="#fda4af" strokeWidth="1.1" strokeLinejoin="round" strokeLinecap="round" />
            </svg>
          }
          label="Post Image"
        />

        {/* Tab row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7, marginBottom: 12 }}>
          {/* AI Generate tab */}
          <motion.button
            type="button"
            whileTap={{ scale: 0.96 }}
            onClick={() => {
              onUploadedImageChange(null);
              onGenerateImageChange(!generateImage);
            }}
            style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
              padding: "12px 8px", borderRadius: 11, cursor: "pointer",
              background: generateImage
                ? "linear-gradient(145deg, rgba(244,63,94,0.20), rgba(168,85,247,0.16))"
                : "rgba(255,255,255,0.03)",
              border: `1px solid ${generateImage ? "rgba(244,63,94,0.48)" : "rgba(255,255,255,0.08)"}`,
              boxShadow: generateImage ? "0 0 18px rgba(244,63,94,0.16)" : "none",
              transition: "all 0.22s",
            }}
          >
            <SparkleIcon active={generateImage} />
            <span style={{
              fontSize: 11, fontWeight: 600, lineHeight: 1,
              color: generateImage ? "#fecdd3" : "rgba(255,255,255,0.38)",
            }}>
              AI Generate
            </span>
          </motion.button>

          {/* Upload tab */}
          <motion.button
            type="button"
            whileTap={{ scale: 0.96 }}
            onClick={() => {
              onGenerateImageChange(false);
              if (!uploadedImage) fileInputRef.current?.click();
              else onUploadedImageChange(null);
            }}
            style={{
              display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
              padding: "12px 8px", borderRadius: 11, cursor: "pointer",
              background: uploadedImage
                ? "rgba(52,211,153,0.12)"
                : "rgba(255,255,255,0.03)",
              border: `1px solid ${uploadedImage ? "rgba(52,211,153,0.42)" : "rgba(255,255,255,0.08)"}`,
              boxShadow: uploadedImage ? "0 0 18px rgba(52,211,153,0.12)" : "none",
              transition: "all 0.22s",
            }}
          >
            <ImageCardIcon active={!!uploadedImage} />
            <span style={{
              fontSize: 11, fontWeight: 600, lineHeight: 1,
              color: uploadedImage ? "#34d399" : "rgba(255,255,255,0.38)",
            }}>
              Upload Own
            </span>
          </motion.button>
        </div>

        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            if (f) onGenerateImageChange(false);
            onUploadedImageChange(f);
            e.target.value = "";
          }}
        />

        {/* Conditional content */}
        <AnimatePresence mode="wait">
          {generateImage && !uploadedImage && (
            <motion.div
              key="ai-info"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
              style={{
                padding: "10px 12px", borderRadius: 10,
                background: "rgba(244,63,94,0.08)",
                border: "1px solid rgba(244,63,94,0.22)",
              }}
            >
              <p style={{ fontSize: 11, color: "#fecdd3", lineHeight: 1.6, margin: 0 }}>
                A relevant image will be auto-generated to match your post content.
              </p>
            </motion.div>
          )}

          {!generateImage && uploadedImage && previewUrl && (
            <motion.div
              key="preview"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.2 }}
              style={{ position: "relative" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="Upload preview"
                style={{
                  width: "100%", display: "block",
                  borderRadius: 10, objectFit: "cover", maxHeight: 130,
                  border: "1px solid rgba(52,211,153,0.28)",
                }}
              />
              {/* Remove overlay button */}
              <button
                type="button"
                onClick={() => onUploadedImageChange(null)}
                title="Remove image"
                style={{
                  position: "absolute", top: 6, right: 6,
                  width: 24, height: 24, borderRadius: 7,
                  background: "rgba(0,0,0,0.72)", border: "1px solid rgba(255,255,255,0.12)",
                  color: "#f87171", cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  backdropFilter: "blur(4px)",
                }}
              >
                <X size={12} />
              </button>
              <p style={{
                fontSize: 10.5, color: "var(--text-muted)",
                marginTop: 6, textAlign: "center",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {uploadedImage.name}
              </p>
            </motion.div>
          )}

          {!generateImage && !uploadedImage && (
            <motion.div
              key="dropzone"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.2 }}
              onClick={() => fileInputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
              onDragLeave={() => setDragging(false)}
              onDrop={handleDrop}
              style={{
                padding: "20px 12px",
                borderRadius: 11,
                border: `1.5px dashed ${dragging ? "rgba(244,63,94,0.70)" : "rgba(255,255,255,0.11)"}`,
                background: dragging ? "rgba(244,63,94,0.08)" : "rgba(255,255,255,0.02)",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
                cursor: "pointer",
                transition: "all 0.18s",
              }}
            >
              <div style={{
                width: 38, height: 38, borderRadius: 10,
                background: dragging ? "rgba(244,63,94,0.18)" : "rgba(255,255,255,0.05)",
                display: "flex", alignItems: "center", justifyContent: "center",
                border: `1px solid ${dragging ? "rgba(244,63,94,0.38)" : "rgba(255,255,255,0.08)"}`,
                transition: "all 0.18s",
              }}>
                <Upload size={17} color={dragging ? "#fda4af" : "rgba(255,255,255,0.35)"} />
              </div>
              <div style={{ textAlign: "center" }}>
                <p style={{ fontSize: 12, fontWeight: 500, color: dragging ? "#fecdd3" : "rgba(255,255,255,0.45)", margin: 0 }}>
                  {dragging ? "Drop to upload" : "Drag & drop or click"}
                </p>
                <p style={{ fontSize: 10, color: "rgba(255,255,255,0.22)", marginTop: 3 }}>
                  PNG · JPG · WEBP
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </SectionCard>

      {/* ── Voice Input ─────────────────────────────────────────────────── */}
      <SectionCard delay={0.1}>
        <SectionTitle icon={<Mic size={14} />} label="Voice Input" />
        <p style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 8 }}>
          Record and it will be sent to chat automatically.
        </p>
        <VoiceRecorder onTranscript={onVoiceTranscript} />
      </SectionCard>

      {/* ── Facebook ────────────────────────────────────────────────────── */}
      {fbEnabled && (
        <SectionCard delay={0.15}>
          <SectionTitle icon={<FacebookIcon size={14} />} label="Facebook" />
          <FacebookPanel
            enabled={fbEnabled}
            connection={fbConnection}
            onSelectPage={onFbSelectPage}
            onDisconnect={onFbDisconnect}
          />
        </SectionCard>
      )}

      {/* ── LinkedIn ────────────────────────────────────────────────────── */}
      {liEnabled && (
        <SectionCard delay={0.2}>
          <SectionTitle icon={<LinkedInIcon size={14} />} label="LinkedIn" />
          <LinkedInPanel
            enabled={liEnabled}
            connection={liConnection}
            onOrgIdChange={onLiOrgIdChange}
            onDisconnect={onLiDisconnect}
          />
        </SectionCard>
      )}
    </aside>
  );
}
