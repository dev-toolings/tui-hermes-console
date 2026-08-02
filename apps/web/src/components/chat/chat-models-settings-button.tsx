"use client";

import { useState } from "react";
import { Settings2Icon } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { ModelSettings } from "@/components/settings/model-settings";

export function ChatModelsSettingsButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
        aria-label="Paramètres modèles"
        title="Modèles"
        onClick={() => setOpen(true)}
      >
        <Settings2Icon className="size-4" />
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="Modèles"
        description="Provider LLM, clé API et modèle par défaut pour les prochaines sessions."
        className="max-w-2xl"
      >
        <ModelSettings />
      </Dialog>
    </>
  );
}
