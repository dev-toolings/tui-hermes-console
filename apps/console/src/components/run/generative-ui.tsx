"use client";

import type { ReactNode } from "react";
import { Badge } from "@boardui/ui";
import { cn } from "@/lib/cn";

/**
 * Liste blanche des composants qu'un outil est autorisé à faire rendre.
 *
 * C'est la frontière de sécurité : `MessagePrimitive.GenerativeUI` refuse tout
 * nom absent d'ici. Ce sont volontairement des primitives composables et non
 * des widgets métier — le spec étant un arbre, un outil compose ce dont il a
 * besoin sans qu'on ait à écrire un composant de plus côté Console.
 */
export const HERMES_WIDGETS = {
  Card: WidgetCard,
  Fields: WidgetFields,
  Table: WidgetTable,
  Badge: WidgetBadge,
  Text: WidgetText,
  Link: WidgetLink,
  Code: WidgetCode,
};

export function HermesWidgetFallback({ component }: { component: string }) {
  return (
    <p className="my-1 rounded-md border border-dashed border-border px-3 py-2 text-[0.8125rem] text-muted-foreground">
      Composant <span className="font-mono">{component}</span> non enregistré.
    </p>
  );
}

function WidgetCard({ title, children }: { title?: unknown; children?: ReactNode }) {
  return (
    <div className="my-2 max-w-sm overflow-hidden rounded-xl border border-ai-separator bg-ai-primary">
      {title != null ? (
        <p className="border-b border-ai-separator px-3 py-2 text-[0.8125rem] font-medium">
          {String(title)}
        </p>
      ) : null}
      <div className="space-y-2 px-3 py-2 text-[0.8125rem]">{children}</div>
    </div>
  );
}

function WidgetFields({ items }: { items?: unknown }) {
  const rows = asArray(items)
    .map((item) => (isRecord(item) ? item : null))
    .filter((item): item is Record<string, unknown> => item !== null);
  if (rows.length === 0) return null;

  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[0.8125rem]">
      {rows.map((row, index) => (
        <div key={index} className="col-span-2 grid grid-cols-subgrid">
          <dt className="text-muted-foreground">{String(row.label ?? "")}</dt>
          <dd className="min-w-0 truncate">{String(row.value ?? "")}</dd>
        </div>
      ))}
    </dl>
  );
}

function WidgetTable({ columns, rows }: { columns?: unknown; rows?: unknown }) {
  const head = asArray(columns).map(String);
  const body = asArray(rows).map((row) => asArray(row).map(String));
  if (body.length === 0) return null;

  return (
    <div className="my-2 overflow-x-auto rounded-lg border border-ai-separator scrollbar-subtle">
      <table className="w-full text-left text-[0.8125rem]">
        {head.length > 0 ? (
          <thead className="text-muted-foreground">
            <tr>
              {head.map((cell, index) => (
                <th key={index} className="px-3 py-1.5 font-medium">
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
        ) : null}
        <tbody>
          {body.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-t border-ai-separator">
              {row.map((cell, cellIndex) => (
                <td key={cellIndex} className="px-3 py-1.5">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const BADGE_TONES = {
  success: "secondary",
  warning: "outline",
  danger: "destructive",
  neutral: "outline",
} as const;

function WidgetBadge({ label, tone, children }: { label?: unknown; tone?: unknown; children?: ReactNode }) {
  const variant = BADGE_TONES[String(tone) as keyof typeof BADGE_TONES] ?? "outline";
  return <Badge variant={variant}>{label != null ? String(label) : children}</Badge>;
}

function WidgetText({ value, tone, children }: { value?: unknown; tone?: unknown; children?: ReactNode }) {
  return (
    <p
      className={cn(
        "text-[0.8125rem] leading-relaxed",
        tone === "muted" && "text-muted-foreground",
        tone === "danger" && "text-destructive",
      )}
    >
      {value != null ? String(value) : children}
    </p>
  );
}

/**
 * Le `href` vient d'une sortie d'outil non fiable : n'accepter que http(s)
 * ferme la porte à `javascript:` et `data:`.
 */
function WidgetLink({ href, label, children }: { href?: unknown; label?: unknown; children?: ReactNode }) {
  const safe = safeHref(href);
  const text = label != null ? String(label) : (children ?? String(href ?? ""));
  if (!safe) return <span className="text-muted-foreground">{text}</span>;

  return (
    <a
      href={safe}
      target="_blank"
      rel="noreferrer noopener"
      className="text-[0.8125rem] text-primary underline underline-offset-4"
    >
      {text}
    </a>
  );
}

function WidgetCode({ value, children }: { value?: unknown; children?: ReactNode }) {
  return (
    <pre className="max-h-60 overflow-auto overscroll-contain rounded-md bg-muted/50 p-2.5 font-mono text-[11px] leading-relaxed break-words whitespace-pre-wrap text-muted-foreground scrollbar-subtle">
      {value != null ? String(value) : children}
    </pre>
  );
}

function safeHref(href: unknown): string | null {
  if (typeof href !== "string") return null;
  try {
    const url = new URL(href, window.location.origin);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === "object" && !Array.isArray(value);
}
