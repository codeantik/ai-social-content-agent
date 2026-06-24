"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect } from "react";

const FB_STORAGE_KEY = "content-agent:fb-oauth";

function FacebookCallback() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const token = params.get("token");
    const pagesRaw = params.get("pages");
    const error = params.get("error");

    if (error) {
      sessionStorage.setItem(FB_STORAGE_KEY, JSON.stringify({ error }));
    } else if (token) {
      sessionStorage.setItem(
        FB_STORAGE_KEY,
        JSON.stringify({ token, pages: pagesRaw ? JSON.parse(pagesRaw) : [] }),
      );
    }
    router.replace("/");
  }, [params, router]);

  return <p className="p-6 text-sm text-black/60">Connecting to Facebook…</p>;
}

export default function FacebookCallbackPage() {
  return (
    <Suspense>
      <FacebookCallback />
    </Suspense>
  );
}
