/**
 * The journal: everything you have written, in one timeline.
 *
 * Nothing is stored here. Notes already live where they were written — on
 * the session, on the project, beside an assessment result — and this reads
 * them back. That is the whole complaint the plan records about the
 * prototype (PLAN.md §6.3): the notes existed, there was just no way to
 * read them, because each one was locked inside the screen that wrote it.
 *
 * Keeping it derived means a note is never in two places, an edit at the
 * source is immediately reflected here, and deleting a session takes its
 * notes with it without a second cleanup pass.
 *
 * Pure: records in, entries out.
 */

import { getMetric } from '@/content/metrics';
import { getProgram } from '@/content/programs';
import type { MetricId } from '@/content/types';
import type { MetricEntry } from '@/db/metrics';
import type { Project } from '@/db/projects';
import type { Session } from '@/db/sessions';
import { formatEntry } from './assessments';
import { OUTCOME_LABEL } from './projects';

export type JournalKind = 'session' | 'beta' | 'attempt' | 'assessment';

export interface JournalEntry {
  /** Stable across rebuilds — derived from the source record, not generated. */
  id: string;
  kind: JournalKind;
  date: string;
  /** What was written. */
  text: string;
  /** What it was written about. */
  title: string;
  /** The number or outcome the note accompanies, when there is one. */
  detail?: string;
  /** Where to go to edit it. */
  href: string;
  programId?: string;
  projectId?: string;
  metricId?: MetricId;
  sessionId?: string;
  /** Lowercased #tags found in the text. */
  tags: string[];
}

export interface JournalSources {
  sessions?: Session[];
  projects?: Project[];
  metrics?: MetricEntry[];
}

// A tag starts a word: `#crimps` is one, the `#b` inside `a#b` is not.
const TAG_PATTERN = /(?<![\p{L}\p{N}_])#([\p{L}\p{N}][\p{L}\p{N}_-]*)/gu;

export function extractTags(text: string): string[] {
  const found = [...text.matchAll(TAG_PATTERN)].map((m) => m[1]!.toLowerCase());
  return [...new Set(found)];
}

/** Every written note, newest first. */
export function buildJournal(sources: JournalSources): JournalEntry[] {
  const entries: JournalEntry[] = [];
  const projectName = new Map((sources.projects ?? []).map((p) => [p.id, p.name]));

  for (const session of sources.sessions ?? []) {
    const note = session.notes?.trim();
    if (note) {
      entries.push({
        id: `session:${session.id}`,
        kind: 'session',
        date: session.date,
        text: note,
        title: sessionTitle(session),
        href: `/log/${session.date}`,
        ...(session.programId ? { programId: session.programId } : {}),
        sessionId: session.id,
        tags: extractTags(note),
      });
    }

    for (const attempt of session.projectAttempts ?? []) {
      const text = attempt.note?.trim();
      if (!text) continue;
      entries.push({
        id: `attempt:${session.id}:${attempt.id}`,
        kind: 'attempt',
        date: session.date,
        text,
        title: projectName.get(attempt.projectId) ?? 'Project',
        detail: OUTCOME_LABEL[attempt.outcome],
        href: `/projects/${attempt.projectId}`,
        projectId: attempt.projectId,
        sessionId: session.id,
        tags: extractTags(text),
      });
    }
  }

  for (const project of sources.projects ?? []) {
    for (const note of project.beta) {
      const text = note.text.trim();
      if (!text) continue;
      entries.push({
        id: `beta:${project.id}:${note.id}`,
        kind: 'beta',
        date: note.date,
        text,
        title: project.name,
        detail: project.grade,
        href: `/projects/${project.id}`,
        projectId: project.id,
        tags: extractTags(text),
      });
    }
  }

  for (const result of sources.metrics ?? []) {
    const text = result.note?.trim();
    if (!text) continue;
    const metric = getMetric(result.metricId);
    entries.push({
      id: `assessment:${result.metricId}:${result.date}`,
      kind: 'assessment',
      date: result.date,
      text,
      title: metric?.label ?? result.metricId,
      ...(metric ? { detail: formatEntry(metric, result) } : {}),
      href: `/assessments/${result.metricId}`,
      metricId: result.metricId,
      tags: extractTags(text),
    });
  }

  // Newest first; ties broken by id so the order never shuffles between
  // renders of the same data.
  return entries.sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date < b.date ? 1 : -1));
}

function sessionTitle(session: Session): string {
  const program = session.programId ? getProgram(session.programId) : undefined;
  const type = program?.sessionTypes.find((t) => t.id === session.sessionTypeId);
  return type?.name ?? 'Session';
}

export interface JournalFilters {
  /** Space-separated terms, all of which must match. A `#tag` term matches tags. */
  query?: string;
  kinds?: JournalKind[];
  projectId?: string;
  tag?: string;
  from?: string;
  to?: string;
}

export function filterJournal(entries: JournalEntry[], filters: JournalFilters = {}): JournalEntry[] {
  const terms = (filters.query ?? '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  return entries.filter((entry) => {
    if (filters.kinds && filters.kinds.length > 0 && !filters.kinds.includes(entry.kind)) return false;
    if (filters.projectId && entry.projectId !== filters.projectId) return false;
    if (filters.tag && !entry.tags.includes(filters.tag)) return false;
    if (filters.from && entry.date < filters.from) return false;
    if (filters.to && entry.date > filters.to) return false;
    if (terms.length === 0) return true;

    const haystack = `${entry.text} ${entry.title} ${entry.detail ?? ''}`.toLowerCase();
    // Every term must hit — "crimp beta" should mean both words, not either.
    return terms.every((term) =>
      term.startsWith('#') ? entry.tags.includes(term.slice(1)) : haystack.includes(term),
    );
  });
}

export interface TagCount {
  tag: string;
  count: number;
}

/** Tags in use, most-used first, then alphabetically. */
export function journalTags(entries: JournalEntry[]): TagCount[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    for (const tag of entry.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** Entries grouped by month, newest first, for a scannable timeline. */
export function byMonth(entries: JournalEntry[]): { month: string; entries: JournalEntry[] }[] {
  const groups: { month: string; entries: JournalEntry[] }[] = [];
  for (const entry of entries) {
    const month = entry.date.slice(0, 7);
    const last = groups.at(-1);
    if (last && last.month === month) last.entries.push(entry);
    else groups.push({ month, entries: [entry] });
  }
  return groups;
}
