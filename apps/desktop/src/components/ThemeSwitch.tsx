import type { ThemePref } from '../lib/settings';

const OPTIONS: { value: ThemePref; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'dark', label: 'Dark' },
  { value: 'light', label: 'Light' },
];

export function ThemeSwitch({
  value,
  onChange,
}: {
  value: ThemePref;
  onChange: (v: ThemePref) => void;
}) {
  return (
    <fieldset className="inline-flex rounded-sm border border-line">
      <legend className="sr-only">Theme</legend>
      {OPTIONS.map((o) => (
        <label
          key={o.value}
          className={`min-h-8 cursor-pointer px-3 leading-8 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-scope ${value === o.value ? 'bg-bg-3 text-text-1' : 'text-text-2'}`}
        >
          <input
            type="radio"
            name="theme"
            className="sr-only"
            checked={value === o.value}
            onChange={() => onChange(o.value)}
          />
          {o.label}
        </label>
      ))}
    </fieldset>
  );
}
