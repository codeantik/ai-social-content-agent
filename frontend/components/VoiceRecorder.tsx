"use client";

import { useRef, useState } from "react";
import { transcribe } from "@/lib/api";
import { Mic, Square, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

type Props = {
  onTranscript: (text: string) => void;
  disabled?: boolean;
};

function getBestMimeType(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg", "audio/mp4"];
  return candidates.find((t) => MediaRecorder.isTypeSupported(t)) ?? "";
}

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
      const mimeType = getBestMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const actualMime = recorder.mimeType || mimeType || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: actualMime });
        setBusy(true);
        try {
          const { text } = await transcribe(blob, actualMime);
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
    <div className="flex flex-col gap-2">
      <motion.button
        type="button"
        onClick={recording ? stop : start}
        disabled={disabled || busy}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        className={`relative flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all disabled:opacity-50 ${
          recording
            ? "bg-red-500/20 border border-red-500/40 text-red-400"
            : "glass border border-white/10 text-slate-300 hover:border-violet-500/40 hover:text-white"
        }`}
      >
        {busy ? (
          <>
            <Loader2 size={15} className="animate-spin" />
            Transcribing…
          </>
        ) : recording ? (
          <>
            <AnimatePresence>
              <motion.span
                className="absolute inset-0 rounded-xl bg-red-500/10"
                animate={{ opacity: [0.3, 0.7, 0.3] }}
                transition={{ duration: 1.5, repeat: Infinity }}
              />
            </AnimatePresence>
            <Square size={14} className="fill-red-400" />
            Stop recording
          </>
        ) : (
          <>
            <Mic size={15} />
            Start recording
          </>
        )}
      </motion.button>
      {error && <p className="text-xs text-red-400">{error}</p>}
    </div>
  );
}
