import { SettingsNav } from "@/components/settings/settings-nav";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 p-4 lg:flex-row lg:gap-8 lg:p-6">
      <SettingsNav className="lg:w-52 lg:shrink-0" />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
