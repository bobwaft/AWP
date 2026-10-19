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
