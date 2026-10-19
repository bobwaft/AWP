import {
  contrastRatio,
  type FormField,
  type FormRequested,
  type FormValues,
  validateValues,
} from '@awp/protocol';
import { useEffect, useRef, useState } from 'react';
import { Button } from './Button';

const FONTS = [
  'Geist, system-ui, sans-serif',
  'Inter, system-ui, sans-serif',
  'system-ui, sans-serif',
  'Georgia, serif',
  "'IBM Plex Sans', system-ui, sans-serif",
  "'Geist Mono', ui-monospace, monospace",
  'ui-monospace, monospace',
  "'JetBrains Mono', ui-monospace, monospace",
  "'Fira Code', ui-monospace, monospace",
];

// Which color each color field is read against (text vs bg, text-on-accent vs accent, ...).
const AGAINST: Record<string, [string, number]> = {
  color_text: ['color_bg', 4.5],
  color_text_muted: ['color_bg', 4.5],
  color_on_accent: ['color_accent', 4.5],
  color_accent: ['color_bg', 3],
};

const HEX = /^#[0-9a-f]{6}$/i;

function Readout({ id, values }: { id: string; values: FormValues }) {
  const rule = AGAINST[id];
  const a = values[id];
  const b = rule && values[rule[0]];
  if (
    !rule ||
    typeof a !== 'string' ||
    typeof b !== 'string' ||
    !HEX.test(a) ||
    !HEX.test(b)
  )
    return null;
  const r = contrastRatio(a, b);
  const ok = r >= rule[1];
  return (
    <p className={`text-xs ${ok ? 'text-success' : 'text-danger'}`}>
      Contrast {r.toFixed(1)}:1{' '}
      {ok ? `(meets ${rule[1]}:1)` : `(needs ${rule[1]}:1)`}
    </p>
  );
}

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
      if (f.min !== undefined && f.max !== undefined)
        return (
          <div className="flex items-center gap-2">
            <input
              id={id}
              type="range"
              min={f.min}
              max={f.max}
              value={Number(value ?? f.min)}
              onChange={(e) => onChange(Number(e.target.value))}
              className="flex-1"
            />
            <output className="w-8 font-mono text-sm">
              {String(value ?? f.min)}
            </output>
          </div>
        );
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
    case 'font': {
      const cur = String(value ?? '');
      const opts = !cur || FONTS.includes(cur) ? FONTS : [cur, ...FONTS];
      return (
        <div className="flex flex-col gap-1">
          <select
            id={id}
            className={inputCls}
            value={cur}
            onChange={(e) => onChange(e.target.value)}
          >
            {opts.map((o) => (
              <option key={o} value={o}>
                {o.split(',')[0].replace(/'/g, '')}
              </option>
            ))}
          </select>
          <span className="text-sm" style={{ fontFamily: cur }}>
            Aa The quick brown fox 0123
          </span>
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

type ChipState = 'empty' | 'filled' | 'unsure' | 'error';
const CHIP_MARK: Record<ChipState, string> = {
  empty: '',
  filled: '✓',
  unsure: '?',
  error: '!',
};
const CHIP_TEXT: Record<ChipState, string> = {
  empty: 'empty',
  filled: 'filled',
  unsure: 'not sure',
  error: 'has an error',
};

const isFilled = (v: unknown) =>
  Array.isArray(v)
    ? v.length > 0
    : typeof v === 'string'
      ? v.trim() !== ''
      : v !== undefined && v !== null;

const shortLabel = (l: string) => (l.length > 14 ? `${l.slice(0, 13)}…` : l);

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
  const [step, setStep] = useState(0);
  const [focusReq, setFocusReq] = useState(0);
  const root = useRef<HTMLFormElement>(null);
  const first = useRef(true);
  const last = step >= form.fields.length - 1;

  // Drafts are saved shortly after the user stops typing.
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const t = setTimeout(() => onDraft?.(values), 600);
    return () => clearTimeout(t);
  }, [values, onDraft]);

  // After a validation jump, focus the failing step's control once it has rendered.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on focusReq only
  useEffect(() => {
    if (focusReq === 0) return;
    root.current
      ?.querySelector<HTMLElement>(
        '[data-field] input, [data-field] select, [data-field] textarea',
      )
      ?.focus();
  }, [focusReq]);

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
      const at = form.fields.findIndex((f) => f.id === firstErr.split('.')[0]);
      if (at >= 0) setStep(at);
      setFocusReq((n) => n + 1);
      return;
    }
    await onSubmit(values, [...unsure]);
  };

  const chipState = (f: FormField): ChipState =>
    Object.keys(errors).some((k) => k === f.id || k.startsWith(`${f.id}.`))
      ? 'error'
      : unsure.has(f.id)
        ? 'unsure'
        : isFilled(values[f.id])
          ? 'filled'
          : 'empty';

  const f = form.fields[step];
  const id = f ? `ff-${f.id}` : '';
  const aiMarked = f && form.aiFilled.includes(f.id) && !touched.has(f.id);
  return (
    <form
      ref={root}
      aria-label={form.title}
      className="flex max-h-full flex-col gap-3 overflow-auto rounded-md border border-line bg-bg-1 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        if (last) void submit();
        else setStep((n) => n + 1);
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
      <ol aria-label="Form steps" className="flex flex-wrap gap-1">
        {form.fields.map((c, i) => {
          const st = chipState(c);
          return (
            <li key={c.id}>
              <button
                type="button"
                title={c.label}
                aria-label={`${i + 1}. ${c.label}, ${CHIP_TEXT[st]}`}
                aria-current={i === step ? 'step' : undefined}
                onClick={() => setStep(i)}
                className={`rounded-sm border px-2 py-0.5 text-xs ${i === step ? 'border-line-strong bg-bg-3 text-text-1' : 'border-line text-text-2'} ${st === 'error' ? 'text-danger' : ''}`}
              >
                {i + 1} {shortLabel(c.label)}
                {CHIP_MARK[st] && ` ${CHIP_MARK[st]}`}
              </button>
            </li>
          );
        })}
      </ol>
      {f && (
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
          {f.type === 'color' && <Readout id={f.id} values={values} />}
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
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button disabled={step === 0} onClick={() => setStep((n) => n - 1)}>
          Back
        </Button>
        {last ? (
          // Distinct keys: one DOM button must never flip from Next to Submit mid-click.
          <Button key="submit" type="submit" variant="primary">
            {submitLabel}
          </Button>
        ) : (
          <Button
            key="next"
            variant="primary"
            onClick={() => setStep((n) => n + 1)}
          >
            Next
          </Button>
        )}
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
