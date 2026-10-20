import type { RegistryItem } from '@awp/protocol';

export type LicenseStatus = {
  /** ok: fine to suggest. review: the user must acknowledge. blocked: never suggested. */
  status: 'ok' | 'review' | 'blocked';
  note: string;
};

const PERMISSIVE =
  /^(MIT|Apache-2\.0|BSD-2-Clause|BSD-3-Clause|ISC|0BSD|Unlicense|CC0-1\.0|Zlib)\b/i;
const RESTRICTED =
  /(AGPL|GPL|LGPL|SSPL|BUSL|FSL|Commons Clause|source-available)/i;

/**
 * What a license check can do (REGISTRY.md policy): code that ends up in the user's product
 * (libraries) must be permissive, unless the owner reviewed that exact item; tools that only act
 * on the code may carry any license but unverified ones are shown for review. It cannot judge
 * custom wording, hosted terms or transitive dependencies (the Security stage covers those).
 */
export function licenseStatus(item: RegistryItem): LicenseStatus {
  const l = item.license.trim();
  if (item.kind === 'library') {
    if (item.verified) return { status: 'ok', note: `${l} (owner-reviewed)` };
    if (RESTRICTED.test(l))
      return {
        status: 'blocked',
        note: `${l} could bind the software you ship.`,
      };
    if (PERMISSIVE.test(l)) return { status: 'ok', note: l };
    return {
      status: 'review',
      note: `Unrecognised license "${l}". Check it before using.`,
    };
  }
  if (item.verified) return { status: 'ok', note: l };
  if (/^unknown$/i.test(l) || !l)
    return {
      status: 'review',
      note: 'License not checked. Read the LICENSE file before installing.',
    };
  return { status: 'review', note: `${l}. Not reviewed by AWP.` };
}

/** Names a license from the start of its text; "unknown" when it is not one AWP recognises. */
export function detectLicense(text: string): string {
  const t = text.slice(0, 4000);
  if (/GNU AFFERO GENERAL PUBLIC LICENSE/i.test(t)) return 'AGPL-3.0';
  if (/GNU LESSER GENERAL PUBLIC LICENSE/i.test(t)) return 'LGPL-3.0';
  if (/GNU GENERAL PUBLIC LICENSE/i.test(t))
    return /Version 2/i.test(t) ? 'GPL-2.0' : 'GPL-3.0';
  if (/Mozilla Public License/i.test(t)) return 'MPL-2.0';
  if (/Apache License/i.test(t) && /Version 2\.0/i.test(t)) return 'Apache-2.0';
  if (
    /\bMIT License\b/i.test(t) ||
    /Permission is hereby granted, free of charge/i.test(t)
  )
    return 'MIT';
  if (
    /\bISC License\b/i.test(t) ||
    /Permission to use, copy, modify, and\/or distribute this software/i.test(t)
  )
    return 'ISC';
  if (/free and unencumbered software released into the public domain/i.test(t))
    return 'Unlicense';
  if (/Redistribution and use in source and binary forms/i.test(t))
    return /Neither the name/i.test(t) ? 'BSD-3-Clause' : 'BSD-2-Clause';
  return 'unknown';
}
