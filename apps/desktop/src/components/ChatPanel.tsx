import { FORM_TEMPLATES } from '@awp/prompts';
import type { FormField, FormValues, SpecSnapshot } from '@awp/protocol';
import { open as pickFiles } from '@tauri-apps/plugin-dialog';
import { useEffect, useRef, useState } from 'react';
import type { useSpec } from '../lib/spec';
import { Button } from './Button';
import { Chip } from './Chip';
import { FormCard } from './FormCard';
import { FormSummaryCard } from './FormSummaryCard';

type Spec = ReturnType<typeof useSpec>;
const PHASE = {
  themer: 'Designing themes…',
  interviewer: 'AWP is thinking…',
  synthesizer: 'Updating the document…',
  critic: 'Reviewing…',
};

type Props = {
  spec: Spec;
  snap: SpecSnapshot;
  draft: string;
  onDraft: (s: string) => void;
};

export function ChatPanel({ spec, snap, draft, onDraft }: Props) {
  const [attachments, setAttachments] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<{
    title: string;
    fields: FormField[];
    values: FormValues;
  } | null>(null);
  const [inChat, setInChat] = useState<string | null>(null); // form id the user chose to answer in chat
  const log = useRef<HTMLDivElement>(null);
  const { question, form, permission } = snap.pending;

  const count = snap.chat.length;
  useEffect(() => {
    if (count < 0) return;
    log.current?.scrollTo?.({ top: log.current.scrollHeight });
  }, [count]);

  const send = async (text: string) => {
    if (!text.trim() || snap.busy) return;
    setError('');
    try {
      if (question) await spec.answer(question.questionId, text.trim());
      else await spec.send(text.trim(), attachments);
      onDraft('');
      setAttachments([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const showForm = form && inChat !== form.formId;
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div
        ref={log}
        role="log"
        aria-live="polite"
        className="flex flex-1 flex-col gap-3 overflow-auto p-4"
      >
        {snap.chat.length === 0 && (
          <p className="text-text-2">
            Describe the app you want to build. AWP will ask what it needs to
            know.
          </p>
        )}
        {snap.chat.map((m) =>
          m.role === 'form' && m.form ? (
            <FormSummaryCard
              key={m.id}
              form={m.form}
              onEdit={
                m.form.templateId && FORM_TEMPLATES[m.form.templateId]
                  ? () => {
                      const t = FORM_TEMPLATES[m.form?.templateId ?? ''];
                      setEditing({
                        title: m.form?.title ?? t.title,
                        fields: t.fields as FormField[],
                        values: m.form?.values ?? {},
                      });
                    }
                  : undefined
              }
            />
          ) : (
            <p
              key={m.id}
              className={
                m.role === 'user'
                  ? 'self-end rounded-md bg-bg-3 px-3 py-2'
                  : 'whitespace-pre-wrap'
              }
            >
              {m.text}
            </p>
          ),
        )}
        {snap.busy && (
          <p className="hud" aria-live="polite">
            {PHASE[snap.busy]}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-line p-3">
        {permission && (
          <div
            role="alert"
            className="flex flex-col gap-2 rounded-md border border-warning p-3"
          >
            <p>
              The agent wants to use <b>{permission.tool}</b>.
            </p>
            <pre className="max-h-24 overflow-auto font-mono text-xs">
              {JSON.stringify(permission.input, null, 2)}
            </pre>
            <div className="flex gap-2">
              <Button
                variant="primary"
                onClick={() => spec.decide(permission.requestId, true)}
              >
                Allow
              </Button>
              <Button onClick={() => spec.decide(permission.requestId, false)}>
                Deny
              </Button>
            </div>
          </div>
        )}
        {editing && (
          <FormCard
            form={{
              title: editing.title,
              fields: editing.fields,
              prefill: editing.values,
              aiFilled: [],
              orphaned: false,
            }}
            submitLabel="Save changes"
            onDecline={() => setEditing(null)}
            onSubmit={async (values) => {
              await spec.send(
                `Form updated (${editing.title}): ${JSON.stringify(values)}`,
              );
              setEditing(null);
            }}
          />
        )}
        {showForm && !editing && (
          <FormCard
            key={form.formId}
            form={form}
            onSubmit={async (values, unsure) => {
              try {
                await spec.submitForm(form.formId, values, unsure);
              } catch (e) {
                setError(e instanceof Error ? e.message : String(e));
              }
            }}
            onDecline={() => {
              setInChat(form.formId);
              void spec.declineForm(form.formId);
            }}
            onAsk={(text, d) => void spec.askAboutForm(form.formId, text, d)}
            onDraft={(v) => void spec.saveDraft(form.formId, v)}
          />
        )}
        {question && (
          <div className="flex flex-col gap-2">
            <p className="font-medium">{question.text}</p>
            {question.choices && (
              <div className="flex flex-wrap gap-2">
                {question.choices.map((c) => (
                  <button key={c} type="button" onClick={() => send(c)}>
                    <Chip tone="accent">{c}</Chip>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {!showForm && !editing && (
          <div className="flex flex-col gap-2">
            {attachments.length > 0 && (
              <p className="text-xs text-text-2">
                Attached: {attachments.join(', ')}
              </p>
            )}
            <textarea
              aria-label="Message"
              rows={3}
              className="w-full rounded-sm border border-line bg-bg-2 p-2 text-text-1 focus:border-line-strong"
              placeholder={question ? 'Type your own answer…' : 'Message AWP…'}
              value={draft}
              disabled={!!snap.busy && !question}
              onChange={(e) => onDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  void send(draft);
                }
              }}
            />
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                onClick={async () => {
                  const picked = await pickFiles({ multiple: true }).catch(
                    () => null,
                  );
                  if (Array.isArray(picked)) setAttachments(picked);
                  else if (typeof picked === 'string') setAttachments([picked]);
                }}
              >
                Attach
              </Button>
              <Button
                variant="primary"
                className="ml-auto"
                disabled={!draft.trim() || (!!snap.busy && !question)}
                onClick={() => send(draft)}
              >
                Send
              </Button>
            </div>
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
