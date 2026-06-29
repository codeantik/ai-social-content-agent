"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";

const FB_STORAGE_KEY = "content-agent:fb-oauth";

function FacebookCallback() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const token = params.get("token");
    const pagesRaw = params.get("pages");
    const error = params.get("error");

    if (error) {
      localStorage.setItem(FB_STORAGE_KEY, JSON.stringify({ error }));
    } else if (token) {
      localStorage.setItem(FB_STORAGE_KEY, JSON.stringify({ token, pages: pagesRaw ? JSON.parse(pagesRaw) : [] }));
    }
    router.replace("/");
  }, [params, router]);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 24 }}>
      <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
      <span style={{ fontSize: 14, color: "var(--text-muted)" }}>Connecting to Facebook…</span>
    </div>
  );
}

export default function FacebookCallbackPage() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <Suspense>
        <FacebookCallback />
      </Suspense>
    </motion.div>
  );
}
