import type { Guide } from './types';

/**
 * The guide for General Training (PLAN.md M166).
 *
 * **The only entry in the catalogue that had none.** Every other program and
 * the outdoor mode carried six to thirteen sections; this one carried nothing,
 * so the program detail page showed no guide link at all — and the entry with
 * no link is the one a climber picks when they do not want a program, which is
 * exactly when they have the fewest other places to look.
 *
 * ## What it is written from
 *
 * Not invented. General Training already holds more coaching than most of the
 * blocks — *"push work is INJURY PREVENTION, not bodybuilding"*, *"legs are
 * the most under-trained body part for climbers"*, *"48 hours between
 * hangboard sessions"* — and every line of it is buried inside a
 * `perPhase.rationale`, visible only once a climber has picked that block on
 * that session. This lifts the reasoning into a document a climber can read
 * before they start, which is what a guide is for.
 *
 * ## Written short, and honest about being a mode
 *
 * A mode has no finish line, so there is no phase-by-phase to walk and no
 * graduation to describe. What replaces it is the harder question: what stops
 * open-ended training from becoming the same session forever. That is the spine
 * of this guide, and the reason it does not read like a program's.
 */
export const GENERAL_TRAINING_GUIDE: Guide = {
  id: 'general_training',
  name: 'GENERAL TRAINING',
  subtitle: 'Training without a program, on purpose',
  sections: [
    {
      title: 'Introduction',
      content: [
        {
          kind: 'quote',
          text: 'A program is a way of deciding in advance. Without one you decide every session, and the decisions are the training.',
        },
        {
          kind: 'p',
          text: 'This is the entry for climbers who are not running a block. Between programs, in the off-season, coming back from something, or simply because a twelve-week plan is not what you want from climbing right now. Everything still counts: the log, the stats, the projects, the altimeter, the grade pyramid. Nothing here is a lesser record.',
        },
        {
          kind: 'p',
          text: 'What you give up is periodization — the deliberate rise and fall of load that a block builds for you. What you get back is the freedom to train what the week actually allows. That trade is a good one for a lot of climbers and a bad one for a few, and the rest of this guide is about which you are.',
        },
        {
          kind: 'h',
          text: 'Who this suits',
        },
        {
          kind: 'table',
          head: ['Profile', 'Why this rather than a block'],
          rows: [
            ['Between blocks', 'You finished something and have not picked the next one. Four to eight weeks here is a real answer, not a gap.'],
            ['Unpredictable weeks', 'Shift work, small children, travel. A block you abandon in week five teaches less than eight honest weeks of this.'],
            ['Climbing for its own sake', 'You want to climb, not to train. The log still builds the picture; nothing asks you to follow a plan.'],
            ['Post-injury, cleared to train', 'You are rebuilding and the dose is week-to-week. A program that prescribes ahead cannot know how the finger felt on Tuesday.'],
          ],
        },
        {
          kind: 'note',
          text: 'If you can name a grade you want and a date you want it by, you want a block instead. Open-ended training is worse at deadlines than anything else in the app — see _What this is bad at_.',
        },
      ],
    },
    {
      title: 'The three session types, and what each is for',
      content: [
        {
          kind: 'p',
          text: 'Everything here is one of three things plus rest. The menus inside them are choices, not prescriptions: pick from them, do not do all of them.',
        },
        {
          kind: 'table',
          head: ['Session', 'What it is', 'How often'],
          rows: [
            ['Climbing Session', 'Bouldering, sport or trad. Movement and volume, at whatever intensity the day deserves.', 'The bulk of the week, whatever that number is'],
            ['Strength & Conditioning', 'Pull, push, core, legs and prehab. Five menus, each with a rule of thumb attached.', 'One to two, off the wall or after climbing'],
            ['Hangboard / Finger', 'One finger protocol, warmed up, with antagonist work straight after.', 'At most twice, never on consecutive days'],
            ['Rest / Recovery', 'A logged rest day is training. The app counts it as one because adaptation happens there.', 'As many as the rest asks for'],
          ],
        },
        {
          kind: 'p',
          text: 'The single most common mistake in open-ended training is doing the Strength session because it is Tuesday, on a day the climbing already asked for the same muscles. Pull work after a hard bouldering session is a third helping of the same stimulus. The menus say so — _"skip entirely on climbing-heavy days"_ — and it is worth repeating here, because a menu is easy to read as a list of things owed.',
        },
      ],
    },
    {
      title: 'The two rules that are not optional',
      content: [
        {
          kind: 'p',
          text: 'Most of this mode is a menu. Two things are not.',
        },
        {
          kind: 'warn',
          title: 'Fingers',
          items: [
            'Half crimp or open hand only. Never full crimp on a hangboard.',
            'Ten minutes of climbing or a hang ladder before any maximal work. No exceptions, and the warm-up is not the session.',
            '**48 hours between hangboard sessions.** The app enforces this one — it is declared as a rule, not written as advice, so the planner and the log both know it.',
            'One protocol per session. Never stack two.',
            'Stop at any sharp finger pain. Not soreness afterwards — sharpness during.',
            'If you do not know your max, run IRON GRIP first. Do not guess a load on a hangboard.',
          ],
          footer: 'Hangboarding is the most injury-prone self-directed work in climbing, and the injuries are slow to heal and quick to recur.',
        },
        {
          kind: 'warn',
          title: 'Antagonists',
          items: [
            'Push work and prehab are not bodybuilding. Climbers are chronically pull-dominant and the shoulder pays for it.',
            'Ten to fifteen minutes, once or twice a week, is the whole dose. Light weight, high reps, honest form.',
            'Pair prehab with every hangboard session rather than saving it for a day that never comes.',
          ],
          footer: 'Golfer’s elbow, tennis elbow and rotator cuff trouble are the three things that end more seasons than falling off does, and all three trace back to skipping this.',
        },
      ],
    },
    {
      title: 'What stops this becoming the same session forever',
      content: [
        {
          kind: 'p',
          text: 'This is the real risk of open-ended training, and it is worth naming plainly: with nothing telling you what changes this week, nothing changes. Adaptation stops when the stimulus stops changing, and a year of identical Tuesdays is the most common way a climber plateaus without noticing.',
        },
        {
          kind: 'p',
          text: 'Four things in the app are watching for it on your behalf, and they work here exactly as they do inside a block.',
        },
        {
          kind: 'list',
          items: [
            '**The load ratio.** Your week against your own four-week baseline. It is the same number a program would be managing for you, and here you are managing it — which mostly means noticing when a good month has quietly become a hard one.',
            '**Coach\'s Corner.** Standing observations, not a weekly summary. It reads the same log a program would and does not care whether you are running one.',
            '**The grade pyramid.** The shape of what you send. Open-ended training drifts toward one grade, and the pyramid is where that shows first.',
            '**Benchmarks.** Seven of them here. Retest every eight to twelve weeks; without a block boundary to prompt it, nothing else will.',
          ],
        },
        {
          kind: 'note',
          text: 'Pick one thing to change every four to six weeks and write down what it was. A different angle, a different hold type, a new drill, more volume at one grade below your limit. The change matters more than which change it is.',
        },
      ],
    },
    {
      title: 'What this is bad at',
      content: [
        {
          kind: 'p',
          text: 'Written out rather than implied, because an app that only lists what a thing is good for is selling rather than coaching.',
        },
        {
          kind: 'list',
          items: [
            '**Peaking for a date.** There is no taper here and nothing arranges the weeks before a trip. If you have a date, TRIP PREP is four weeks and PEAK PERFORMANCE is twelve.',
            '**Fixing a named weakness.** A focused block beats general training at one thing by a wide margin. Fingers, IRON GRIP. Endurance, THE LONG GAME. Power, GRAVITY DEFIED.',
            '**Progressive overload.** A program moves the dose week to week and writes down what it moved. Here nothing does, and "add a bit when it feels easy" is how most people stay the same.',
            '**Telling you when to back off.** A block schedules its deload weeks. This does not, and the week you most need one is the week you feel strongest.',
          ],
        },
        {
          kind: 'p',
          text: 'None of that is an argument against training this way. It is the list of what to watch yourself for, which is what you took on when you chose the mode.',
        },
      ],
    },
    {
      title: 'When to leave',
      content: [
        {
          kind: 'p',
          text: 'There is nothing to graduate from. There are three reasonable reasons to pick a block, and one bad one.',
        },
        {
          kind: 'list',
          items: [
            'You have a date — a trip, a season, a project with weather. Pick the block that ends on it.',
            'You have found the limiter. Twelve focused weeks will move it further than a year of general work.',
            'You are bored of deciding. That is a real reason, and a program is a machine for not having to.',
          ],
        },
        {
          kind: 'note',
          text: 'The bad reason: a flat month. One flat month is a flat month. Change one thing here and give it four weeks before you conclude the mode is the problem.',
        },
        {
          kind: 'p',
          text: 'Whenever you go, the history goes with you. Starting a program does not reset anything — your grades, your projects, your benchmarks and your altimeter carry straight across, and the block begins with everything the log already knows about you.',
        },
      ],
    },
  ],
};
