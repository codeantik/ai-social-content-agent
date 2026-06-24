"use client";

import { useRef, useState } from "react";
import { transcribe } from "@/lib/api";

type Props = {
  onTranscript: (text: string) => void;
  disabled?: boolean;
};

export function VoiceRecorder({ onTranscript, disabled }: Props) {
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  async function start() {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/wav" });
        setBusy(true);
        try {
          const { text } = await transcribe(blob);
          if (text) onTranscript(text);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Transcription failed");
        } finally {
          setBusy(false);
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setRecording(true);
    } catch {
      setError("Microphone access denied");
    }
  }

  function stop() {
    mediaRecorderRef.current?.stop();
    setRecording(false);
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        onClick={recording ? stop : start}
        disabled={disabled || busy}
        className="rounded-lg border border-black/10 px-3 py-2 text-sm disabled:opacity-50"
      >
        {busy ? "Transcribing…" : recording ? "⏹️ Stop" : "🎙️ Start recording"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
