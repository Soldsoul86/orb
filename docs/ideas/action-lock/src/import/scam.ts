// Flags likely scam messages found while importing. Pure; deliberately simple.
//
// Banks and businesses in India must send from registered sender IDs
// ("JM-AUBANK-S"). A message about money, loans, prizes or KYC that comes
// from an ordinary mobile number and carries a link is almost always a scam.
// The scam types behind these rules are in docs/ideas/scam-checker.

import type { Sms } from './types.ts';

const PERSONAL_NUMBER = /^\+?\d[\d ]{9,14}$/;
const LINK = /\bhttps?:\/\/\S+|\b(?:[a-z0-9-]+\.)+(?:in|com|ly|me|link|xyz|top|co|info|site|online|app)\/\S*/i;
const BAIT =
  /\b(loan|credited|can be credited|pre-?approved|prize|won|winner|lottery|lucky|kyc|blocked|suspended|refund|reward|cashback|job|work from home|earn|income|part[- ]time|electricity|disconnect|pan\b|aadhaa?r|update your|verify|yojana|scheme)\b/i;

export interface ScamFlag {
  readonly reason: string;
}

export function looksLikeScam(sms: Sms): ScamFlag | null {
  if (!PERSONAL_NUMBER.test(sms.address.trim())) return null;
  const bait = sms.body.match(BAIT)?.[1];
  if (bait === undefined || !LINK.test(sms.body)) return null;
  return { reason: `from a personal number, about "${bait.toLowerCase()}", with a link` };
}
