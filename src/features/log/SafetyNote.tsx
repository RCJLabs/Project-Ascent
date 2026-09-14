import { AlertTriangle } from 'lucide-react';
import type { Protocol } from '@/content/types';
import type { BodyPart } from '@/content/warmups';
import { protocolSafety } from '@/engine/bodyLoad';

/**
 * What the protocol's author wrote about not getting hurt (PLAN.md M153).
 *
 * `Protocol.safety` carries seven rules across five protocols — *"Never
 * campus with any existing finger or elbow symptom"*, *"Skip entirely with
 * any elbow symptom"*, *"Warm up thoroughly: never load near-max fingers
 * cold"* — and until this nothing read the field. The logger is where it
 * belongs, because it is the screen open while the climber is deciding
 * whether to pull on.
 *
 * **Every rule, not the worst one.** The house pattern on an exercise row is
 * *one warning a line*: an injury outranks a check-in, a spike outranks a
 * plateau, and showing both makes the first mean less. That rule is right
 * for advice and wrong here. Three of the seven name no body part at all, so
 * no injury path reaches them and no ranking would ever bring them up; and a
 * safety rule folded behind a tap is not a safety rule.
 *
 * **Once per block, not once per line.** The first build put this under
 * every exercise that named a protocol, which Iron Grip's Spark phase turns
 * into nine warning lines in a row: three campus exercises, each repeating
 * the same three campus rules. A safety rule belongs to the **method**, and
 * all three of those lines are the same method — so it is said once, above
 * the lines it governs, with the method named.
 *
 * **The urgent ones lead.** A rule naming a part the climber has already
 * told the app about is the author speaking to *them*, and it is the one
 * that was most completely hidden.
 */
export function SafetyNote({
  protocol,
  injured,
}: {
  protocol: (Pick<Protocol, 'safety'> & { name?: string }) | undefined;
  injured: readonly BodyPart[];
}) {
  const { urgent, standing } = protocolSafety(protocol, injured);
  if (urgent.length === 0 && standing.length === 0) return null;
  return (
    <div className="mb-2 rounded-lg border border-warn/30 bg-warn/5 px-2.5 py-2">
      <p className="text-2xs font-bold uppercase tracking-wide text-warn flex items-center gap-1.5">
        <AlertTriangle size={12} className="shrink-0" />
        {protocol?.name === undefined ? 'Safety' : `${protocol.name} — safety`}
      </p>
      <ul className="grid grid-cols-1 gap-1 mt-1">
        {[...urgent, ...standing].map((rule, i) => (
          <li key={rule} className="text-warn text-xs leading-relaxed">
            <span className={i < urgent.length ? 'font-semibold' : ''}>{rule}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * The protocols named inside a block, once each, in the order they appear.
 *
 * A Map keyed by the protocol id is the whole of the deduplication — an
 * `if (seen.has(id)) continue;` beside it survived every mutation, because
 * a second `set` on the same key changes nothing. It saved one registry
 * lookup and said nothing about the behaviour, so it is gone.
 */
export function protocolsIn(
  exercises: readonly { protocolId?: string | undefined }[],
  lookup: (id: string) => Protocol | undefined,
): Protocol[] {
  const seen = new Map<string, Protocol>();
  for (const exercise of exercises) {
    const id = exercise.protocolId;
    if (id === undefined) continue;
    const protocol = lookup(id);
    if (protocol) seen.set(id, protocol);
  }
  return [...seen.values()];
}

/**
 * Whether an authored rule already speaks to this climber's injury.
 *
 * The derived flag beside an exercise — *"Loads your elbow — one-arm work
 * doubles the load through a single side"* — is a keyword scan, and
 * `bodyLoad.ts` says so in its own header: advisory, over-flags, never
 * blocking. Where the program's author has written a rule about the same
 * injury, that rule is the stronger statement and the scan's guess is noise
 * under it.
 */
export function hasAuthoredWarning(
  protocol: Pick<Protocol, 'safety'> | undefined,
  injured: readonly BodyPart[],
): boolean {
  return protocolSafety(protocol, injured).urgent.length > 0;
}
