import { Check } from "lucide-react";
import { devicePresets, type DeviceId } from "@hermes-console/device-kit";

export function DevicePicker({ value, onChange }: { value: DeviceId; onChange: (device: DeviceId) => void }) {
  return (
    <div className="device-picker" role="radiogroup" aria-label="Choisir un appareil">
      {devicePresets.map((item) => (
        <button key={item.id} type="button" role="radio" aria-checked={value === item.id} className={value === item.id ? "selected" : ""} onClick={() => onChange(item.id)}>
          <span className={`device-glyph glyph-${item.folds}`} aria-hidden="true">{item.folds === 2 && <i />}</span>
          <span><strong>{item.shortName}</strong><small>{item.family}</small></span>
          {value === item.id && <Check size={18} />}
        </button>
      ))}
    </div>
  );
}
