import type { Theme } from '@awp/protocol';
import { themePreviewHtml } from '../lib/themePreview';
import { Button } from './Button';
import { Card } from './Card';
import { Chip } from './Chip';

export function ThemeCard({
  theme,
  picked,
  onPick,
}: {
  theme: Theme;
  picked: boolean;
  onPick: () => void;
}) {
  const c = theme.tokens.colors;
  return (
    <Card className="flex flex-col gap-2" aria-label={`Theme ${theme.name}`}>
      <div className="flex items-center gap-2">
        <h3 className="font-medium">{theme.name}</h3>
        {picked && <Chip tone="success">Picked</Chip>}
      </div>
      <p className="text-sm text-text-2">{theme.description}</p>
      <div className="flex gap-1" aria-hidden>
        {(
          [
            'bg',
            'surface',
            'text',
            'accent',
            'success',
            'warning',
            'danger',
          ] as const
        ).map((k) => (
          <span
            key={k}
            className="h-5 w-5 rounded-sm border border-line"
            style={{ background: c[k] }}
          />
        ))}
      </div>
      <p className="text-sm" style={{ fontFamily: theme.tokens.fonts.sans }}>
        Aa — {theme.tokens.fonts.sans.split(',')[0]} /{' '}
        <span style={{ fontFamily: theme.tokens.fonts.mono }}>
          {theme.tokens.fonts.mono.split(',')[0]}
        </span>
      </p>
      <iframe
        title={`${theme.name} preview`}
        sandbox=""
        srcDoc={themePreviewHtml(theme.tokens)}
        className="h-64 w-full rounded-sm border border-line"
      />
      <Button variant={picked ? 'secondary' : 'primary'} onClick={onPick}>
        {picked ? 'Pick again' : 'Pick this theme'}
      </Button>
    </Card>
  );
}
