/**
 * Sharing a written program as a file (M7, slice 3).
 *
 * This is the only place the app reads a document someone else produced, so
 * the parser is the substance and the file format is the easy part. A shared
 * program arrives as JSON that may have been hand-edited, truncated, written
 * by a different version, or simply be something else entirely — and it goes
 * straight into a screen that renders every field.
 *
 * The rule is **rebuild, never cast.** Nothing is trusted through: every
 * field is read individually, checked against what it is allowed to be, and
 * copied onto a fresh object. Anything unrecognised is dropped rather than
 * carried, so a file cannot smuggle a field the app will later read.
 *
 * Sizes are capped for the same reason. React escapes markup, so the risk is
 * not injection — it is a program claiming 100,000 weeks, which is a frozen
 * tab rather than an exploit, and just as effective at ruining the app.
 */

import { APP_VERSION } from '@/version';
import { DRILLS } from '@/content/drills';
import { FIELDS } from '@/content/fields';
import { METRICS } from '@/content/metrics';
import { PLANNED_PROGRAM_IDS } from '@/content/programs';
import { PROTOCOLS } from '@/content/protocols';
import { SCHEMA_VERSION } from '@/db/schema';
import {
  INTENSITY_ORDER,
  type Constraint,
  type Discipline,
  type Dose,
  type Equipment,
  type Exercise,
  type ExerciseBlock,
  type FieldId,
  type Intensity,
  type Phase,
  type PhasePrescription,
  type Program,
  type ProgramStage,
  type SessionType,
  type Track,
  type WeekStep,
  type WeeklyLayout,
} from '@/content/types';
import { DOSE_FIELDS } from './prescription';
import { secondsRange } from './sessionLength';
import type { GradeScale } from './grades';
import { MAX_WEEKS, newProgramId } from './customProgram';

export interface ProgramFile {
  app: 'project-ascent';
  kind: 'program';
  schemaVersion: number;
  appVersion: string;
  exportedAt: string;
  program: Program;
}

/** Caps. Generous enough for any real program, small enough to stay usable. */
export const LIMITS = {
  name: 80,
  subtitle: 140,
  text: 2000,
  line: 400,
  phases: 24,
  sessionTypes: 16,
  blocks: 16,
  exercises: 40,
  constraints: 24,
  assessments: 40,
  goals: 12,
  rhythm: 12,
  tracks: 8,
  steps: 24,
  fields: 16,
  next: 8,
} as const;

const STAGES: ProgramStage[] = ['start', 'foundations', 'style', 'advanced', 'ongoing'];
const DISCIPLINES: Discipline[] = ['boulder', 'sport', 'both'];
const EQUIPMENT: Equipment[] = ['none', 'wall', 'hangboard', 'campus', 'gym', 'weight'];
const SCALES: GradeScale[] = ['V', 'YDS'];

export class ProgramFileError extends Error {}

export function buildProgramFile(program: Program): ProgramFile {
  return {
    app: 'project-ascent',
    kind: 'program',
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    program,
  };
}

export function fileName(program: Program): string {
  const slugged = program.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  return `${slugged || 'program'}.ascent-program.json`;
}

export interface ParseResult {
  program: Program;
  /** What was thrown away, so an import is never silently lossy. */
  dropped: string[];
}

/**
 * Read a shared program.
 *
 * The imported program always gets a fresh id: keeping the original would
 * let a file overwrite a program the climber wrote, which is the one
 * outcome an import must never have.
 */
export function parseProgramFile(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new ProgramFileError('That file is not readable JSON.');
  }
  const file = asRecord(raw);
  if (file === null) throw new ProgramFileError('That file does not contain a program.');
  if (file['app'] !== 'project-ascent' || file['kind'] !== 'program') {
    throw new ProgramFileError('That is not a Project Ascent program file.');
  }
  const version = file['schemaVersion'];
  if (typeof version === 'number' && version > SCHEMA_VERSION) {
    throw new ProgramFileError(
      `That program was written by a newer version of the app (v${version}). Update, then import it.`,
    );
  }
  const body = asRecord(file['program']);
  if (body === null) throw new ProgramFileError('That file has no program in it.');

  const dropped: string[] = [];
  const program = readProgram(body, dropped);
  return { program, dropped };
}

