import { FORM_TEMPLATES } from '@awp/prompts';
import {
  type FormField,
  FormField as FormFieldSchema,
  type FormRequest,
} from '@awp/protocol';
import { EngineError } from '../errors';

/** Expands a request into concrete, validated fields. Anything outside the field subset is rejected. */
export function resolveFields(req: FormRequest): FormField[] {
  let raw: unknown[];
  if (req.templateId) {
    const t = FORM_TEMPLATES[req.templateId];
    if (!t)
      throw new EngineError(
        'FORM_TEMPLATE_UNKNOWN',
        `No template "${req.templateId}" in this phase`,
      );
    raw = t.fields;
  } else raw = req.fields ?? [];
  const parsed = raw.map((f) => FormFieldSchema.safeParse(f));
  const bad = parsed.find((p) => !p.success);
  if (bad && !bad.success)
    throw new EngineError(
      'FORM_SCHEMA_INVALID',
      `Invalid form field: ${bad.error.issues[0]?.message}`,
    );
  return parsed.flatMap((p) => (p.success ? [p.data] : []));
}
