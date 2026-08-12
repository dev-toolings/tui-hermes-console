/**
 * A workspace tone is a stored string, so it can name a class this build no
 * longer generates. Resolving it here guarantees a readable pair in both
 * themes: known tones carry their contrast-checked text color, anything else
 * falls back to a neutral chip instead of white-on-transparent.
 */
const TONE_TEXT: Record<string, string> = {
  "bg-[#8b5cf6]": "text-white",
  "bg-[#ec4899]": "text-white",
  "bg-[#10b981]": "text-white",
  "bg-[#f59e0b]": "text-[#451a03]",
};

export function workspaceToneClasses(tone: string) {
  const text = TONE_TEXT[tone];
  return text
    ? `${tone} ${text}`
    : "bg-[var(--surface-raised)] text-[var(--foreground)]";
}
