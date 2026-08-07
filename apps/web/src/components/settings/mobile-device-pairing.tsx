import { useEffect, useState } from "react";
import { CheckIcon, CopyIcon, SmartphoneIcon } from "lucide-react";

import { Button, Card, CardSurface } from "@/components/ui/boardui";

type Pairing = { pairingCode: string; expiresAt: string };

export function MobileDevicePairing() {
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "copied" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status !== "copied") return;
    const timeout = window.setTimeout(() => setStatus("idle"), 1800);
    return () => window.clearTimeout(timeout);
  }, [status]);

  async function createPairing() {
    setStatus("loading");
    setError(null);
    try {
      const response = await fetch("/api/auth/mobile?action=create", { method: "POST" });
      const body = await response.json() as Pairing & { error?: { message?: string } };
      if (!response.ok || !body.pairingCode) throw new Error(body.error?.message ?? "Impossible de créer le code.");
      setPairing(body);
      setStatus("idle");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Impossible de créer le code.");
      setStatus("error");
    }
  }

  async function copyPairing() {
    if (!pairing) return;
    await navigator.clipboard.writeText(pairing.pairingCode);
    setStatus("copied");
  }

  return (
    <Card>
      <CardSurface className="space-y-4">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-ai-tertiary text-muted-foreground">
            <SmartphoneIcon className="size-4" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-[0.8125rem] font-medium">Application mobile</h3>
            <p className="mt-1 text-[0.6875rem] leading-5 text-muted-foreground">
              Créez un code à usage unique, puis collez-le dans Hermes Console Mobile. Il expire après dix minutes.
            </p>
          </div>
        </div>

        {pairing ? (
          <div className="rounded-[10px] border border-seam bg-inset p-3">
            <p className="text-[0.6875rem] font-medium text-muted-foreground">Code d’association</p>
            <p className="mt-2 break-all font-mono text-[0.75rem] leading-5">{pairing.pairingCode}</p>
            <Button className="mt-3" variant="secondary" onClick={() => void copyPairing()} leadingIcon={status === "copied" ? CheckIcon : CopyIcon}>
              {status === "copied" ? "Copié" : "Copier le code"}
            </Button>
          </div>
        ) : null}

        {error ? <p role="alert" className="text-[0.75rem] text-danger">{error}</p> : null}
        <Button disabled={status === "loading"} onClick={() => void createPairing()} leadingIcon={SmartphoneIcon}>
          {status === "loading" ? "Création…" : pairing ? "Créer un nouveau code" : "Associer un appareil"}
        </Button>
      </CardSurface>
    </Card>
  );
}
