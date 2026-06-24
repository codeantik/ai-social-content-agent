// Typed fetch client over the FastAPI serving layer (api/routes/*.py).
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type ClarifyResponse = { ready: boolean; response: string; summary: string };

export type FacebookPage = { id: string; name: string; access_token: string };

export type NonprofitProfile = Record<string, unknown>;

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text();
    throw new Error(body || `Request failed: ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function clarify(
  messages: ChatMessage[],
  nonprofitProfile: NonprofitProfile = {},
): Promise<ClarifyResponse> {
  return fetch(`${API_BASE}/chat/clarify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages, nonprofit_profile: nonprofitProfile }),
  }).then(asJson<ClarifyResponse>);
}

export function editContent(
  content: string,
  instruction: string,
  originalQuery = "",
): Promise<{ content: string }> {
  return fetch(`${API_BASE}/content/edit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, instruction, original_query: originalQuery }),
  }).then(asJson<{ content: string }>);
}

export function transcribe(audio: Blob): Promise<{ text: string }> {
  const form = new FormData();
  form.append("audio", audio, "recording.wav");
  return fetch(`${API_BASE}/transcribe`, { method: "POST", body: form }).then(
    asJson<{ text: string }>,
  );
}

export function facebookLoginUrl(): string {
  return `${API_BASE}/auth/facebook/login`;
}

export function linkedinLoginUrl(): string {
  return `${API_BASE}/auth/linkedin/login`;
}

export function publishToFacebook(req: {
  page_id: string;
  page_access_token: string;
  content: string;
  image_base64?: string | null;
}): Promise<{ post_id: string }> {
  return fetch(`${API_BASE}/facebook/publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  }).then(asJson<{ post_id: string }>);
}

export function publishToLinkedIn(req: {
  org_urn: string;
  access_token: string;
  content: string;
  image_base64?: string | null;
}): Promise<{ post_urn: string }> {
  return fetch(`${API_BASE}/linkedin/publish`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  }).then(asJson<{ post_urn: string }>);
}

export function knowledgeStatus(orgId: string): Promise<{
  indexed: boolean;
  source_count: number;
  indexing_in_progress: boolean;
}> {
  return fetch(`${API_BASE}/knowledge/status?org_id=${encodeURIComponent(orgId)}`).then(
    asJson<{ indexed: boolean; source_count: number; indexing_in_progress: boolean }>,
  );
}

export function knowledgeReindex(orgId: string): Promise<{ ok: boolean }> {
  return fetch(`${API_BASE}/knowledge/reindex`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ org_id: orgId }),
  }).then(asJson<{ ok: boolean }>);
}

export function knowledgeUpload(orgId: string, file: File): Promise<{ chunks_added: number }> {
  const form = new FormData();
  form.append("org_id", orgId);
  form.append("file", file);
  return fetch(`${API_BASE}/knowledge/upload`, { method: "POST", body: form }).then(
    asJson<{ chunks_added: number }>,
  );
}

export function fetchOrgId(orgWebsite: string, communityId: string): Promise<{ org_id: string }> {
  const params = new URLSearchParams({ org_website: orgWebsite, community_id: communityId });
  return fetch(`${API_BASE}/org-id?${params}`).then(asJson<{ org_id: string }>);
}

export function fetchProfile(communityId: number): Promise<NonprofitProfile> {
  return fetch(`${API_BASE}/profile?community_id=${communityId}`).then(
    asJson<NonprofitProfile>,
  );
}

export function fetchUsage(): Promise<{ used: number; limit: number; remaining: number }> {
  return fetch(`${API_BASE}/usage`).then(
    asJson<{ used: number; limit: number; remaining: number }>,
  );
}

export { API_BASE };
