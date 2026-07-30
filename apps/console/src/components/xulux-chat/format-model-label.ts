export function formatXuluxModelLabel(model?: string) {
  if (!model) return null;
  const trimmed = model.trim();
  if (!trimmed) return null;
  const parts = trimmed.split("/").map((part) => part.trim()).filter(Boolean);
  return parts.at(-1) ?? trimmed;
}
