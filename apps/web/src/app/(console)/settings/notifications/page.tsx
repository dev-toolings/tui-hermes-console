import { SectionHeading } from "@/components/ui/boardui";
import { NotificationsSettings } from "@/components/settings/notifications-settings";
import { SettingsContent } from "@/components/settings/settings-content";

export default function NotificationsSettingsPage() {
  return (
    <SettingsContent>
      <SectionHeading
        title="Notifications"
        description="Choisissez quand être alerté pendant et après une mission."
      />
      <NotificationsSettings />
    </SettingsContent>
  );
}
