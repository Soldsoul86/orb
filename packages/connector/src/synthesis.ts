/**
 * DR-7 tier 2: what was made of a fetch, recorded as an Observation.
 *
 * *"The synthesis is an Observation, never a Fact."* It carries
 * `confidencePercent` and cites the **call event** in `causes`, so a reader can
 * always get from a conclusion back to the moment Orb asked for something.
 *
 * The synthesis itself — what a parser or a model made of the items — is the
 * caller's. This is the plumbing around it: keep the raw bytes as Attachments,
 * cite them by identity, and cite the call.
 *
 * **Why the call and not the content.** After the raw is released, the
 * Observation still cites the call event, whose envelope is permanent. So the
 * lineage walk never breaks: it resolves end to end and reports that the content
 * was released on a stated policy — which is a different fact from evidence that
 * never existed.
 */
import type { AttachmentPorts, Journal, OrbEvent } from "@orb/journal";
import { putAttachment } from "@orb/journal";
import { observationDraft, type Observation } from "@orb/observation";
import type { CallOutcome } from "./call.js";

export interface Synthesis<Data> {
  /** inv. 3 — what produced this reading. A connector names itself. */
  readonly source: string;
  /** inv. 7 — the Confidence of Reality, 0–100. */
  readonly confidencePercent: number;
  /** What was made of the fetch. Never the fetched bytes themselves (inv. 5). */
  readonly data: Data;
  /** The raw bytes to keep, if any. Each becomes an Attachment. */
  readonly raw?: readonly Buffer[];
}

export interface SynthesisRecord<Data> {
  readonly event: OrbEvent<Observation<Data>>;
  /** Identities of the Attachments the Observation cites. */
  readonly attachments: readonly string[];
}

/**
 * Stores the raw, records the Observation, and ties both to the call.
 *
 * Order matters: the Attachments go first, so the Observation never cites an
 * identity that is not yet resolvable. An Observation pointing at nothing would
 * be indistinguishable from one whose content had been released, and those are
 * different facts.
 */
export async function recordSynthesis<Data>(
  journal: Journal,
  ports: AttachmentPorts,
  call: CallOutcome<unknown>,
  synthesis: Synthesis<Data>,
): Promise<SynthesisRecord<Data>> {
  const attachments: string[] = [];
  for (const bytes of synthesis.raw ?? []) {
    attachments.push(await putAttachment(ports, bytes));
  }

  const observation: Observation<Data> = {
    source: synthesis.source,
    confidencePercent: synthesis.confidencePercent,
    data: synthesis.data,
    ...(attachments.length === 0 ? {} : { attachments }),
  };

  const event = await journal.appendOne(observationDraft(observation, [call.eventId]));
  return { event: event as OrbEvent<Observation<Data>>, attachments };
}
