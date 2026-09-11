import { describe, expect, it } from 'vitest';
import { MAX_OCTETS, endOf, escapeText, fold, icsCalendar, type IcsEvent } from './ics';

/**
 * Writing iCalendar by hand (PLAN.md M75).
 *
 * The format is forgiving to read and unforgiving to write: a bare newline,
 * a line past 75 octets, or an unescaped comma and the client rejects the
 * file with no explanation at all. So every one of those has a test.
 */

const event = (over: Partial<IcsEvent> = {}): IcsEvent => ({
  uid: 'u1@project-ascent',
  date: '2026-09-15',
  startMinute: 18 * 60,
  durationMinutes: 90,
  summary: 'Hangboard',
  ...over,
});

const lines = (text: string): string[] => text.split('\r\n');
const octets = (line: string): number => new TextEncoder().encode(line).length;

describe('folding', () => {
  it('leaves a short line alone', () => {
    expect(fold('SUMMARY:Hangboard')).toBe('SUMMARY:Hangboard');
  });

  it('breaks a long one at the limit, continuing with a space', () => {
    const folded = fold(`SUMMARY:${'a'.repeat(200)}`);
    const parts = folded.split('\r\n');
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) expect(octets(part)).toBeLessThanOrEqual(MAX_OCTETS);
    for (const part of parts.slice(1)) expect(part.startsWith(' ')).toBe(true);
  });

  it('unfolds back to what went in', () => {
    const original = `DESCRIPTION:${'word '.repeat(60).trim()}`;
    expect(fold(original).split('\r\n ').join('')).toBe(original);
  });

  it('counts octets, not characters', () => {
    // Seventy climbing emoji is seventy characters and 280 octets. A
    // character count would call this one line and write an illegal file.
    const folded = fold(`SUMMARY:${'🧗'.repeat(70)}`);
    for (const part of folded.split('\r\n')) expect(octets(part)).toBeLessThanOrEqual(MAX_OCTETS);
  });

  it('never splits a character down the middle', () => {
    // Splitting by index rather than by code point leaves half a surrogate
    // pair either side of the fold, and the CRLF between them means it
    // cannot be rejoined — the file is no longer valid UTF-8. Checked on the
    // string itself: `TextEncoder` quietly replaces a lone surrogate with
    // U+FFFD, so a round trip through it agrees with anything.
    const lone = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
    expect(lone.test(fold(`SUMMARY:${'🧗'.repeat(70)}`))).toBe(false);
    expect(lone.test(fold(`SUMMARY:${'a🧗'.repeat(50)}`))).toBe(false);
  });

  it('gives a continuation line room for its own leading space', () => {
    const folded = fold(`X:${'a'.repeat(300)}`);
    const parts = folded.split('\r\n');
    // 75 octets including the space, so 74 of content.
    for (const part of parts.slice(1, -1)) expect(octets(part)).toBe(MAX_OCTETS);
  });
});

describe('escaping', () => {
  // `String.raw` throughout, because the expectations are strings full of
  // backslashes and a plain literal gets them wrong the same way the
  // implementation did: `'\;'` in JavaScript is just `';'`.
  it('escapes the three characters that end a value early', () => {
    expect(escapeText('a;b')).toBe(String.raw`a\;b`);
    expect(escapeText('a,b')).toBe(String.raw`a\,b`);
    expect(escapeText('a\nb')).toBe(String.raw`a\nb`);
  });

  it('escapes a backslash first, so the escapes are not escaped again', () => {
    expect(escapeText(String.raw`a\b`)).toBe(String.raw`a\\b`);
    expect(escapeText(String.raw`a\,b`)).toBe(String.raw`a\\\,b`);
  });

  it('leaves a colon alone', () => {
    // It is only special in a parameter. Escaping it here puts a backslash
    // in front of every "Week 5: Hangboard" a climber reads.
    expect(escapeText('Week 5: Hangboard')).toBe('Week 5: Hangboard');
  });

  it('normalises a CRLF inside a value to one escaped newline', () => {
    expect(escapeText('a\r\nb')).toBe(String.raw`a\nb`);
  });

  it('survives a session name with every one of them in it', () => {
    const messy = 'Power; endurance, "the \\ one"\nand a note';
    const out = escapeText(messy);
    // Nothing left that could end the value early.
    expect(out).not.toMatch(/(?<!\\);/);
    expect(out).not.toMatch(/(?<!\\),/);
    expect(out).not.toContain('\n');
  });
});

