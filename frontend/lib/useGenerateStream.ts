"use client";

import { useCallback, useRef, useState } from "react";
import { API_BASE } from "./api";

export type GenerateParams = {
  brief: string;
  sessionId: string;
  generateImage: boolean;
  summary?: string;
  image?: File | null;
};

export type GenerateFinal = {
  content: string;
  retrieval_sources: string[];
  image_base64: string | null;
  image_error: string | null;
};

type SSEEvent = { event: string; data: string };

// Parses the "event: foo\r\ndata: {...}\r\n\r\n" framing sse_starlette emits
// (CRLF line endings, blank line terminates each frame).
function parseSSEChunk(buffer: string): { events: SSEEvent[]; rest: string } {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const events: SSEEvent[] = [];
  const blocks = normalized.split("\n\n");
  const rest = blocks.pop() ?? "";
  for (const block of blocks) {
    let event = "message";
    const dataLines: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    }
    if (dataLines.length) events.push({ event, data: dataLines.join("\n") });
  }
  return { events, rest };
}

export function useGenerateStream() {
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const start = useCallback((params: GenerateParams): Promise<GenerateFinal> => {
    const form = new FormData();
    form.append("brief", params.brief);
    form.append("session_id", params.sessionId);
    form.append("generate_image", String(params.generateImage));
    form.append("summary", params.summary ?? "");
    if (params.image) form.append("image", params.image);

    const controller = new AbortController();
    abortRef.current = controller;
    setIsStreaming(true);
    setProgressLabel("Starting…");

    return fetch(`${API_BASE}/content/generate`, {
      method: "POST",
      body: form,
      signal: controller.signal,
    }).then(async (res) => {
      if (!res.ok || !res.body) {
        throw new Error(`Generation request failed: ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const { events, rest } = parseSSEChunk(buffer);
        buffer = rest;

        for (const evt of events) {
          if (evt.event === "progress") {
            const payload = JSON.parse(evt.data) as { node: string; label: string };
            setProgressLabel(payload.label);
          } else if (evt.event === "error") {
            const payload = JSON.parse(evt.data) as { error: string };
            setIsStreaming(false);
            throw new Error(payload.error);
          } else if (evt.event === "final") {
            const payload = JSON.parse(evt.data) as GenerateFinal;
            setIsStreaming(false);
            setProgressLabel(null);
            return payload;
          }
        }
      }
      setIsStreaming(false);
      throw new Error("Stream ended without a final event");
    });
  }, []);

  return { start, progressLabel, isStreaming };
}
