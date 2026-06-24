"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const LI_STORAGE_KEY = "content-agent:li-oauth";

function LinkedInCallback() {
  const router = useRouter();
  const params = useSearchParams();

  useEffect(() => {
    const token = params.get("token");
    const error = params.get("error");

    if (error) {
      sessionStorage.setItem(LI_STORAGE_KEY, JSON.stringify({ error }));
    } else if (token) {
      sessionStorage.setItem(LI_STORAGE_KEY, JSON.stringify({ token }));
    }
    router.replace("/");
  }, [params, router]);

  return <p className="p-6 text-sm text-black/60">Connecting to LinkedIn…</p>;
}

export default function LinkedInCallbackPage() {
  return (
    <Suspense>
      <LinkedInCallback />
    </Suspense>
  );
}
