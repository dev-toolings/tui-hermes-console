"use client";

import { useSyncExternalStore } from "react";
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useBui } from "@boardui/ui/shell";
import { Button, Card, CardSurface } from "@/components/ui/boardui";
import { hermesAppearance } from "@/lib/settings/appearance";
import {
  getThemePreference,
  setThemePreference,
  subscribeToPreferences,
  type ThemePreference,
} from "@/lib/settings/preferences";
import { cn } from "@/lib/cn";

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: typeof SunIcon }[] = [
  { value: "light", label: "Clair", icon: SunIcon },
  { value: "dark", label: "Sombre", icon: MoonIcon },
  { value: "system", label: "Système", icon: MonitorIcon },
];

const LAYOUT_OPTIONS = [
  { value: "boardui" as const, label: "BoardUI classique", detail: "Sidebar pleine hauteur" },
  { value: "inset" as const, label: "BoardUI inset", detail: "Panneau flottant" },
];

export function AppearanceSettings() {
  const theme = useSyncExternalStore(
    subscribeToPreferences,
    getThemePreference,
    (): ThemePreference => "system",
  );
  const appearance = hermesAppearance.useAppearance();
  const { layout, setLayout } = useBui();

  return (
    <div className="space-y-4">
      <Card>
        <CardSurface className="space-y-4">
          <div>
            <h3 className="text-[0.8125rem] font-medium">Thème</h3>
            <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
              Couleurs de l’interface. « Système » suit la préférence de l’OS.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {THEME_OPTIONS.map((option) => {
              const Icon = option.icon;
              const active = theme === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setThemePreference(option.value)}
                  className={cn(
                    "flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border p-3 text-[0.8125rem] transition-colors",
                    active
                      ? "border-ring bg-info-soft text-foreground"
                      : "border-input bg-card hover:bg-muted",
                  )}
                >
                  <Icon className="size-4" />
                  {option.label}
                </button>
              );
            })}
          </div>
        </CardSurface>
      </Card>

      <Card>
        <CardSurface className="space-y-4">
          <div>
            <h3 className="text-[0.8125rem] font-medium">Disposition BoardUI</h3>
            <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
              Style du shell principal. Persisté localement sur cet appareil.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {LAYOUT_OPTIONS.map((option) => {
              const active = layout === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setLayout(option.value)}
                  className={cn(
                    "rounded-xl border p-3 text-start transition-colors",
                    active
                      ? "border-ring bg-info-soft"
                      : "border-input bg-card hover:bg-muted",
                  )}
                >
                  <span className="block text-[0.8125rem] font-medium">{option.label}</span>
                  <span className="mt-1 block text-[0.6875rem] text-muted-foreground">
                    {option.detail}
                  </span>
                </button>
              );
            })}
          </div>
        </CardSurface>
      </Card>

      <Card>
        <CardSurface className="space-y-5">
          <div>
            <h3 className="text-[0.8125rem] font-medium">Dimensions</h3>
            <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
              Ajustements fins de la console sur cet appareil.
            </p>
          </div>

          <AppearanceSlider
            label="Largeur du contenu"
            value={appearance.contentWidth}
            spec={hermesAppearance.APPEARANCE.contentWidth}
            format={(value) =>
              hermesAppearance.isFullWidth(value) ? "Pleine largeur" : `${value}px`
            }
            onChange={(value) => hermesAppearance.setAppearance("contentWidth", value)}
          />
          <AppearanceSlider
            label="Largeur de la sidebar"
            value={appearance.sidebarWidth}
            spec={hermesAppearance.APPEARANCE.sidebarWidth}
            format={(value) => `${value}px`}
            onChange={(value) => hermesAppearance.setAppearance("sidebarWidth", value)}
          />
          <AppearanceSlider
            label="Échelle de l’interface"
            value={appearance.uiScale}
            spec={hermesAppearance.APPEARANCE.uiScale}
            format={(value) => `${value}%`}
            onChange={(value) => hermesAppearance.setAppearance("uiScale", value)}
          />

          <div className="flex justify-end border-t border-seam pt-4">
            <Button type="button" onClick={() => hermesAppearance.resetAppearance()}>
              Réinitialiser les dimensions
            </Button>
          </div>
        </CardSurface>
      </Card>
    </div>
  );
}

function AppearanceSlider({
  label,
  value,
  spec,
  format,
  onChange,
}: {
  label: string;
  value: number;
  spec: { min: number; max: number; step: number };
  format: (value: number) => string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <div className="mb-2 flex items-center justify-between gap-3 text-[0.8125rem]">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">{format(value)}</span>
      </div>
      <input
        type="range"
        min={spec.min}
        max={spec.max}
        step={spec.step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-2 w-full cursor-pointer accent-primary"
      />
    </label>
  );
}
