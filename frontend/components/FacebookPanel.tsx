"use client";

import { facebookLoginUrl } from "@/lib/api";
import type { FacebookConnection } from "@/lib/types";

type Props = {
  enabled: boolean;
  connection: FacebookConnection;
  onSelectPage: (pageId: string) => void;
  onDisconnect: () => void;
};

export function FacebookPanel({ enabled, connection, onSelectPage, onDisconnect }: Props) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">📘 Facebook</h3>
      {!enabled ? (
        <p className="text-xs text-black/50">
          Add <code>FACEBOOK_APP_ID</code> and <code>FACEBOOK_APP_SECRET</code> to enable.
        </p>
      ) : connection.connected ? (
        <div className="flex flex-col gap-2">
          {connection.pages.length ? (
            <>
              <select
                value={connection.selectedPageId ?? connection.pages[0]?.id}
                onChange={(e) => onSelectPage(e.target.value)}
                className="rounded-lg border border-black/10 px-2 py-1.5 text-xs"
              >
                {connection.pages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <p className="text-xs text-green-700">✅ Connected</p>
            </>
          ) : (
            <p className="text-xs text-yellow-700">No pages found.</p>
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
            href={facebookLoginUrl()}
            className="rounded-lg bg-blue-700 px-3 py-1.5 text-center text-xs text-white"
          >
            📘 Connect to Facebook
          </a>
          {connection.error && <p className="text-xs text-red-600">Connection error: {connection.error}</p>}
        </div>
      )}
    </div>
  );
}
