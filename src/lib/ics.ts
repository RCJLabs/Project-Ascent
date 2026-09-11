/**
 * Writing iCalendar (PLAN.md M75).
 *
 * M75 was going to be local notifications. It is not, because nothing in a
 * PWA can be running at the moment a reminder is due: **Notification
 * Triggers** — the one web API that ever took a future timestamp — never
 * shipped past an origin trial; **Web Push** works and needs a push server,
 * which is the one thing this rebuild exists to not have; and a service
 * worker is spun up for an event and killed, so a `setTimeout` for tomorrow
 * evening dies in seconds. The TWA wrapper does not help either — a Trusted
 * Web Activity is a browser tab in a native shell, not a process with an
 * alarm clock.
 *
 * What is left is "fire it next time the app opens", which reminds you about
 * training at the moment you opened the training app. And an unreliable
 * reminder is worse than none, because you come to rely on it.
 *
 * So the reminding is handed to the thing that is already good at it. The
 * app writes the schedule as a calendar file; the climber's own phone does
 * the rest. No server, no permission that can be revoked, identical on iOS
 * and Android, and it keeps working with the app closed for a month.
 *
 * Written by hand, like `lib/zip.ts`, and for the same reason: the format is
 * small, a dependency is not, and the parts that actually break — folding by
 * octet, CRLF, escaping — are the parts a library would hide.
 */

const CRLF = '\r\n';

/** RFC 5545 §3.1: a content line is at most 75 octets, excluding the CRLF. */
export const MAX_OCTETS = 75;

const encoder = new TextEncoder();

/**
 * Fold a content line to 75 octets a piece.
 *
 * **Octets, not characters**, which is the whole reason this is not a
 * `slice(0, 75)`: a grade is one character and an emoji is four, and a
 * session named with one would push the line past the limit while looking
 * comfortably short. Iterating the string by code point rather than by index
 * also keeps a surrogate pair whole — splitting one produces a byte sequence
 * no parser can read.
 *
 * The continuation's leading space is part of its 75, so every line after
 * the first carries 74 octets of content.
 */
export function fold(line: string): string {
  if (encoder.encode(line).length <= MAX_OCTETS) return line;
  const parts: string[] = [];
  let current = '';
  let used = 0;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    if (used + size > MAX_OCTETS) {
      parts.push(current);
      current = '';
      // The space this line will start with.
      used = 1;
    }
    current += ch;
    used += size;
  }
  parts.push(current);
  return parts.join(`${CRLF} `);
}

/**
 * Escape a TEXT value (RFC 5545 §3.3.11).
 *
 * Backslash first, or the escapes introduced below get escaped again. A
 * colon is deliberately **not** escaped: it is only special in a property
 * *parameter*, and escaping it here puts a literal backslash in front of
 * every "Week 5: Hangboard" a climber reads.
 */
export function escapeText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

export interface IcsAlarm {
  /** How long before the start it fires. */
  minutesBefore: number;
  description: string;
}

export interface IcsEvent {
  /**
   * Stable across exports, so a second export **updates** the event rather
   * than adding a copy beside it. Re-exporting after changing the plan is
   * the normal thing to do, and without this it doubles the calendar.
   */
  uid: string;
  /** Local `YYYY-MM-DD`. */
  date: string;
  /** Minutes after midnight, local. */
  startMinute: number;
  durationMinutes: number;
  summary: string;
  description?: string;
  alarms?: IcsAlarm[];
}

export interface CalendarOptions {
  /** Shown as the calendar's name by clients that read X-WR-CALNAME. */
  name: string;
  /** Bumped when a re-export should supersede what is already in there. */
  sequence?: number;
  /** Injectable so a test is not at the mercy of the clock. */
  stamp?: Date;
}

/** `YYYYMMDDTHHMMSSZ`, which is the only form DTSTAMP may take. */
function utcStamp(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}` +
    `T${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}Z`
  );
}

/**
 * A **floating** local date-time: no `Z`, no `TZID`.
 *
 * RFC 5545 calls this form 1, and it means "whatever the local time is
 * wherever this is read". That is exactly right for a training reminder and
 * it dodges the two ways the alternatives go wrong: UTC would shift the
 * session by an hour every time the clocks change, and a TZID needs a
 * VTIMEZONE block carrying the climber's transition rules for the life of
 * the program.
 */
function floating(date: string, minute: number): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.replace(/-/g, '')}T${p(Math.floor(minute / 60))}${p(minute % 60)}00`;
}

/**
 * Where an event ends, without touching a `Date`.
 *
 * Adding ninety minutes to a local Date across a daylight-saving boundary
 * moves the end by an hour relative to the start. The times here are
 * floating, so the arithmetic is minutes and days and nothing else.
 */
export function endOf(event: Pick<IcsEvent, 'date' | 'startMinute' | 'durationMinutes'>): {
  date: string;
  minute: number;
} {
  const total = event.startMinute + event.durationMinutes;
  const days = Math.floor(total / 1440);
  return { date: addDaysKey(event.date, days), minute: total - days * 1440 };
}

/** `addDays` without importing the engine — lib stays free of it. */
function addDaysKey(key: string, days: number): string {
  if (days === 0) return key;
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y!, m! - 1, d! + days);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

export function icsCalendar(events: readonly IcsEvent[], options: CalendarOptions): string {
  const stamp = utcStamp(options.stamp ?? new Date());
  const sequence = options.sequence ?? 0;

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Project Ascent//Training schedule//EN',
    'CALSCALE:GREGORIAN',
    // PUBLISH rather than REQUEST: this is a schedule being handed over, not
    // an invitation expecting a reply from anybody.
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(options.name)}`,
  ];

  for (const event of events) {
    const end = endOf(event);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${event.uid}`,
      `DTSTAMP:${stamp}`,
      `SEQUENCE:${sequence}`,
      `DTSTART:${floating(event.date, event.startMinute)}`,
      `DTEND:${floating(end.date, end.minute)}`,
      `SUMMARY:${escapeText(event.summary)}`,
    );
    if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    for (const alarm of event.alarms ?? []) {
      lines.push(
        'BEGIN:VALARM',
        'ACTION:DISPLAY',
        // DESCRIPTION is required for a DISPLAY alarm, not decorative: a
        // client that finds none has nothing to put on the screen.
        `DESCRIPTION:${escapeText(alarm.description)}`,
        `TRIGGER:-PT${alarm.minutesBefore}M`,
        'END:VALARM',
      );
    }
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  // CRLF everywhere, including the final one. Bare newlines are the single
  // most common reason a hand-written .ics is rejected without explanation.
  return lines.map(fold).join(CRLF) + CRLF;
}
