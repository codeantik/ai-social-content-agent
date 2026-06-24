"use client";

import { useRef } from "react";
import { KnowledgeBasePanel } from "./KnowledgeBasePanel";
import { FacebookPanel } from "./FacebookPanel";
import { LinkedInPanel } from "./LinkedInPanel";
import { VoiceRecorder } from "./VoiceRecorder";
import type { FacebookConnection, LinkedInConnection } from "@/lib/types";
import type { NonprofitProfile } from "@/lib/api";

type Props = {
  orgWebsite: string;
  onOrgWebsiteChange: (v: string) => void;
  communityId: string;
  onCommunityIdChange: (v: string) => void;
  nonprofitProfile: NonprofitProfile;
  orgId: string | null;
  generateImage: boolean;
  onGenerateImageChange: (v: boolean) => void;
  uploadedImage: File | null;
  onUploadedImageChange: (f: File | null) => void;
  onVoiceTranscript: (text: string) => void;
  fbEnabled: boolean;
  fbConnection: FacebookConnection;
  onFbSelectPage: (pageId: string) => void;
  onFbDisconnect: () => void;
  liEnabled: boolean;
  liConnection: LinkedInConnection;
  onLiOrgIdChange: (orgId: string) => void;
  onLiDisconnect: () => void;
};

export function Sidebar({
  orgWebsite,
  onOrgWebsiteChange,
  communityId,
  onCommunityIdChange,
  nonprofitProfile,
  orgId,
  generateImage,
  onGenerateImageChange,
  uploadedImage,
  onUploadedImageChange,
  onVoiceTranscript,
  fbEnabled,
  fbConnection,
  onFbSelectPage,
  onFbDisconnect,
  liEnabled,
  liConnection,
  onLiOrgIdChange,
  onLiDisconnect,
}: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const profileName = typeof nonprofitProfile.name === "string" ? nonprofitProfile.name : null;

  return (
    <aside className="flex w-80 flex-shrink-0 flex-col gap-6 overflow-y-auto border-r border-black/10 p-4">
      <div>
        <h2 className="mb-2 text-sm font-semibold">⚙️ Options</h2>
        <label className="flex flex-col gap-1 text-xs">
          Your organization&apos;s Neki page (optional)
          <input
            value={orgWebsite}
            onChange={(e) => onOrgWebsiteChange(e.target.value)}
            placeholder="https://my.neki.io/nonprofit/your-org"
            className="rounded-lg border border-black/10 px-2 py-1.5"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1 text-xs">
        Community ID
        <input
          value={communityId}
          onChange={(e) => onCommunityIdChange(e.target.value)}
          placeholder="e.g. 42"
          className="rounded-lg border border-black/10 px-2 py-1.5"
        />
        {profileName && <span className="text-black/60">📋 {profileName}</span>}
      </label>

      <hr className="border-black/10" />

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">🖼️ Post image</h3>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={generateImage}
            onChange={(e) => onGenerateImageChange(e.target.checked)}
          />
          Generate image with post
        </label>
        <label className="flex flex-col gap-1 text-xs">
          …or upload your own image
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => onUploadedImageChange(e.target.files?.[0] ?? null)}
          />
        </label>
        {uploadedImage && (
          <p className="text-xs text-black/50">Selected: {uploadedImage.name} (takes priority over generation)</p>
        )}
      </div>

      <hr className="border-black/10" />
      <KnowledgeBasePanel orgWebsite={orgWebsite} orgId={orgId} />

      <hr className="border-black/10" />
      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">🎙️ Voice Input</h3>
        <p className="text-xs text-black/50">Record a message — it will be sent to the chat automatically.</p>
        <VoiceRecorder onTranscript={onVoiceTranscript} />
      </div>

      <hr className="border-black/10" />
      <FacebookPanel
        enabled={fbEnabled}
        connection={fbConnection}
        onSelectPage={onFbSelectPage}
        onDisconnect={onFbDisconnect}
      />

      <hr className="border-black/10" />
      <LinkedInPanel
        enabled={liEnabled}
        connection={liConnection}
        onOrgIdChange={onLiOrgIdChange}
        onDisconnect={onLiDisconnect}
      />
    </aside>
  );
}
