"use client";

import { motion, AnimatePresence } from "framer-motion";
import { LogOut, ChevronDown, AlertCircle, CheckCircle } from "lucide-react";
import { facebookLoginUrl } from "@/lib/api";
import type { FacebookConnection } from "@/lib/types";

function FbLogo({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect width="24" height="24" rx="5" fill="#f43f5e" />
      <path d="M16.5 8H14a1 1 0 0 0-1 1v2h3.5l-.5 3H13v7h-3v-7H8v-3h2V9a4 4 0 0 1 4-4h2.5v3Z" fill="white" />
    </svg>
  );
}

function PulseDot() {
  return (
    <span style={{ position: "relative", display: "inline-flex", width: 8, height: 8, flexShrink: 0 }}>
      <motion.span
        animate={{ scale: [1, 2, 1], opacity: [0.5, 0, 0.5] }}
        transition={{ duration: 2.2, repeat: Infinity, ease: "easeOut" }}
        style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "#34d399" }}
      />
      <span style={{ position: "relative", width: 8, height: 8, borderRadius: "50%", background: "#34d399" }} />
    </span>
  );
}

type Props = {
  enabled: boolean;
  connection: FacebookConnection;
  onSelectPage: (pageId: string) => void;
  onDisconnect: () => void;
};

export function FacebookPanel({ enabled, connection, onSelectPage, onDisconnect }: Props) {
  if (!enabled) {
    return (
      <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.55 }}>
        Set{" "}
        <code style={{ fontSize: 11, background: "rgba(255,255,255,0.07)", padding: "1px 5px", borderRadius: 4 }}>FACEBOOK_APP_ID</code>
        {" "}and{" "}
        <code style={{ fontSize: 11, background: "rgba(255,255,255,0.07)", padding: "1px 5px", borderRadius: 4 }}>FACEBOOK_APP_SECRET</code>
        {" "}to enable.
      </p>
    );
  }

  if (connection.connected) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        style={{ display: "flex", flexDirection: "column", gap: 10 }}
      >
        {/* Status badge */}
        <div style={{
          display: "flex", alignItems: "center", gap: 7,
          background: "rgba(52,211,153,0.07)",
          border: "1px solid rgba(52,211,153,0.18)",
          borderRadius: 9, padding: "7px 10px",
        }}>
          <PulseDot />
          <span style={{ fontSize: 12, fontWeight: 500, color: "rgba(52,211,153,0.9)", flex: 1 }}>Connected</span>
          <FbLogo size={14} />
        </div>

        {/* Page selector */}
        {connection.pages.length > 0 ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.07em", textTransform: "uppercase" }}>
              Publish to page
            </span>
            <div style={{ position: "relative" }}>
              <select
                value={connection.selectedPageId ?? connection.pages[0]?.id}
                onChange={(e) => onSelectPage(e.target.value)}
                className="input"
                style={{
                  width: "100%", padding: "8px 30px 8px 10px",
                  borderRadius: 8, fontSize: 12,
                  appearance: "none", WebkitAppearance: "none",
                  cursor: "pointer",
                }}
              >
                {connection.pages.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <ChevronDown
                size={13}
                style={{
                  position: "absolute", right: 9, top: "50%",
                  transform: "translateY(-50%)",
                  pointerEvents: "none", color: "var(--text-muted)",
                }}
              />
            </div>
          </div>
        ) : (
          <div style={{
            display: "flex", alignItems: "center", gap: 6,
            fontSize: 12, color: "rgba(251,191,36,0.85)",
            background: "rgba(251,191,36,0.07)",
            border: "1px solid rgba(251,191,36,0.18)",
            borderRadius: 8, padding: "7px 10px",
          }}>
            <AlertCircle size={13} style={{ flexShrink: 0 }} />
            No pages found on this account.
          </div>
        )}

        {/* Disconnect */}
        <motion.button
          type="button"
          onClick={onDisconnect}
          whileHover={{ color: "#fca5a5", x: 1 }}
          style={{
            alignSelf: "flex-start",
            display: "flex", alignItems: "center", gap: 5,
            background: "none", border: "none", padding: "2px 0",
            color: "rgba(248,113,113,0.45)", cursor: "pointer",
            fontSize: 11, fontWeight: 500,
            transition: "color 0.15s",
          }}
        >
          <LogOut size={11} /> Disconnect
        </motion.button>
      </motion.div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <motion.a
        href={facebookLoginUrl()}
        whileHover={{
          scale: 1.02,
          boxShadow: "0 0 22px rgba(244,63,94,0.22)",
          backgroundColor: "rgba(244,63,94,0.16)",
          borderColor: "rgba(244,63,94,0.50)",
        }}
        whileTap={{ scale: 0.97 }}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          padding: "10px 14px", borderRadius: 10,
          background: "rgba(244,63,94,0.08)", border: "1px solid rgba(244,63,94,0.25)",
          color: "#fecdd3", textDecoration: "none", fontSize: 13, fontWeight: 500,
          transition: "all 0.2s",
        }}
      >
        <FbLogo size={16} /> Connect Facebook
      </motion.a>

      <AnimatePresence>
        {connection.error && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            style={{ overflow: "hidden" }}
          >
            <div style={{
              display: "flex", alignItems: "flex-start", gap: 7,
              fontSize: 12, color: "#fca5a5", lineHeight: 1.45,
              background: "rgba(248,113,113,0.08)",
              border: "1px solid rgba(248,113,113,0.20)",
              borderRadius: 8, padding: "8px 10px",
              marginTop: 2,
            }}>
              <AlertCircle size={13} style={{ marginTop: 1, flexShrink: 0 }} />
              {connection.error}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
