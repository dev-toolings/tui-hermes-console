/**
 * Attachment chips are meant to sit side by side, so a name is capped at a
 * fixed number of characters rather than at a fluid width: a single long name
 * would otherwise take the whole row on its own.
 *
 * The tail is kept rather than cut, because the extension is what tells the
 * user which file a chip stands for. The full name stays available in the
 * element's `title`.
 */
export const MAX_FILE_NAME_CHARS = 20;

export function truncateFileName(name: string, max = MAX_FILE_NAME_CHARS) {
  if (name.length <= max) return name;
  const dot = name.lastIndexOf(".");
  const extension = dot > 0 && name.length - dot <= 6 ? name.slice(dot) : "";
  const head = Math.max(1, max - extension.length - 1);
  return `${name.slice(0, head)}…${extension}`;
}
