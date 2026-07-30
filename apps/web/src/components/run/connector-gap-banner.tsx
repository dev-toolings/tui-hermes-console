import Link from "next/link";
import type { ConnectorType } from "@/db/schema";
import { CONNECTOR_TYPE_LABELS } from "@/modules/connectors/requirements";

export function ConnectorGapBanner({ gaps }: { gaps: ConnectorType[] }) {
  if (gaps.length === 0) return null;

  return (
    <div
      role="status"
      className="shrink-0 border-b border-warning/35 bg-warning/5 px-4 py-3 text-sm"
    >
      <p className="font-medium text-warn-700">Connecteur requis manquant</p>
      <p className="mt-1 text-muted-foreground">
        Cette session nécessite :{" "}
        {gaps.map((type) => CONNECTOR_TYPE_LABELS[type]).join(", ")}.
      </p>
      <Link
        href="/settings/connectors"
        className="mt-2 inline-flex text-sm font-medium text-primary underline-offset-4 hover:underline"
      >
        Configurer dans Paramètres → Connecteurs
      </Link>
    </div>
  );
}
