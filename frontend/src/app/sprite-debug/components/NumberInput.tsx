/**
 * NumberInput Component
 *
 * Reusable number input with label, text input, and range slider.
 */

interface NumberInputProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  labelWidth?: string;
}

export function NumberInput({
  label,
  value,
  onChange,
  min = 0,
  max = 2000,
  step = 1,
  labelWidth = "w-24",
}: NumberInputProps) {
  return (
    <div className="flex items-center gap-2">
      <label className={`${labelWidth} text-sm text-gray-300`}>{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        max={max}
        step={step}
        className="w-20 px-2 py-1 bg-gray-800 border border-gray-600 rounded text-white text-sm"
      />
      <input
        type="range"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        max={max}
        step={step}
        className="flex-1"
      />
    </div>
  );
}
