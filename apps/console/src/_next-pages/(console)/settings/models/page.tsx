import { SectionHeading } from "@/components/ui/boardui";
import { ModelSettings } from "@/components/settings/model-settings";
import { SettingsContent } from "@/components/settings/settings-content";

export default function ModelsSettingsPage() {
  return (
    <SettingsContent>
      <SectionHeading
        title="Modèles"
        description="Provider LLM, clé API et modèle par défaut pour les prochaines missions."
      />
      <ModelSettings />
    </SettingsContent>
  );
}