describe('the file', () => {
  const file = icsCalendar([event()], { name: 'Training', stamp: new Date(Date.UTC(2026, 8, 1, 9, 30, 0)) });

  it('opens and closes as a calendar', () => {
    expect(lines(file)[0]).toBe('BEGIN:VCALENDAR');
    expect(lines(file).filter(Boolean).pop()).toBe('END:VCALENDAR');
  });

  it('ends every line with CRLF, including the last', () => {
    // Bare newlines are the commonest reason a hand-written .ics is refused.
    expect(file.endsWith('\r\n')).toBe(true);
    expect(file.replace(/\r\n/g, '')).not.toContain('\n');
  });

  it('states the version and a product id, which are both required', () => {
    expect(file).toContain('VERSION:2.0');
    expect(file).toMatch(/PRODID:-\/\/.+\/\/.+\/\/EN/);
  });

  it('publishes rather than inviting', () => {
    // REQUEST would make the climber's own calendar wait for a reply.
    expect(file).toContain('METHOD:PUBLISH');
  });

  it('stamps in UTC, which is the only form DTSTAMP takes', () => {
    expect(file).toContain('DTSTAMP:20260901T093000Z');
  });

  it('writes the start as a floating local time', () => {
    // No Z and no TZID: "6pm wherever this is read". UTC would move the
    // session by an hour every time the clocks changed.
    expect(file).toContain('DTSTART:20260915T180000');
    expect(file).not.toMatch(/DTSTART:[^\r\n]*Z/);
    expect(file).not.toContain('TZID');
  });

  it('ends the event where the duration says', () => {
    expect(file).toContain('DTEND:20260915T193000');
  });

  it('carries the uid it was given', () => {
    expect(file).toContain('UID:u1@project-ascent');
  });
});

describe('an event that runs past midnight', () => {
  it('rolls the date forward rather than writing an impossible time', () => {
    expect(endOf({ date: '2026-09-15', startMinute: 23 * 60, durationMinutes: 120 })).toEqual({
      date: '2026-09-16',
      minute: 60,
    });
  });

  it('does its arithmetic in minutes, so a clock change cannot move the end', () => {
    // 2026-10-25 is a daylight-saving boundary in much of Europe. Adding 90
    // minutes to a local Date across one moves the end relative to the start.
    const end = endOf({ date: '2026-10-25', startMinute: 60, durationMinutes: 90 });
    expect(end).toEqual({ date: '2026-10-25', minute: 150 });
  });

  it('crosses a month end', () => {
    expect(endOf({ date: '2026-09-30', startMinute: 1380, durationMinutes: 120 }).date).toBe('2026-10-01');
  });
});

describe('the alarm', () => {
  const file = icsCalendar(
    [event({ alarms: [{ minutesBefore: 120, description: 'Hangboard at 6' }] })],
    { name: 'Training' },
  );

  it('is a display alarm with something to display', () => {
    expect(file).toContain('BEGIN:VALARM');
    expect(file).toContain('ACTION:DISPLAY');
    // Not decorative: a client that finds no description has nothing to show.
    expect(file).toContain('DESCRIPTION:Hangboard at 6');
    expect(file).toContain('TRIGGER:-PT120M');
  });

  it('closes every block it opens', () => {
    for (const pair of [['VCALENDAR'], ['VEVENT'], ['VALARM']]) {
      const tag = pair[0]!;
      expect((file.match(new RegExp(`BEGIN:${tag}`, 'g')) ?? []).length).toBe(
        (file.match(new RegExp(`END:${tag}`, 'g')) ?? []).length,
      );
    }
  });

  it('writes none when none was asked for', () => {
    expect(icsCalendar([event()], { name: 'Training' })).not.toContain('VALARM');
  });
});

describe('a whole schedule', () => {
  const many = Array.from({ length: 40 }, (_, i) =>
    event({ uid: `u${i}@project-ascent`, date: `2026-09-${String((i % 28) + 1).padStart(2, '0')}` }),
  );
  const file = icsCalendar(many, { name: 'Project Ascent · Iron Grip' });

  it('writes one event per day asked for', () => {
    expect((file.match(/BEGIN:VEVENT/g) ?? []).length).toBe(40);
  });

  it('keeps every line legal', () => {
    for (const line of lines(file)) expect(octets(line)).toBeLessThanOrEqual(MAX_OCTETS);
  });

  it('names the calendar', () => {
    expect(file).toContain('X-WR-CALNAME:Project Ascent · Iron Grip');
  });

  it('writes nothing but the wrapper for an empty schedule', () => {
    const empty = icsCalendar([], { name: 'Training' });
    expect(empty).not.toContain('VEVENT');
    expect(empty).toContain('END:VCALENDAR');
  });
});
