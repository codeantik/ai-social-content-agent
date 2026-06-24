"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Sidebar } from "@/components/Sidebar";
import { ChatPanel, GREETING } from "@/components/ChatPanel";
import { ResultPanel } from "@/components/ResultPanel";
import { clarify, fetchOrgId, fetchProfile, type ChatMessage } from "@/lib/api";
import { useGenerateStream } from "@/lib/useGenerateStream";
import { getSessionId } from "@/lib/session";
import type { FacebookConnection, GenerationResult, LinkedInConnection, Mode } from "@/lib/types";

const FB_STORAGE_KEY = "content-agent:fb-oauth";
const LI_STORAGE_KEY = "content-agent:li-oauth";

function readFbConnectionFromStorage(): FacebookConnection {
  const empty: FacebookConnection = { connected: false, token: null, pages: [], selectedPageId: null, error: null };
  if (typeof window === "undefined") return empty;
  const raw = sessionStorage.getItem(FB_STORAGE_KEY);
  if (!raw) return empty;
  sessionStorage.removeItem(FB_STORAGE_KEY);
  try {
    const parsed = JSON.parse(raw);
    if (parsed.error) return { ...empty, error: parsed.error };
    return {
      connected: true,
      token: parsed.token,
      pages: parsed.pages ?? [],
      selectedPageId: parsed.pages?.[0]?.id ?? null,
      error: null,
    };
  } catch {
    return empty;
  }
}

function readLiConnectionFromStorage(): LinkedInConnection {
  const empty: LinkedInConnection = { connected: false, token: null, orgId: "", error: null };
  if (typeof window === "undefined") return empty;
  const raw = sessionStorage.getItem(LI_STORAGE_KEY);
  if (!raw) return empty;
  sessionStorage.removeItem(LI_STORAGE_KEY);
  try {
    const parsed = JSON.parse(raw);
    if (parsed.error) return { ...empty, error: parsed.error };
    return { connected: true, token: parsed.token, orgId: "", error: null };
  } catch {
    return empty;
  }
}

export default function Home() {
  const [mode, setMode] = useState<Mode>("chat");
  const [messages, setMessages] = useState<ChatMessage[]>([GREETING]);
  const [chatReady, setChatReady] = useState(false);
  const [sessionId] = useState(() => getSessionId());

  const [orgWebsite, setOrgWebsite] = useState("");
  const [communityId, setCommunityId] = useState("");
  const [generateImage, setGenerateImage] = useState(false);
  const [uploadedImage, setUploadedImage] = useState<File | null>(null);

  const [result, setResult] = useState<GenerationResult | null>(null);
  const [editorContent, setEditorContent] = useState("");

  const [fbConnection, setFbConnection] = useState<FacebookConnection>(() => readFbConnectionFromStorage());
  const [liConnection, setLiConnection] = useState<LinkedInConnection>(() => readLiConnectionFromStorage());

  const orgIdQuery = useQuery({
    queryKey: ["org-id", orgWebsite, communityId],
    queryFn: () => fetchOrgId(orgWebsite.trim(), communityId.trim()),
    enabled: orgWebsite.trim().length > 0,
  });

  const profileQuery = useQuery({
    queryKey: ["profile", communityId],
    queryFn: () => fetchProfile(Number(communityId.trim())),
    enabled: /^\d+$/.test(communityId.trim()),
  });
  const nonprofitProfile = profileQuery.data ?? {};

  const clarifyMutation = useMutation({
    mutationFn: (history: ChatMessage[]) => clarify(history, nonprofitProfile),
  });

  const { start: startGenerate, progressLabel, isStreaming } = useGenerateStream();

  function handleSendMessage(text: string) {
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    clarifyMutation.mutate(next, {
      onSuccess: (data) => {
        setMessages((m) => [...m, { role: "assistant", content: data.response }]);
        if (data.ready) setChatReady(true);
      },
    });
  }

  function handleVoiceTranscript(text: string) {
    if (mode === "chat") handleSendMessage(text);
  }

  async function handleGenerate() {
    const userMessages = messages.slice(1).filter((m) => m.role === "user");
    const originalQuery = userMessages[0]?.content ?? "";
    const clarificationContext = userMessages.map((m) => m.content).join("\n");

    const final = await startGenerate({
      brief: originalQuery,
      sessionId,
      orgWebsite: orgWebsite.trim(),
      communityId: communityId.trim(),
      generateImage,
      summary: clarificationContext,
      image: uploadedImage,
    });

    setResult({
      content: final.content,
      retrievalSources: final.retrieval_sources,
      imageBase64: final.image_base64,
      imageError: final.image_error,
      originalQuery,
      hasImage: generateImage || !!uploadedImage,
      imageUploaded: !!uploadedImage,
    });
    setEditorContent(final.content);
    setMode("result");
  }

  function handleStartOver() {
    setMode("chat");
    setMessages([GREETING]);
    setChatReady(false);
    setResult(null);
    setUploadedImage(null);
  }

  const fbEnabled = process.env.NEXT_PUBLIC_FACEBOOK_ENABLED === "true";
  const liEnabled = process.env.NEXT_PUBLIC_LINKEDIN_ENABLED === "true";

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-black/10 p-4">
        <h1 className="text-xl font-bold">✍️ Content Creator AI Agent</h1>
        <p className="text-sm text-black/60">
          Chat to clarify your request, then generate professional content powered by OpenAI Models
        </p>
      </header>

      <div className="flex flex-1">
        <Sidebar
          orgWebsite={orgWebsite}
          onOrgWebsiteChange={setOrgWebsite}
          communityId={communityId}
          onCommunityIdChange={setCommunityId}
          nonprofitProfile={nonprofitProfile}
          orgId={orgIdQuery.data?.org_id ?? null}
          generateImage={generateImage}
          onGenerateImageChange={setGenerateImage}
          uploadedImage={uploadedImage}
          onUploadedImageChange={setUploadedImage}
          onVoiceTranscript={handleVoiceTranscript}
          fbEnabled={fbEnabled}
          fbConnection={fbConnection}
          onFbSelectPage={(pageId) => setFbConnection((c) => ({ ...c, selectedPageId: pageId }))}
          onFbDisconnect={() =>
            setFbConnection({ connected: false, token: null, pages: [], selectedPageId: null, error: null })
          }
          liEnabled={liEnabled}
          liConnection={liConnection}
          onLiOrgIdChange={(orgId) => setLiConnection((c) => ({ ...c, orgId }))}
          onLiDisconnect={() => setLiConnection({ connected: false, token: null, orgId: "", error: null })}
        />

        <main className="flex-1 overflow-y-auto p-6">
          {mode === "chat" ? (
            <ChatPanel
              messages={messages}
              onSendMessage={handleSendMessage}
              chatReady={chatReady}
              onGenerate={handleGenerate}
              isClarifying={clarifyMutation.isPending}
              isGenerating={isStreaming}
              progressLabel={progressLabel}
            />
          ) : result ? (
            <ResultPanel
              result={result}
              editorContent={editorContent}
              onEditorContentChange={setEditorContent}
              onStartOver={handleStartOver}
              fbConnection={fbConnection}
              liConnection={liConnection}
            />
          ) : null}
        </main>
      </div>
    </div>
  );
}
