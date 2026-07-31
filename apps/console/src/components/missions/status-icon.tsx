/**
 * La pastille de statut du board, reprise de Multica
 * (`packages/views/issues/components/status-icon.tsx`).
 *
 * Même géométrie : viewBox 14×14, centre (7,7), anneau r=6 en trait 1,5, part
 * de camembert r=3,5 partant de midi dans le sens horaire. C'est cette part
 * qui porte l'information — l'anneau seul dit « rien n'a commencé », le disque
 * plein « c'est fini » — si bien que le statut reste lisible sans couleur.
 */
const CX = 7;
const CY = 7;
const OUTER_R = 6;
const FILL_R = 3.5;

/** Part de camembert depuis midi, sens horaire. */
function piePath(progress: number): string {
  const angle = 2 * Math.PI * progress;
  const endX = CX + FILL_R * Math.sin(angle);
  const endY = CY - FILL_R * Math.cos(angle);
  const largeArc = progress > 0.5 ? 1 : 0;
  return `M${CX},${CY} L${CX},${CY - FILL_R} A${FILL_R},${FILL_R} 0 ${largeArc},1 ${endX},${endY} Z`;
}

/** Le glyphe central, quand l'état en réclame un. */
export type StatusMark = "check" | "cross" | "slash";

function Mark({ mark }: { mark: StatusMark }) {
  if (mark === "check") {
    return (
      <path
        d="M10.951 4.24896C11.283 4.58091 11.283 5.11909 10.951 5.45104L5.95104 10.451C5.61909 10.783 5.0809 10.783 4.74896 10.451L2.74896 8.45104C2.41701 8.11909 2.41701 7.5809 2.74896 7.24896C3.0809 6.91701 3.61909 6.91701 3.95104 7.24896L5.35 8.64792L9.74896 4.24896C10.0809 3.91701 10.6191 3.91701 10.951 4.24896Z"
        fill="var(--color-card)"
        stroke="none"
      />
    );
  }
  if (mark === "cross") {
    return (
      <path
        d="M5 5 L9 9 M9 5 L5 9"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
      />
    );
  }
  return (
    <line
      x1={CX + FILL_R * Math.cos(Math.PI * 0.75)}
      y1={CY - FILL_R * Math.sin(Math.PI * 0.75)}
      x2={CX + FILL_R * Math.cos(-Math.PI * 0.25)}
      y2={CY - FILL_R * Math.sin(-Math.PI * 0.25)}
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
    />
  );
}

export function StatusIcon({
  progress,
  mark,
  className = "size-3.5",
}: {
  progress: number;
  mark?: StatusMark;
  className?: string;
}) {
  return (
    <svg viewBox="0 0 14 14" fill="none" aria-hidden className={`${className} shrink-0`}>
      <circle
        cx={CX}
        cy={CY}
        r={OUTER_R}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeDasharray="3.14 0"
        strokeDashoffset={-0.7}
      />
      {progress === 1 ? (
        <circle cx={CX} cy={CY} r={OUTER_R} fill="currentColor" />
      ) : progress > 0 ? (
        <path d={piePath(progress)} fill="currentColor" />
      ) : null}
      {mark ? <Mark mark={mark} /> : null}
    </svg>
  );
}
