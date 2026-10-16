import type { FormField } from './spec';

const empty = (v: unknown) =>
  v === undefined ||
  v === null ||
  v === '' ||
  (Array.isArray(v) && v.length === 0);

/** Returns `{ fieldPath: message }`; empty object means valid. "Not sure" fields skip the required check. */
export function validateValues(
  fields: FormField[],
  values: Record<string, unknown>,
  unsure: string[] = [],
  prefix = '',
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of fields) {
    const key = `${prefix}${f.id}`;
    const v = values[f.id];
    if (empty(v)) {
      if (f.required && !unsure.includes(key)) errors[key] = 'Required';
      continue;
    }
    switch (f.type) {
      case 'number': {
        const n = typeof v === 'number' ? v : Number(v);
        if (Number.isNaN(n)) errors[key] = 'Enter a number';
        else if (f.min !== undefined && n < f.min)
          errors[key] = `At least ${f.min}`;
        else if (f.max !== undefined && n > f.max)
          errors[key] = `At most ${f.max}`;
        break;
      }
      case 'boolean':
        if (typeof v !== 'boolean') errors[key] = 'Must be yes or no';
        break;
      case 'select':
        if (f.options && !f.options.some((o) => o.value === v))
          errors[key] = 'Pick one of the options';
        break;
      case 'multiselect':
        if (
          !Array.isArray(v) ||
          (f.options && v.some((x) => !f.options?.some((o) => o.value === x)))
        )
          errors[key] = 'Pick from the options';
        break;
      case 'url':
        try {
          new URL(String(v));
        } catch {
          errors[key] = 'Enter a full URL';
        }
        break;
      case 'list':
        if (!Array.isArray(v)) errors[key] = 'Must be a list';
        else
          for (const [i, row] of v.entries())
            Object.assign(
              errors,
              validateValues(
                f.fields ?? [],
                (row ?? {}) as Record<string, unknown>,
                [],
                `${key}.${i}.`,
              ),
            );
        break;
      default: {
        const s = String(v);
        if (f.pattern && !new RegExp(f.pattern).test(s))
          errors[key] = 'Wrong format';
        else if (f.max !== undefined && s.length > f.max)
          errors[key] = `At most ${f.max} characters`;
        else if (f.min !== undefined && s.length < f.min)
          errors[key] = `At least ${f.min} characters`;
      }
    }
  }
  return errors;
}
