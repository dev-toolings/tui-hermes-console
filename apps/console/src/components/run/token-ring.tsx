"use client";

/**
 * L'anneau de contexte, sous le composer.
 *
 * Un nombre de tokens ne dit rien tout seul : « 28 029 tk » ne répond pas à la
 * seule question qu'on se pose vraiment — est-ce que la conversation approche de
 * sa limite ? L'anneau répond d'un coup d'œil, le survol donne le détail.
 *
 * Il n'apparaît que si la fenêtre du modèle est connue (`contextUsage` renvoie
 * `null` sinon) : un anneau calé sur une fenêtre devinée serait un cadran sans
 * graduation.
 */
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { contextUsage } from "@console/core/lib/context-window";
import { formatTokens } from "@console/core/lib/run-status";
import { cn } from "@/lib/cn";

/** Géométrie de l'anneau, en unités du viewBox. */
const RADIUS = 7;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function TokenRing({
  totalTokens,
  model,
  className,
}: {
  /** Tokens cumulés de la conversation — entrée et sortie de tous les runs. */
  totalTokens: number | null;
  model: string | null;
  className?: string;
}) {
  const usage = contextUsage(totalTokens, model);
  if (!usage) return null;

  const filled = CIRCUMFERENCE * usage.ratio;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn("inline-flex items-center", className)}
          // Le rôle porte la valeur : un lecteur d'écran ne voit pas un anneau.
          role="meter"
          aria-valuenow={usage.usedPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Contexte utilisé : ${usage.usedPercent} %`}
          tabIndex={0}
        >
          <svg viewBox="0 0 20 20" className="size-4" aria-hidden>
            <circle
              cx="10"
              cy="10"
              r={RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              className="text-current opacity-25"
            />
            <circle
              cx="10"
              cy="10"
              r={RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              // Départ à midi, sens horaire : le quart de circonférence décale
              // l'origine du tracé, qui commence sinon à 3 h.
              strokeDasharray={`${filled} ${CIRCUMFERENCE - filled}`}
              strokeDashoffset={CIRCUMFERENCE / 4}
              transform="rotate(-90 10 10)"
              className={cn(
                "transition-[stroke-dasharray] duration-500 motion-reduce:transition-none",
                usage.exceeded
                  ? "text-destructive"
                  : usage.critical
                    ? "text-warn-700"
                    : "text-primary",
              )}
            />
          </svg>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">
        {usage.exceeded ? (
          <span>
            {formatTokens(usage.used)} tokens cumulés · au-delà de la fenêtre de{" "}
            {formatTokens(usage.window)}
          </span>
        ) : (
          <span>
            {usage.remainingPercent} % restant · {formatTokens(usage.used)} /{" "}
            {formatTokens(usage.window)} tokens
          </span>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