// ── Readers ───────────────────────────────────────────────────────────────

/**
 * What every reader below needs to know about the file as a whole: the
 * length, the tracks it declares (an exercise on a track the file does not
 * declare is on no track), and where to say what was left out.
 */
interface Reading {
  weeks: number;
  tracks: Set<string>;
  dropped: string[];
}

function readProgram(raw: Record<string, unknown>, dropped: string[]): Program {
  const weeks = clampInt(raw['weeks'], 1, MAX_WEEKS, 8);
  const tracks = readTracks(raw['tracks'], dropped);
  const reading: Reading = { weeks, tracks: new Set(tracks.map((t) => t.id)), dropped };
  const sessionTypes = readList(raw['sessionTypes'], LIMITS.sessionTypes, dropped, 'session types')
    .map((t) => readSessionType(t, reading))
    .filter((t): t is SessionType => t !== null);
  const knownTypes = new Set(sessionTypes.map((t) => t.id));

  const program: Program = {
    id: newProgramId(),
    name: str(raw['name'], LIMITS.name) || 'Untitled program',
    subtitle: str(raw['subtitle'], LIMITS.subtitle),
    kind: raw['kind'] === 'mode' ? 'mode' : 'program',
    stage: pick(raw['stage'], STAGES, 'style'),
    discipline: pick(raw['discipline'], DISCIPLINES, 'both'),
    gradeRange: readGradeRange(raw['gradeRange']),
    weeks,
    equipment: readEquipment(raw['equipment']),
    intro: readIntro(raw['intro']),
    phases: readPhases(raw['phases'], weeks, dropped),
    sessionTypes,
    constraints: readConstraints(raw['constraints'], knownTypes, dropped),
    frequency: str(raw['frequency'], LIMITS.text),
    ordering: str(raw['ordering'], LIMITS.text),
    assessments: readAssessments(raw['assessments'], dropped),
    // Only successors the catalogue ships, because a shipped id is the same
    // on every install and a written one is not (PLAN.md M136). Its
    // prerequisites named a place in a catalog it is no longer in, and stay
    // behind.
    nextPrograms: readNext(raw['nextPrograms'], dropped),
  };

  const author = str(raw['author'], LIMITS.name);
  if (author) program.author = author;

  const deloads = readNumbers(raw['deloadWeeks'], 1, weeks);
  if (deloads.length > 0) program.deloadWeeks = deloads;

  if (tracks.length > 0) program.tracks = tracks;

  // Helpful kit that is also required is a contradiction the finder would
  // trip on, so the required list wins.
  const helpful = readEquipmentList(raw['helpfulEquipment']).filter(
    (kit) => kit !== 'none' && !program.equipment.includes(kit),
  );
  if (helpful.length > 0) program.helpfulEquipment = helpful;

  const layout = readLayout(raw['recommendedLayout'], knownTypes, dropped);
  if (layout) program.recommendedLayout = layout;

  if (raw['outdoor'] === true) program.outdoor = true;
  return program;
}

