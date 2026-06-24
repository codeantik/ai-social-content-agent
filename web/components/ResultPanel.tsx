"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { editContent, publishToFacebook, publishToLinkedIn } from "@/lib/api";
import type { FacebookConnection, GenerationResult, LinkedInConnection } from "@/lib/types";

const QUICK_ACTIONS: [string, string][] = [
  ["✂️ Shorter", "Make it concisely shorter; remove filler words"],
  ["#️⃣ Hashtags", "Add 3–5 relevant hashtags at the end"],
  ["🎯 More formal", "Rewrite in a more professional, formal tone"],
  ["😊 More casual", "Rewrite in a friendlier, more casual tone"],
];

type Props = {
  result: GenerationResult;
  editorContent: string;
  onEditorContentChange: (v: string) => void;
  onStartOver: () => void;
  fbConnection: FacebookConnection;
  liConnection: LinkedInConnection;
};

export function ResultPanel({
  result,
  editorContent,
  onEditorContentChange,
  onStartOver,
  fbConnection,
  liConnection,
}: Props) {
  const [editInput, setEditInput] = useState("");
  const [publishMsg, setPublishMsg] = useState<{ kind: "fb" | "li"; text: string; ok: boolean } | null>(
    null,
  );

  const edit = useMutation({
    mutationFn: (instruction: string) => editContent(editorContent, instruction, result.originalQuery),
    onSuccess: (data) => onEditorContentChange(data.content),
  });

  const fbPublish = useMutation({
    mutationFn: () => {
      const page = fbConnection.pages.find((p) => p.id === fbConnection.selectedPageId) ?? fbConnection.pages[0];
      if (!page) throw new Error("No Facebook page selected");
      return publishToFacebook({
        page_id: page.id,
        page_access_token: page.access_token,
        content: editorContent,
        image_base64: result.imageBase64,
      });
    },
    onSuccess: (data) => {
      const parts = data.post_id.split("_");
      const url = parts.length === 2 ? `https://www.facebook.com/${parts[0]}/posts/${parts[1]}` : "https://www.facebook.com/";
      setPublishMsg({ kind: "fb", text: `✅ Published! ${url}`, ok: true });
    },
    onError: (err) => setPublishMsg({ kind: "fb", text: `❌ ${err instanceof Error ? err.message : "Failed"}`, ok: false }),
  });

  const liPublish = useMutation({
    mutationFn: () => {
      if (!liConnection.token) throw new Error("Not connected to LinkedIn");
      return publishToLinkedIn({
        org_urn: `urn:li:organization:${liConnection.orgId.trim()}`,
        access_token: liConnection.token,
        content: editorContent,
        image_base64: result.imageBase64,
      });
    },
    onSuccess: (data) => {
      const url = `https://www.linkedin.com/feed/update/${data.post_urn}/`;
      setPublishMsg({ kind: "li", text: `✅ Published! ${url}`, ok: true });
    },
    onError: (err) => setPublishMsg({ kind: "li", text: `❌ ${err instanceof Error ? err.message : "Failed"}`, ok: false }),
  });

  const liOrgValid = /^\d+$/.test(liConnection.orgId.trim());

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">📄 Generated Content</h2>
        <button
          type="button"
          onClick={onStartOver}
          className="rounded-lg border border-black/10 px-3 py-1.5 text-sm"
        >
          🔄 Start Over
        </button>
      </div>

      <textarea
        value={editorContent}
        onChange={(e) => onEditorContentChange(e.target.value)}
        className="h-[340px] w-full rounded-lg border border-black/10 p-3 text-sm"
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {QUICK_ACTIONS.map(([label, instruction]) => (
          <button
            key={label}
            type="button"
            disabled={edit.isPending}
            onClick={() => edit.mutate(instruction)}
            className="rounded-lg border border-black/10 px-2 py-1.5 text-xs disabled:opacity-50"
          >
            {label}
          </button>
        ))}
      </div>
      {edit.isPending && <p className="text-xs text-black/50">Applying…</p>}

      {result.retrievalSources.length > 0 && (
        <details className="rounded-lg border border-black/10 p-3 text-sm">
          <summary className="cursor-pointer font-medium">🔍 Context sources used</summary>
          <ul className="mt-2 list-disc pl-5 text-xs">
            {result.retrievalSources.map((src, i) => (
              <li key={i}>{src}</li>
            ))}
          </ul>
        </details>
      )}

      <details className="rounded-lg border border-black/10 p-3 text-sm">
        <summary className="cursor-pointer font-medium">📋 Copy as plain text</summary>
        <pre className="mt-2 whitespace-pre-wrap text-xs">{editorContent}</pre>
      </details>

      {result.hasImage && (
        <div>
          <h3 className="text-sm font-semibold">{result.imageUploaded ? "🖼️ Your Image" : "🖼️ Generated Image"}</h3>
          {result.imageBase64 ? (
            // eslint-disable-next-line @next/next/no-img-element -- data: URI, not eligible for next/image optimization
            <img
              src={`data:image/png;base64,${result.imageBase64}`}
              alt="Generated"
              className="mt-2 max-w-full rounded-lg border border-black/10"
            />
          ) : result.imageError ? (
            <p className="mt-2 text-sm text-red-600">Image processing failed.\n{result.imageError}</p>
          ) : (
            <p className="mt-2 text-sm text-black/50">Image generation was not successful.</p>
          )}
        </div>
      )}

      {fbConnection.connected && fbConnection.pages.length > 0 && (
        <div className="border-t border-black/10 pt-4">
          <h3 className="text-sm font-semibold">📘 Publish to Facebook</h3>
          <button
            type="button"
            onClick={() => fbPublish.mutate()}
            disabled={fbPublish.isPending}
            className="mt-2 rounded-lg bg-blue-700 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {fbPublish.isPending ? "Publishing…" : "📤 Publish to Facebook"}
          </button>
          {publishMsg?.kind === "fb" && (
            <p className={`mt-2 text-xs ${publishMsg.ok ? "text-green-700" : "text-red-600"}`}>{publishMsg.text}</p>
          )}
        </div>
      )}

      {liConnection.connected && liOrgValid && (
        <div className="border-t border-black/10 pt-4">
          <h3 className="text-sm font-semibold">💼 Publish to LinkedIn</h3>
          <button
            type="button"
            onClick={() => liPublish.mutate()}
            disabled={liPublish.isPending}
            className="mt-2 rounded-lg bg-blue-900 px-4 py-2 text-sm text-white disabled:opacity-50"
          >
            {liPublish.isPending ? "Publishing…" : "📤 Publish to LinkedIn"}
          </button>
          {publishMsg?.kind === "li" && (
            <p className={`mt-2 text-xs ${publishMsg.ok ? "text-green-700" : "text-red-600"}`}>{publishMsg.text}</p>
          )}
        </div>
      )}

      <div className="flex gap-2 border-t border-black/10 pt-4">
        <input
          value={editInput}
          onChange={(e) => setEditInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && editInput.trim()) {
              edit.mutate(editInput.trim());
              setEditInput("");
            }
          }}
          placeholder="Ask for changes…"
          className="flex-1 rounded-lg border border-black/10 px-3 py-2 text-sm"
        />
      </div>
    </div>
  );
}
