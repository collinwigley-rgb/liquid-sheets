/* Build-time configuration for the static app. Single import point so a
 * self-hoster can flip one flag and rebuild.
 *
 * AI_ENDPOINT is the ONLY switch that lights up the optional AI "live read".
 * In the hosted deployment it is null: the app ships with zero AI, no API-key
 * UX, no copilot DOM, and no gear control. A developer who wants the copilot
 * runs the companion server in copilot-server/ (see its README) and sets this
 * to that server's base URL (for example "http://localhost:8017"). See
 * docs/adr/0006-ai-copilot-self-hosted-companion-not-in-app.md. */

export const AI_ENDPOINT = null;

/* Used only by the companion-server path; the server itself can override these
 * with its own env vars. Kept here so a self-hoster sees one place to look. */
export const AI_MODEL = "claude-opus-4-8";
export const AI_EFFORT = "medium";

/* True only when the copilot is actually wired. Everything AI-related in the
 * app guards on this, so the hosted build tree-shakes to no AI at all. */
export const AI_ENABLED = AI_ENDPOINT != null;