function readSessionType(raw: unknown, reading: Reading): SessionType | null {
  const { weeks, dropped } = reading;
  const r = asRecord(raw);
  if (r === null) return null;
  const name = str(r['name'], LIMITS.name);
  const id = slug(r['id'], name);
  if (!id) return null;

  const type: SessionType = {
    id,
    name: name || id,
    icon: str(r['icon'], 8) || '🧗',
    description: str(r['description'], LIMITS.line),
  };
  if (r['isRest'] === true) type.isRest = true;
  // How hard, and which sessions survive a short week (PLAN.md M131, M55).
  // Both were written to the file since they existed and read back by
  // nothing, so a shared program arrived with every day ordinary and every
  // session equally droppable.
  if (typeof r['intensity'] === 'string' && (INTENSITY_ORDER as readonly string[]).includes(r['intensity'])) {
    type.intensity = r['intensity'] as Intensity;
  }
  if (typeof r['priority'] === 'number') type.priority = clampInt(r['priority'], 1, 99, 1);
  // How long the session takes, where the dose cannot say (PLAN.md M138).
  // A duration no clock can read is a string nothing would use, so it is
  // dropped and named rather than carried.
  const duration = str(r['duration'], 40);
  if (duration && secondsRange(duration) !== null) type.duration = duration;
  else if (duration) dropped.push(`a session length this version cannot read ("${duration}")`);

  const fields = readFields(r['fields'], dropped);
  if (fields.length > 0) type.fields = fields;

  const blocks = readList(r['blocks'], LIMITS.blocks, dropped, `blocks in ${type.name}`)
    .map((b) => readBlock(b, reading))
    .filter((b): b is ExerciseBlock => b !== null);
  if (blocks.length > 0) type.blocks = blocks;

  const drills = readDrills(r['drillsByWeek'], weeks, dropped);
  if (Object.keys(drills).length > 0) type.drillsByWeek = drills;

  return type;
}

function readBlock(raw: unknown, reading: Reading): ExerciseBlock | null {
  const r = asRecord(raw);
  if (r === null) return null;
  const name = str(r['name'], LIMITS.name);
  const id = slug(r['id'], name);
  if (!id) return null;

  const perPhase: Record<string, PhasePrescription> = {};
  for (const [phaseId, value] of Object.entries(asRecord(r['perPhase']) ?? {})) {
    const key = slug(phaseId, '');
    const entry = asRecord(value);
    if (!key || entry === null) continue;
    perPhase[key] = readPrescription(entry, reading);
  }
  const block: ExerciseBlock = { id, name: name || id, perPhase };
  const constant = str(r['constantDose'], LIMITS.text);
  if (constant) block.constantDose = constant;
  return block;
}

function readPrescription(raw: Record<string, unknown>, reading: Reading): PhasePrescription {
  const { dropped } = reading;
  const exercises = readList(raw['exercises'], LIMITS.exercises, dropped, 'exercises')
    .map((e) => readExercise(e, reading))
    .filter((e): e is Exercise => e !== null);
  const out: PhasePrescription = { rationale: str(raw['rationale'], LIMITS.text), exercises };

  const selection = asRecord(raw['selection']);
  if (selection && typeof selection['pick'] === 'number') {
    const note = str(selection['note'], LIMITS.line);
    out.selection = { pick: clampInt(selection['pick'], 1, LIMITS.exercises, 1), ...(note ? { note } : {}) };
  }
  const circuit = asRecord(raw['circuit']);
  if (circuit && str(circuit['rounds'], 40)) {
    out.circuit = {
      rounds: str(circuit['rounds'], 40),
      ...opt('work', str(circuit['work'], 40)),
      ...opt('restBetween', str(circuit['restBetween'], 40)),
      ...opt('restBetweenRounds', str(circuit['restBetweenRounds'], 40)),
    };
  }
  const merged = str(raw['mergedInto'], LIMITS.name);
  if (merged) out.mergedInto = merged;
  const steps = readSteps(raw['perWeek'], dropped);
  if (steps.length > 0) out.perWeek = steps;
  return out;
}

/**
 * The week-by-week steps (PLAN.md M127), which the file carried from the
 * day they existed and this never read — so a shared block arrived with its
 * progression flattened back to one dose a phase, silently.
 */
