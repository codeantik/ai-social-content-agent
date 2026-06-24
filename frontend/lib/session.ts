// Mirrors st.session_state["session_id"] — one UUID per browser tab session.
const SESSION_KEY = "content-agent:session-id";

export function getSessionId(): string {
  if (typeof window === "undefined") return "";
  let id = sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}
