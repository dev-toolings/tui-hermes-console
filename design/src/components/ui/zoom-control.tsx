import { Minus, Plus } from "lucide-react";

export function ZoomControl({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const change = (delta: number) => onChange(Math.min(140, Math.max(75, value + delta)));

  return (
    <div className="zoom-control" aria-label="Zoom de la prévisualisation">
      <button type="button" aria-label="Réduire le zoom" disabled={value <= 75} onClick={() => change(-10)}><Minus size={16} /></button>
      <button className="zoom-value" type="button" aria-label="Réinitialiser le zoom à 100 %" onClick={() => onChange(100)}>{value}&nbsp;%</button>
      <button type="button" aria-label="Augmenter le zoom" disabled={value >= 140} onClick={() => change(10)}><Plus size={16} /></button>
    </div>
  );
}
