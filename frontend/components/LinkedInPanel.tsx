"use client";

import { motion, AnimatePresence } from "framer-motion";
import { LogOut, AlertCircle, CheckCircle } from "lucide-react";
import { linkedinLoginUrl } from "@/lib/api";
import type { LinkedInConnection } from "@/lib/types";

function LiLogo({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect width="24" height="24" rx="5" fill="#a855f7" />
      <path d="M7 9.5h2.5V17H7V9.5ZM8.25 8.5a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5ZM17 17h-2.5v-3.5c0-1-.4-1.5-1.2-1.5-.8 0-1.3.6-1.3 1.5V17H9.5V9.5H12v1c.4-.7 1.2-1.2 2.2-1.2 1.8 0 2.8 1.2 2.8 3.3V17Z" fill="white" />
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
  connection: LinkedInConnection;
  onOrgIdChange: (orgId: string) => void;
  onDisconnect: () => void;
};

export function LinkedInPanel({ enabled, connection, onOrgIdChange, onDisconnect }: Props) {
  if (!enabled) {
    return (
      <p style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.55 }}>
        Set{" "}
        <code style={{ fontSize: 11, background: "rgba(255,255,255,0.07)", padding: "1px 5px", borderRadius: 4 }}>LINKEDIN_CLIENT_ID</code>
        {" "}and{" "}
        <code style={{ fontSize: 11, background: "rgba(255,255,255,0.07)", padding: "1px 5px", borderRadius: 4 }}>LINKEDIN_CLIENT_SECRET</code>
        {" "}to enable.
      </p>
    );
  }

  if (connection.connected) {
    const hasInput = connection.orgId.trim().length > 0;
    const valid = hasInput && /^\d+$/.test(connection.orgId.trim());

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
          <LiLogo size={14} />
        </div>

        {/* Org ID input */}
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 10, fontWeight: 600, color: "var(--text-muted)", letterSpacing: "0.07em", textTransform: "uppercase" }}>
              Organization ID
            </span>
            <AnimatePresence>
              {valid && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.75 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.75 }}
                  style={{
                    display: "flex", alignItems: "center", gap: 3,
                    fontSize: 10, fontWeight: 500, color: "rgba(52,211,153,0.85)",
                  }}
                >
                  <CheckCircle size={10} /> Ready
                </motion.span>
              )}
            </AnimatePresence>
          </div>
          <input
            value={connection.orgId}
            onChange={(e) => onOrgIdChange(e.target.value)}
            placeholder="e.g. 12345678"
            className="input"
            style={{ padding: "8px 10px", borderRadius: 8, fontSize: 12, width: "100%" }}
          />
          <AnimatePresence>
            {hasInput && !valid && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  fontSize: 11, color: "rgba(251,191,36,0.85)",
                }}
              >
                <AlertCircle size={11} style={{ flexShrink: 0 }} />
                Must be numbers only.
              </motion.div>
            )}
          </AnimatePresence>
        </div>

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
        href={linkedinLoginUrl()}
        whileHover={{
          scale: 1.02,
          boxShadow: "0 0 22px rgba(168,85,247,0.22)",
          backgroundColor: "rgba(168,85,247,0.16)",
          borderColor: "rgba(168,85,247,0.50)",
        }}
        whileTap={{ scale: 0.97 }}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          padding: "10px 14px", borderRadius: 10,
          background: "rgba(168,85,247,0.08)", border: "1px solid rgba(168,85,247,0.28)",
          color: "#e9d5ff", textDecoration: "none", fontSize: 13, fontWeight: 500,
          transition: "all 0.2s",
        }}
      >
        <LiLogo size={16} /> Connect LinkedIn
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