function readSteps(raw: unknown, dropped: string[]): WeekStep[] {
  const out: WeekStep[] = [];
  const seen = new Set<number>();
  for (const value of readList(raw, LIMITS.steps, dropped, 'week steps')) {
    const r = asRecord(value);
    if (r === null) continue;
    const week = clampInt(r['week'], 1, MAX_WEEKS, 0);
    const step = str(r['step'], LIMITS.line);
    // Week one is the phase's own dose, and a step with nothing written on
    // it is a number with no reason — the shape the type refuses.
    if (week < 2 || !step || seen.has(week)) {
      dropped.push(`a week step with no week or nothing written on it`);
      continue;
    }
    seen.add(week);
    const dose: Record<string, Dose> = {};
    for (const [name, change] of Object.entries(asRecord(r['dose']) ?? {})) {
      const exercise = str(name, LIMITS.name);
      const d = asRecord(change);
      if (!exercise || d === null) continue;
      const moved: Dose = {};
      for (const field of DOSE_FIELDS) {
        const v = str(d[field], 60);
        if (v) moved[field] = v;
      }
      if (Object.keys(moved).length > 0) dose[exercise] = moved;
    }
    out.push({ week, step, ...(Object.keys(dose).length > 0 ? { dose } : {}) });
  }
  return out.sort((a, b) => a.week - b.week);
}

function readExercise(raw: unknown, reading: Reading): Exercise | null {
  const r = asRecord(raw);
  if (r === null) return null;
  const name = str(r['name'], LIMITS.name);
  if (!name) return null;
  const protocolId = str(r['protocolId'], 60);
  const track = str(r['track'], 40);
  // A line on a track the file does not declare would be hidden from
  // everyone, since no climber can pick a track that is not offered.
  if (track && !reading.tracks.has(track)) {
    reading.dropped.push(`"${name}" was on a track the file does not declare`);
  }
  return {
    name,
    // A protocol that does not exist here would render a timer that cannot
    // open, so an unknown one is dropped rather than kept as a dead link.
    ...(protocolId && protocolId in PROTOCOLS ? { protocolId } : {}),
    ...(track && reading.tracks.has(track) ? { track } : {}),
    ...opt('sets', str(r['sets'], 40)),
    ...opt('reps', str(r['reps'], 60)),
    ...opt('hold', str(r['hold'], 40)),
    ...opt('load', str(r['load'], 60)),
    ...opt('rest', str(r['rest'], 40)),
    ...opt('notes', str(r['notes'], LIMITS.line)),
  };
}

function readPhases(raw: unknown, weeks: number, dropped: string[]): Phase[] {
  const list = readList(raw, LIMITS.phases, dropped, 'phases')
    .map((value, i): Phase | null => {
      const r = asRecord(value);
      if (r === null) return null;
      const name = str(r['name'], LIMITS.name);
      return {
        id: slug(r['id'], name) || `phase${i + 1}`,
        name: name || `Block ${i + 1}`,
        weekStart: clampInt(r['weekStart'], 1, weeks, 1),
        weekEnd: clampInt(r['weekEnd'], 1, weeks, weeks),
        description: str(r['description'], LIMITS.text),
        goals: readList(r['goals'], LIMITS.goals, dropped, 'goals')
          .map((g) => str(g, LIMITS.line))
          .filter(Boolean),
      };
    })
    .filter((p): p is Phase => p !== null);

  if (list.length === 0) {
    return [{ id: 'phase1', name: 'Block 1', weekStart: 1, weekEnd: weeks, description: '', goals: [] }];
  }
  // Ids must be unique, or two phases share one prescription.
  const seen = new Set<string>();
  return list.map((phase, i) => {
    const id = seen.has(phase.id) ? `${phase.id}_${i + 1}` : phase.id;
    seen.add(id);
    return { ...phase, id };
  });
}

