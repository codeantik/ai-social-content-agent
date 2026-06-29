"use client";

import { motion } from "framer-motion";
import { CheckCircle, LogOut } from "lucide-react";
import { facebookLoginUrl } from "@/lib/api";

function FbLogo() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect width="24" height="24" rx="5" fill="#f43f5e" />
      <path d="M16.5 8H14a1 1 0 0 0-1 1v2h3.5l-.5 3H13v7h-3v-7H8v-3h2V9a4 4 0 0 1 4-4h2.5v3Z" fill="white" />
    </svg>
  );
}
import type { FacebookConnection } from "@/lib/types";

type Props = {
  enabled: boolean;
  connection: FacebookConnection;
  onSelectPage: (pageId: string) => void;
  onDisconnect: () => void;
};

export function FacebookPanel({ enabled, connection, onSelectPage, onDisconnect }: Props) {
  if (!enabled) {
    return (
      <p style={{ fontSize: 12, color: "var(--text-muted)" }}>
        Set <code style={{ fontSize: 11, background: "rgba(255,255,255,0.07)", padding: "1px 4px", borderRadius: 4 }}>FACEBOOK_APP_ID</code> and{" "}
        <code style={{ fontSize: 11, background: "rgba(255,255,255,0.07)", padding: "1px 4px", borderRadius: 4 }}>FACEBOOK_APP_SECRET</code> to enable.
      </p>
    );
  }

  if (connection.connected) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--success)" }}>
          <CheckCircle size={13} /> Connected
        </div>
        {connection.pages.length > 0 && (
          <select
            value={connection.selectedPageId ?? connection.pages[0]?.id}
            onChange={(e) => onSelectPage(e.target.value)}
            className="input"
            style={{ padding: "6px 10px", borderRadius: 8, fontSize: 12, width: "100%" }}
          >
            {connection.pages.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        )}
        {!connection.pages.length && (
          <p style={{ fontSize: 12, color: "rgba(251,191,36,0.8)" }}>No pages found on this account.</p>
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
        href={facebookLoginUrl()}
        whileHover={{ scale: 1.02, boxShadow: "0 0 18px rgba(244,63,94,0.25)", backgroundColor: "rgba(244,63,94,0.18)", borderColor: "rgba(244,63,94,0.55)" }}
        whileTap={{ scale: 0.97 }}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
          padding: "9px 14px", borderRadius: 10,
          background: "rgba(244,63,94,0.10)", border: "1px solid rgba(244,63,94,0.30)",
          color: "#fecdd3", textDecoration: "none", fontSize: 13, fontWeight: 500,
          transition: "all 0.2s",
        }}
      >
        <FbLogo /> Connect Facebook
      </motion.a>
      {connection.error && (
        <p style={{ fontSize: 12, color: "var(--danger)" }}>{connection.error}</p>
      )}
    </div>
  );
}
