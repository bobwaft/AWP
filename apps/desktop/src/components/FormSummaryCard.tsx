import type { ChatMessage } from '@awp/protocol';
import { Button } from './Button';
import { Card } from './Card';

const show = (v: unknown): string =>
  Array.isArray(v)
    ? v
        .map((x) =>
          typeof x === 'object' && x ? Object.values(x).join(' ') : String(x),
        )
        .join('; ')
    : String(v ?? '');

export function FormSummaryCard({
  form,
  onEdit,
}: {
  form: NonNullable<ChatMessage['form']>;
  onEdit?: () => void;
}) {
  const entries = Object.entries(form.values)
    .filter(([, v]) => v !== '' && v !== undefined)
    .slice(0, 5);
  return (
    <Card
      className="flex flex-col gap-1"
      aria-label={`${form.title} (submitted)`}
    >
      <div className="flex items-center">
        <span className="hud">{form.title}</span>
        {onEdit && (
          <Button variant="ghost" className="ml-auto" onClick={onEdit}>
            Edit
          </Button>
        )}
      </div>
      <dl className="text-sm">
        {entries.map(([k, v]) => (
          <div key={k} className="flex gap-2">
            <dt className="text-text-3">{k}</dt>
            <dd className="truncate">{show(v)}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}
