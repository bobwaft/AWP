import type { FormValues, SpecSnapshot, StageId } from '@awp/protocol';
import { useCallback, useEffect, useState } from 'react';
import { engine } from './engine';

/** Live view of one spec stage: the engine owns the state, this mirrors its snapshots. */
export function useSpec(stage: StageId) {
  const [snap, setSnap] = useState<SpecSnapshot | null>(null);

  const load = useCallback(async () => {
    try {
      setSnap(await engine.call('spec.get', { stage }));
    } catch {
      setSnap(null);
    }
  }, [stage]);

  useEffect(() => {
    void load();
    return engine.on((e) => {
      if (
        e.method === 'spec.state' &&
        (e.params as SpecSnapshot).stage === stage
      )
        setSnap(e.params as SpecSnapshot);
    });
  }, [stage, load]);

  return {
    snap,
    send: (text: string, attachments?: string[]) =>
      engine.call('chat.send', { stage, text, attachments }),
    answer: (questionId: string, answer: string) =>
      engine.call('question.answer', { questionId, answer }),
    submitForm: (formId: string, values: FormValues, unsure: string[]) =>
      engine.call('form.submit', { formId, values, unsure }),
    declineForm: (formId: string) => engine.call('form.decline', { formId }),
    saveDraft: (formId: string, values: FormValues) =>
      engine.call('form.saveDraft', { formId, values }),
    askAboutForm: (formId: string, text: string, draft: FormValues) =>
      engine.call('form.ask', { formId, text, draft }),
    decide: (requestId: string, allow: boolean) =>
      engine.call('permission.decide', { requestId, allow }),
    complete: (overrideReason?: string) =>
      engine.call('stage.complete', { stage, overrideReason }),
  };
}
