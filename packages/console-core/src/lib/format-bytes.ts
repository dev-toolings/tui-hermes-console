/** Taille lisible — l'UI l'affiche, le serveur l'utilise dans ses messages
 *  d'erreur de dépôt. Une seule règle d'arrondi pour les deux. */
export function formatBytes(bytes: number) {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} Mo`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} Ko`;
  return `${bytes} o`;
}
