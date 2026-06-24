import type { FacebookPage } from "./api";

export type Mode = "chat" | "result";

export type GenerationResult = {
  content: string;
  retrievalSources: string[];
  imageBase64: string | null;
  imageError: string | null;
  originalQuery: string;
  hasImage: boolean;
  imageUploaded: boolean;
};

export type FacebookConnection = {
  connected: boolean;
  token: string | null;
  pages: FacebookPage[];
  selectedPageId: string | null;
  error: string | null;
};

export type LinkedInConnection = {
  connected: boolean;
  token: string | null;
  orgId: string;
  error: string | null;
};
