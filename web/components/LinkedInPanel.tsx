"use client";

import { linkedinLoginUrl } from "@/lib/api";
import type { LinkedInConnection } from "@/lib/types";

type Props = {
  enabled: boolean;
  connection: LinkedInConnection;
  onOrgIdChange: (orgId: string) => void;
  onDisconnect: () => void;
};

export function LinkedInPanel({ enabled, connection, onOrgIdChange, onDisconnect }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">💼 LinkedIn</h3>
      {!enabled ? (
        <p className="text-xs text-black/50">
          Add <code>LINKEDIN_CLIENT_ID</code> and <code>LINKEDIN_CLIENT_SECRET</code> to enable.
        </p>
      ) : connection.connected ? (
        <div className="flex flex-col gap-2">
          <input
            value={connection.orgId}
            onChange={(e) => onOrgIdChange(e.target.value)}
            placeholder="e.g. 12345678"
            className="rounded-lg border border-black/10 px-2 py-1.5 text-xs"
          />
          {connection.orgId.trim() && /^\d+$/.test(connection.orgId.trim()) ? (
            <p className="text-xs text-green-700">✅ Connected</p>
          ) : (
            <p className="text-xs text-black/50">Enter the numeric Organization ID to enable publishing.</p>
          )}
          <button
            type="button"
            onClick={onDisconnect}
            className="rounded-lg border border-black/10 px-3 py-1.5 text-xs"
          >
            Disconnect
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <a
            href={linkedinLoginUrl()}
            className="rounded-lg bg-blue-800 px-3 py-1.5 text-center text-xs text-white"
          >
            💼 Connect to LinkedIn
          </a>
          {connection.error && <p className="text-xs text-red-600">Connection error: {connection.error}</p>}
        </div>
      )}
    </div>
  );
}
