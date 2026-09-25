/**
 * What a v2 payload actually contains.
 *
 * Three things moved inside it, each for its own reason, and one was added:
 *
 * - **`type`, `schema` and `causes`**, from the envelope (`docs/ERASURE.md` §2b). The
 *   envelope now says only that an event happened, of a coarse kind, at a time.
 *   A witness holding envelopes learns nothing about the shape of the owner's
 *   reasoning, and **erasing a payload erases that event's stated lineage with
 *   it** — the operator's ruling, not a side effect.
 * - **`nonce`**, which is new. `payloadHash` commits to the plaintext and lives
 *   in the plaintext envelope, so a guessable payload is a **confirmation
 *   oracle**: hash `{"beat":1}`, `{"beat":2}`, … until one matches, and read a
 *   predictable event with no key at all. Random bytes inside the payload make
 *   the plaintext unguessable, and it is the only place they can go — entropy
 *   must reach whoever holds the payload and not whoever holds the envelope
 *   (`ERASURE.md` §2a).
 * - **`data`**, the caller's own payload, untouched.
 *
 * **Applied uniformly**, never only to low-entropy payloads: selective use
 * would make the *absence* of a nonce a signal that the payload was
 * high-entropy, and would be forgotten the first time somebody added an event
 * type.
 *
 * The journal wraps on append and unwraps on read, so callers, projections and
 * replay see exactly the payload they wrote. This is not a store decorator like
 * sealing, because the wrapping has to happen **before** the hash: `payloadHash`
 * must commit to the nonced form or the nonce buys nothing.
 */
import { randomBytes } from "node:crypto";
import type { SchemaRef } from "./types.js";

/** 128 bits. Enough that a payload's plaintext cannot be enumerated. */
const NONCE_BYTES = 16;

export interface WrappedPayload<Payload = unknown> {
  readonly causes: readonly string[];
  readonly data: Payload;
  readonly nonce: string;
  readonly schema: SchemaRef;
  /** The event's real type. The envelope carries only a coarse label. */
  readonly type: string;
}

export function newNonce(): string {
  return randomBytes(NONCE_BYTES).toString("hex");
}

export function wrapPayload<Payload>(input: {
  readonly data: Payload;
  readonly causes: readonly string[];
  readonly schema: SchemaRef;
  readonly type: string;
  /** Supplied only by tests that need a fixed value; never in production. */
  readonly nonce?: string;
}): WrappedPayload<Payload> {
  return {
    causes: input.causes,
    data: input.data,
    nonce: input.nonce ?? newNonce(),
    schema: input.schema,
    type: input.type,
  };
}

/**
 * Whether a value is a v2 wrapper rather than a caller's payload.
 *
 * Deliberately strict about all five fields. A caller's own payload that
 * happened to carry `data` and `nonce` would otherwise be unwrapped into
 * something it never was, and the check runs on every read.
 */
export function isWrapped(value: unknown): value is WrappedPayload {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<WrappedPayload>;
  return (
    typeof candidate.nonce === "string" &&
    Array.isArray(candidate.causes) &&
    typeof candidate.schema === "object" &&
    candidate.schema !== null &&
    typeof candidate.type === "string" &&
    "data" in candidate
  );
}

/** The caller's payload, or the value itself when it was never wrapped. */
export function unwrapPayload(value: unknown): unknown {
  return isWrapped(value) ? value.data : value;
}

/**
 * The exact plaintext `payloadHash` commits to, from an event in any form.
 *
 * Three forms reach verification and all three must give the same answer:
 *
 * - **stored v2** — the payload is already the wrapper; return it.
 * - **presented v2** — the payload was unwrapped for the reader and the wrapper
 *   is rebuilt from the fields presentation restored, plus `nonce`. The nonce is
 *   why it is carried: without it the wrapper is unreconstructible and a
 *   freshly-read event would fail verification against the hash computed when
 *   it was written.
 * - **v1** — no wrapper ever existed; the payload is the plaintext.
 *
 * A v2 event with neither a wrapper nor a nonce is not a case this can repair,
 * and it does not try: it returns the payload, verification fails, and the
 * caller is told its history does not match its commitments. That is the right
 * report — something did strip the wrapper.
 */
export function storedPayload(event: {
  readonly payload: unknown;
  readonly nonce?: string;
  readonly causes?: readonly string[];
  readonly schema: SchemaRef;
  readonly type: string;
}): unknown {
  if (isWrapped(event.payload)) return event.payload;
  if (event.nonce === undefined) return event.payload;
  return {
    causes: event.causes ?? [],
    data: event.payload,
    nonce: event.nonce,
    schema: event.schema,
    type: event.type,
  } satisfies WrappedPayload;
}
