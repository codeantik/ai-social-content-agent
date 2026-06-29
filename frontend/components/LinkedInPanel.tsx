"use client";

import { motion } from "framer-motion";
import { CheckCircle, LogOut } from "lucide-react";
import { linkedinLoginUrl } from "@/lib/api";

function LiLogo() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect width="24" height="24" rx="5" fill="#a855f7" />
      <path d="M7 9.5h2.5V17H7V9.5ZM8.25 8.5a1.25 1.25 0 1 1 0-2.5 1.25 1.25 0 0 1 0 2.5ZM17 17h-2.5v-3.5c0-1-.4-1.5-1.2-1.5-.8 0-1.3.6-1.3 1.5V17H9.5V9.5H12v1c.4-.7 1.2-1.2 2.2-1.2 1.8 0 2.8 1.2 2.8 3.3V17Z" fill="white" />
    </svg>
  );
}
import type { LinkedInConnection } from "@/lib/types";

type Props = {
  enabled: boolean;
  connection: LinkedInConnection;
  onOrgIdChange: (orgId: string) => void;
  onDisconnect: () => void;
};

export function LinkedInPanel({ enabled, connection, onOrgIdChange, onDisconnect }: Props) {
  if (!enabled) {
    return (
      <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
        Set <code style={{ fontSize: 11, background: "rgba(255,255,255,0.07)", padding: "1px 4px", borderRadius: 4 }}>LINKEDIN_CLIENT_ID</code> and{" "}
        <code style={{ fontSize: 11, background: "rgba(255,255,255,0.07)", padding: "1px 4px", borderRadius: 4 }}>LINKEDIN_CLIENT_SECRET</code> to enable.
      </p>
    );
  }

  if (connection.connected) {
    const valid = /^\d+$/.test(connection.orgId.trim());
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--success)" }}>
          <CheckCircle size={13} /> Connected
        </div>
        <input
          value={connection.orgId}
          onChange={(e) => onOrgIdChange(e.target.value)}
          placeholder="Org ID (e.g. 12345678)"
          className="input"
          style={{ padding: "7px 10px", borderRadius: 8, fontSize: 12, width: "100%" }}
        />
        {connection.orgId.trim() && !valid && (
          <p style={{ fontSize: 11, color: "var(--text-muted)" }}>Enter numeric Organization ID to publish.</p>
        )}
        <button
          type="button"
          onClick={onDisconnect}
          style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "6px 10px", borderRadius: 8,
            background: "rgba(248,113,113,0.1)", border: "1px solid rgba(248,113,113,0.25)",
            color: "var(--danger)", cursor: "pointer", fontSize: 12,
          }}
        >
          <LogOut size={12} /> Disconnect
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <motion.a
        href={linkedinLoginUrl()}
        whileHover={{ scale: 1.02, boxShadow: "0 0 18px rgba(168,85,247,0.25)", backgroundColor: "rgba(168,85,247,0.18)", borderColor: "rgba(168,85,247,0.55)" }}
        whileTap={{ scale: 0.97 }}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
          padding: "9px 14px", borderRadius: 10,
          background: "rgba(168,85,247,0.10)", border: "1px solid rgba(168,85,247,0.30)",
          color: "#e9d5ff", textDecoration: "none", fontSize: 13, fontWeight: 500,
          transition: "all 0.2s",
        }}
      >
        <LiLogo /> Connect LinkedIn
      </motion.a>
      {connection.error && (
        <p style={{ fontSize: 12, color: "var(--danger)" }}>{connection.error}</p>
      )}
    </div>
  );
}
