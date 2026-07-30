import { SectionHeading } from "@/components/ui/boardui";
import { AppearanceSettings } from "@/components/settings/appearance-settings";
import { SettingsContent } from "@/components/settings/settings-content";

export default function AppearanceSettingsPage() {
  return (
    <SettingsContent>
      <SectionHeading
        title="Apparence"
        description="Thème, disposition et dimensions de l’interface Console."
      />
      <AppearanceSettings />
    </SettingsContent>
  );
}
