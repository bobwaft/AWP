import { useEffect, useState } from 'react';
import { engine } from '../lib/engine';
import type { DisplayMode, Settings } from '../lib/settings';
import { Card } from './Card';
import { ThemeSwitch } from './ThemeSwitch';

const MODES: { value: DisplayMode; label: string }[] = [
  { value: '3d', label: '3D scene' },
  { value: '2d', label: '2D mode' },
  { value: 'reduced', label: 'Reduced motion' },
];

type Props = { settings: Settings; onChange: (s: Settings) => void };

export function SettingsScreen({ settings, onChange }: Props) {
  const [engineVersion, setEngineVersion] = useState('checking…');
  useEffect(() => {
    engine
      .call('version')
      .then((r) => setEngineVersion(r.version))
      .catch((e) =>
        setEngineVersion(
          `unavailable: ${e instanceof Error ? e.message : String(e)}`,
        ),
      );
  }, []);
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4 p-8">
      <h1 className="text-xl font-semibold">Settings</h1>
      <Card className="flex flex-col gap-4">
        <h2 className="hud">Display</h2>
        <div className="flex items-center justify-between gap-4">
          <span>Theme</span>
          <ThemeSwitch
            value={settings.theme}
            onChange={(theme) => onChange({ ...settings, theme })}
          />
        </div>
        <fieldset className="flex items-center justify-between gap-4">
          <legend className="sr-only">Scene</legend>
          <span aria-hidden>Scene</span>
          <div className="inline-flex rounded-sm border border-line">
            {MODES.map((m) => (
              <label
                key={m.value}
                className={`min-h-8 cursor-pointer px-3 leading-8 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-scope ${settings.display === m.value ? 'bg-bg-3 text-text-1' : 'text-text-2'}`}
              >
                <input
                  type="radio"
                  name="display"
                  className="sr-only"
                  checked={settings.display === m.value}
                  onChange={() => onChange({ ...settings, display: m.value })}
                />
                {m.label}
              </label>
            ))}
          </div>
        </fieldset>
      </Card>
      <Card className="flex flex-col gap-4">
        <h2 className="hud">About</h2>
        <div className="flex items-center justify-between gap-4">
          <span>Engine version</span>
          <span data-testid="engine-version" className="font-mono">
            {engineVersion}
          </span>
        </div>
      </Card>
    </div>
  );
}