function readConstraints(raw: unknown, known: Set<string>, dropped: string[]): Constraint[] {
  const out: Constraint[] = [];
  for (const value of readList(raw, LIMITS.constraints, dropped, 'rules')) {
    const r = asRecord(value);
    if (r === null) continue;
    const note = str(r['note'], LIMITS.line);
    const named = (key: string) => {
      const id = slug(r[key], '');
      return id && known.has(id) ? id : null;
    };
    switch (r['kind']) {
      case 'sessions-per-week':
        out.push({
          kind: 'sessions-per-week',
          min: clampInt(r['min'], 0, 14, 3),
          max: clampInt(r['max'], 0, 14, 5),
          note,
        });
        break;
      case 'min-gap-hours': {
        const between = readList(r['between'], 8, dropped, 'rule targets')
          .map((id) => slug(id, ''))
          .filter((id) => id && known.has(id));
        if (between.length > 0) {
          out.push({ kind: 'min-gap-hours', between, hours: clampInt(r['hours'], 0, 336, 48), note });
        } else dropped.push('a spacing rule naming a session type that is not in the file');
        break;
      }
      case 'max-per-week': {
        const id = named('sessionTypeId');
        if (id) out.push({ kind: 'max-per-week', sessionTypeId: id, count: clampInt(r['count'], 1, 14, 2), note });
        else dropped.push('a per-week limit naming a session type that is not in the file');
        break;
      }
      case 'order-in-week': {
        const first = named('first');
        const then = named('then');
        if (first && then) out.push({ kind: 'order-in-week', first, then, note });
        else dropped.push('an ordering rule naming a session type that is not in the file');
        break;
      }
      case 'not-day-before': {
        const id = named('sessionTypeId');
        const before = named('before');
        if (id && before) out.push({ kind: 'not-day-before', sessionTypeId: id, before, note });
        else dropped.push('a spacing rule naming a session type that is not in the file');
        break;
      }
      case 'no-back-to-back':
        out.push({ kind: 'no-back-to-back', intensity: pick(r['intensity'], [...INTENSITY_ORDER], 'hard'), note });
        break;
      default:
        dropped.push('a rule of a kind this version does not know');
    }
  }
  return out;
}

function readLayout(raw: unknown, known: Set<string>, dropped: string[]): WeeklyLayout | null {
  const r = asRecord(raw);
  if (r === null) return null;
  const slots: WeeklyLayout['slots'] = {};
  for (const [day, value] of Object.entries(asRecord(r['slots']) ?? {})) {
    const n = Number(day);
    if (!Number.isInteger(n) || n < 0 || n > 6) continue;
    const id = slug(value, '');
    if (id && known.has(id)) slots[n as 0 | 1 | 2 | 3 | 4 | 5 | 6] = id;
    else if (id) dropped.push(`a recommended day naming "${id}", which is not in the file`);
  }
  return {
    name: str(r['name'], LIMITS.name) || 'Recommended',
    description: str(r['description'], LIMITS.line),
    slots,
  };
}

function readDrills(raw: unknown, weeks: number, dropped: string[]): Record<number, string> {
  const out: Record<number, string> = {};
  const known = new Set(DRILLS.map((d) => d.id));
  for (const [week, value] of Object.entries(asRecord(raw) ?? {})) {
    const n = Number(week);
    if (!Number.isInteger(n) || n < 1 || n > weeks) continue;
    const id = slug(value, '');
    // A drill this app does not ship cannot be rendered or timed.
    if (id && known.has(id)) out[n] = id;
    else if (id) dropped.push(`a drill this version does not have ("${id}")`);
  }
  return out;
}

function readTracks(raw: unknown, dropped: string[]): Track[] {
  const out: Track[] = [];
  const seen = new Set<string>();
  for (const value of readList(raw, LIMITS.tracks, dropped, 'tracks')) {
    const r = asRecord(value);
    if (r === null) continue;
    const name = str(r['name'], LIMITS.name);
    // Kept as written rather than slugged: a track id is opaque, and the
    // exercises name it verbatim — the catalogue's are 'A' and 'B', and
    // lowercasing them here put every tracked line on no track at all.
    const id = str(r['id'], 40) || slug(name, '');
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name: name || id, description: str(r['description'], LIMITS.line) });
  }
  return out;
}

