"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";

const LI_STORAGE_KEY = "content-agent:li-oauth";

function LinkedInCallback() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const token = params.get("token");
    const error = params.get("error");

    if (error) {
      localStorage.setItem(LI_STORAGE_KEY, JSON.stringify({ error }));
    } else if (token) {
      localStorage.setItem(LI_STORAGE_KEY, JSON.stringify({ token }));
    }
    router.replace("/");
  }, [params, router]);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 24 }}>
      <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />
      <span style={{ fontSize: 14, color: "var(--text-muted)" }}>Connecting to LinkedIn…</span>
    </div>
  );
}

export default function LinkedInCallbackPage() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <Suspense>
        <LinkedInCallback />
      </Suspense>
    </motion.div>
  );
}
