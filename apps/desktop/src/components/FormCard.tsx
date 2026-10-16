import {
  type FormField,
  type FormRequested,
  type FormValues,
  validateValues,
} from '@awp/protocol';
import { useEffect, useRef, useState } from 'react';
import { Button } from './Button';

type Props = {
  form: Pick<
    FormRequested,
    'title' | 'fields' | 'prefill' | 'aiFilled' | 'orphaned'
  >;
  onSubmit: (values: FormValues, unsure: string[]) => Promise<void> | void;
  onDecline?: () => void;
  onAsk?: (text: string, draft: FormValues) => void;
  onDraft?: (values: FormValues) => void;
  submitLabel?: string;
};

const inputCls =
  'min-h-8 w-full rounded-sm border border-line bg-bg-2 px-3 text-text-1 focus:border-line-strong';

function Control({
  f,
  value,
  onChange,
  id,
}: {
  f: FormField;
  value: unknown;
  onChange: (v: unknown) => void;
  id: string;
}) {
  switch (f.type) {
    case 'longtext':
      return (
        <textarea
          id={id}
          rows={3}
          className={inputCls}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'number':
      return (
        <input
          id={id}
          type="number"
          min={f.min}
          max={f.max}
          className={inputCls}
          value={String(value ?? '')}
          onChange={(e) =>
            onChange(e.target.value === '' ? '' : Number(e.target.value))
          }
        />
      );
    case 'boolean':
      return (
        <input
          id={id}
          type="checkbox"
          checked={value === true}
          onChange={(e) => onChange(e.target.checked)}
        />
      );
    case 'select':
      return (
        <select
          id={id}
          className={inputCls}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Choose…</option>
          {f.options?.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    case 'multiselect': {
      const cur = Array.isArray(value) ? (value as string[]) : [];
      return (
        <div id={id} className="flex flex-wrap gap-3">
          {f.options?.map((o) => (
            <label key={o.value} className="flex items-center gap-1">
              <input
                type="checkbox"
                checked={cur.includes(o.value)}
                onChange={(e) =>
                  onChange(
                    e.target.checked
                      ? [...cur, o.value]
                      : cur.filter((x) => x !== o.value),
                  )
                }
              />
              {o.label}
            </label>
          ))}
        </div>
      );
    }
    case 'color':
      return (
        <input
          id={id}
          type="color"
          value={String(value || '#000000')}
          onChange={(e) => onChange(e.target.value)}
        />
      );
    case 'list': {
      const rows = Array.isArray(value)
        ? (value as Record<string, unknown>[])
        : [];
      return (
        <div id={id} className="flex flex-col gap-2">
          {rows.map((row, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: rows have no stable id
            <div key={i} className="flex items-center gap-2">
              {f.fields?.map((sf) => (
                <input
                  key={sf.id}
                  aria-label={`${sf.label} ${i + 1}`}
                  className={inputCls}
                  value={String(row[sf.id] ?? '')}
                  onChange={(e) =>
                    onChange(
                      rows.map((r, j) =>
                        j === i ? { ...r, [sf.id]: e.target.value } : r,
                      ),
                    )
                  }
                />
              ))}
              <Button
                variant="ghost"
                aria-label={`Remove ${f.label} ${i + 1}`}
                onClick={() => onChange(rows.filter((_, j) => j !== i))}
              >
                ×
              </Button>
            </div>
          ))}
          <Button
            variant="ghost"
            className="self-start"
            onClick={() => onChange([...rows, {}])}
          >
            Add {f.label.toLowerCase()}
          </Button>
        </div>
      );
    }
    default:
      // text, url, font, file: a text input (file/font pickers arrive with the Design stage)
      return (
        <input
          id={id}
          type={f.type === 'url' ? 'url' : 'text'}
          className={inputCls}
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

export function FormCard({
  form,
  onSubmit,
  onDecline,
  onAsk,
  onDraft,
  submitLabel = 'Submit',
}: Props) {
  const [values, setValues] = useState<FormValues>(form.prefill ?? {});
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [unsure, setUnsure] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [ask, setAsk] = useState('');
  const root = useRef<HTMLFormElement>(null);
  const first = useRef(true);

  // Drafts are saved shortly after the user stops typing.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => onDraft?.(values), 600);
    return () => clearTimeout(t);
  }, [values, onDraft]);

  const set = (id: string, v: unknown) => {
    setValues((cur) => ({ ...cur, [id]: v }));
    setTouched((t) => new Set(t).add(id));
    setUnsure((u) => (u.has(id) ? new Set([...u].filter((x) => x !== id)) : u));
  };

  const submit = async () => {
    const errs = validateValues(form.fields, values, [...unsure]);
    setErrors(errs);
    const firstErr = Object.keys(errs)[0];
    if (firstErr) {
      root.current
        ?.querySelector<HTMLElement>(
          `[data-field="${firstErr.split('.')[0]}"] input, [data-field="${firstErr.split('.')[0]}"] select, [data-field="${firstErr.split('.')[0]}"] textarea`,
        )
        ?.focus();
      return;
    }
    await onSubmit(values, [...unsure]);
  };

  return (
    <form
      ref={root}
      aria-label={form.title}
      className="flex max-h-[60vh] flex-col gap-3 overflow-auto rounded-md border border-line bg-bg-1 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          void submit();
        }
      }}
    >
      <p className="hud">FORM · {form.title.toUpperCase()}</p>
      {form.orphaned && (
        <p className="text-sm text-warning">
          Continue this form. The last run ended before you submitted.
        </p>
      )}
      {form.fields.map((f) => {
        const id = `ff-${f.id}`;
        const aiMarked = form.aiFilled.includes(f.id) && !touched.has(f.id);
        return (
          <div key={f.id} data-field={f.id} className="flex flex-col gap-1">
            <label htmlFor={id} className="text-sm text-text-2">
              {f.label}{' '}
              {f.required ? <span>(required)</span> : <span>(optional)</span>}
              {aiMarked && (
                <span className="ml-2 text-xs text-accent">
                  from your earlier answer
                </span>
              )}
            </label>
            <Control
              f={f}
              id={id}
              value={values[f.id]}
              onChange={(v) => set(f.id, v)}
            />
            {f.help && <p className="text-xs text-text-3">{f.help}</p>}
            {f.required && (
              <label className="flex items-center gap-1 text-xs text-text-2">
                <input
                  type="checkbox"
                  checked={unsure.has(f.id)}
                  onChange={(e) =>
                    setUnsure((u) =>
                      e.target.checked
                        ? new Set(u).add(f.id)
                        : new Set([...u].filter((x) => x !== f.id)),
                    )
                  }
                />
                Not sure, help me
              </label>
            )}
            {Object.entries(errors)
              .filter(([k]) => k === f.id || k.startsWith(`${f.id}.`))
              .map(([k, m]) => (
                <p key={k} role="alert" className="text-sm text-danger">
                  {m}
                </p>
              ))}
          </div>
        );
      })}
      <div className="flex items-center gap-2">
        <Button type="submit" variant="primary">
          {submitLabel}
        </Button>
        {onDecline && (
          <Button variant="ghost" onClick={onDecline}>
            Answer in chat instead
          </Button>
        )}
        <span className="ml-auto text-xs text-text-3">Ctrl+Enter submits</span>
      </div>
      {onAsk && (
        <div className="flex items-center gap-2">
          <input
            aria-label="Ask about this form"
            placeholder="Ask about this form"
            className={inputCls}
            value={ask}
            onChange={(e) => setAsk(e.target.value)}
          />
          <Button
            disabled={!ask.trim()}
            onClick={() => onAsk(ask.trim(), values)}
          >
            Ask
          </Button>
        </div>
      )}
    </form>
  );
}