function readFields(raw: unknown, dropped: string[]): FieldId[] {
  const out: FieldId[] = [];
  for (const value of readList(raw, LIMITS.fields, dropped, 'questions')) {
    const id = typeof value === 'string' ? value.trim() : '';
    if (id && id in FIELDS) out.push(id as FieldId);
    else if (id) dropped.push(`a question this version does not ask ("${id}")`);
  }
  return [...new Set(out)];
}

function readNext(raw: unknown, dropped: string[]): Program['nextPrograms'] {
  const out: Program['nextPrograms'] = [];
  const seen = new Set<string>();
  for (const value of readList(raw, LIMITS.next, dropped, 'what comes after')) {
    const r = asRecord(value);
    if (r === null) continue;
    const id = slug(r['id'], '');
    if (!id || seen.has(id)) continue;
    if (!PLANNED_PROGRAM_IDS.includes(id)) {
      dropped.push(`a program named as what comes after that this version does not have ("${id}")`);
      continue;
    }
    seen.add(id);
    out.push({ id, reason: str(r['reason'], LIMITS.line) });
  }
  return out;
}

function readAssessments(raw: unknown, dropped: string[]): string[] {
  const out: string[] = [];
  for (const value of readList(raw, LIMITS.assessments, dropped, 'benchmarks')) {
    const id = slug(value, '');
    if (id && id in METRICS) out.push(id);
    else if (id) dropped.push(`a benchmark this version does not have ("${id}")`);
  }
  return [...new Set(out)];
}

function readGradeRange(raw: unknown): Program['gradeRange'] {
  const r = asRecord(raw);
  const scale = pick(r?.['scale'], SCALES, 'V');
  const min = str(r?.['min'], 12) || (scale === 'V' ? 'V0' : '5.4');
  const max = str(r?.['max'], 12) || (scale === 'V' ? 'V17' : '5.15d');
  return { scale, min, max, label: str(r?.['label'], 40) || `${min}-${max}` };
}

function readIntro(raw: unknown): Program['intro'] {
  const r = asRecord(raw) ?? {};
  return {
    pitch: str(r['pitch'], LIMITS.text),
    rhythm: (Array.isArray(r['rhythm']) ? r['rhythm'] : [])
      .slice(0, LIMITS.rhythm)
      .map((v) => str(v, LIMITS.line))
      .filter(Boolean),
    graduation: str(r['graduation'], LIMITS.text),
  };
}

function readEquipmentList(raw: unknown): Equipment[] {
  const list = (Array.isArray(raw) ? raw : [])
    .map((v) => (typeof v === 'string' ? v : ''))
    .filter((v): v is Equipment => (EQUIPMENT as string[]).includes(v));
  return [...new Set(list)];
}

function readEquipment(raw: unknown): Equipment[] {
  const list = readEquipmentList(raw);
  return list.length > 0 ? list : ['wall'];
}

// ── Primitives ────────────────────────────────────────────────────────────

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readList(value: unknown, cap: number, dropped: string[], what: string): unknown[] {
  if (!Array.isArray(value)) return [];
  if (value.length > cap) dropped.push(`${value.length - cap} extra ${what}`);
  return value.slice(0, cap);
}

/** Trimmed, length-capped, control characters flattened to spaces. */
function str(value: unknown, cap: number): string {
  if (typeof value !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, cap);
}

function slug(value: unknown, fallbackFrom: string): string {
  const source = typeof value === 'string' && value.trim() ? value : fallbackFrom;
  return source
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 60);
}

function pick<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  return typeof value === 'string' && (allowed as string[]).includes(value) ? (value as T) : fallback;
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const n = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : NaN;
  if (Number.isNaN(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function readNumbers(value: unknown, min: number, max: number): number[] {
  if (!Array.isArray(value)) return [];
  const out = value.filter(
    (v): v is number => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max,
  );
  return [...new Set(out)].sort((a, b) => a - b).slice(0, max);
}

function opt<K extends string>(key: K, value: string): Partial<Record<K, string>> {
  return value ? ({ [key]: value } as Partial<Record<K, string>>) : {};
}
