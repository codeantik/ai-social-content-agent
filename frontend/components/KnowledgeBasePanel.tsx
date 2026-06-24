"use client";

import { useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { knowledgeReindex, knowledgeStatus, knowledgeUpload } from "@/lib/api";

type Props = {
  orgWebsite: string;
  orgId: string | null;
};

export function KnowledgeBasePanel({ orgWebsite, orgId }: Props) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const status = useQuery({
    queryKey: ["knowledge-status", orgId],
    queryFn: () => knowledgeStatus(orgId as string),
    enabled: !!orgId,
    refetchInterval: (query) => (query.state.data?.indexing_in_progress ? 3000 : false),
  });

  const reindex = useMutation({
    mutationFn: () => knowledgeReindex(orgId as string),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["knowledge-status", orgId] }),
  });

  const upload = useMutation({
    mutationFn: (file: File) => knowledgeUpload(orgId as string, file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["knowledge-status", orgId] }),
  });

  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">📚 Knowledge Base</h3>
      {!orgWebsite.trim() ? (
        <p className="text-xs text-black/50">Enter an org URL above to enable knowledge indexing.</p>
      ) : status.data?.indexing_in_progress ? (
        <p className="text-xs text-blue-700">⏳ Indexing website in background…</p>
      ) : status.data && status.data.source_count > 0 ? (
        <div className="flex flex-col gap-2">
          <p className="text-xs text-green-700">✅ {status.data.source_count} pages indexed</p>
          <button
            type="button"
            onClick={() => reindex.mutate()}
            disabled={reindex.isPending}
            className="rounded-lg border border-black/10 px-3 py-1.5 text-xs disabled:opacity-50"
          >
            {reindex.isPending ? "Re-indexing…" : "🔄 Re-index website"}
          </button>
        </div>
      ) : (
        <p className="text-xs text-black/50">Website will be indexed automatically on first generation.</p>
      )}

      <div className="mt-2 flex flex-col gap-2">
        <p className="text-xs font-medium">Upload brand guidelines or past content</p>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.txt,.md"
          disabled={!orgId || upload.isPending}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload.mutate(file);
          }}
          className="text-xs"
        />
        {upload.isPending && <p className="text-xs text-black/50">Indexing…</p>}
        {upload.isSuccess && (
          <p className="text-xs text-green-700">Added {upload.data.chunks_added} chunks</p>
        )}
        {upload.isError && (
          <p className="text-xs text-red-600">
            {upload.error instanceof Error ? upload.error.message : "Upload failed"}
          </p>
        )}
      </div>
    </div>
  );
}
