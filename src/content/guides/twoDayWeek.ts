import type { Guide } from './types';

/**
 * The guide for Two Days a Week (PLAN.md M95).
 *
 * Written short on purpose. A guide explains a program; it does not define
 * one, and the programs in this catalogue already carry their reasoning in
 * their phase descriptions and block rationales. What this adds is the part
 * a climber needs *before* they start and cannot read off a session card:
 * who it is for, what the week looks like, and what to do when the week
 * does not happen.
 */
export const TWO_DAY_WEEK: Guide = {
  id: 'two_day_week',
  name: 'TWO DAYS A WEEK',
  subtitle: '12 Weeks on Two Sessions',
  sections: [
    {
      title: 'Introduction',
      content: [
        { kind: 'quote', text: 'Twelve weeks of two honest sessions beats four weeks of five and eight weeks of none.' },
        { kind: 'p', text: 'Most training programs are written for people with four free evenings. Most climbers have two. This is not one of those programs with half the days taken out — that leaves a climber doing a third of the work and none of the progression.' },
        { kind: 'p', text: 'Two days a week is twenty-four climbing sessions in twelve weeks. That is enough to move a grade if every one of them counts, and it is not enough for a single wasted session. Everything here follows from that.' },
        { kind: 'h', text: 'Who This Program Is For' },
        {
          kind: 'table',
          head: ['Profile', 'Description'],
          rows: [
            ['The Working Climber', 'Two evenings, or one evening and a weekend morning. Reliably. That reliability is the whole asset.'],
            ['The Returning Parent', 'Time is short and unpredictable. The third day here is optional by design, not by apology.'],
            ['The Long-Haul Trainer', 'You have run four-day blocks and stopped finishing them. Two days you actually do beats four you plan.'],
          ],
        },
        { kind: 'note', text: 'If you have three or more days most weeks, run Base Camp instead. This program deliberately leaves work out, and with a third day you can afford not to.' },
      ],
    },
    {
      title: 'Both Days Climb',
      content: [
        { kind: 'p', text: 'The first draft of this program spent one of the two days on strength — hangboard, pull-ups, prehab — and one on climbing. That is a common way to write a two-day plan and it is the wrong one.' },
        { kind: 'p', text: 'A climber who climbs once a week for twelve weeks gets stronger and worse. Movement is the first thing to go and the slowest to come back, and a program that trains the pull while the climbing atrophies is a gym program with a climbing name on it.' },
        { kind: 'p', text: 'So both committed days climb. The strength work did not disappear — it moved to the end of the climbing sessions, which is the only place it can go for someone with two days. Nothing about the weekly dose changed: fingers once a week, pull once a week, prehab once a week. What changed is that climbing went from once to twice.' },
        {
          kind: 'table',
          head: ['Day', 'Climbing', 'After'],
          rows: [
            ['**Climb & Apply**', 'The hard day. Working climbs, then limit burns, then projects.', 'Fingers — repeaters, short.'],
            ['**Climb & Build**', 'The volume day. Varied terrain, well inside your limit.', 'Pull, then the prehab.'],
            ['**Easy Volume**', 'Optional third day. No agenda, nothing measured.', 'Nothing.'],
          ],
        },
        { kind: 'p', text: 'Fingers ride with the hard day so that neither session asks them for a maximum effort twice in a week. The pull rides with the volume day because that is the day with room for a long tail of work.' },
      ],
    },
    {
      title: 'The Week',
      content: [
        { kind: 'p', text: 'Two sessions, at least forty-eight hours apart in **both** directions. Tuesday and Saturday is the shape the app recommends; Monday and Thursday works as well. Two days that touch — Friday and Saturday — do not, because the second one is climbing on the first one\'s fatigue and neither gets what it was for.' },
        { kind: 'h', text: 'When the week does not happen' },
        { kind: 'list', items: [
          'One session instead of two: make it **Climb & Apply**. The app will say the same thing — it is the session marked to survive a short week.',
          'Neither session: the week is a blank, not a failure. Pick the block up where it was rather than restarting it.',
          'Three sessions: the third is easy climbing and nothing else. Do not add a second hard day — the program is built on there being one.',
        ]},
        { kind: 'note', text: 'Twelve weeks at two days accumulates fatigue slowly, which is why there is one deload and not three. Week 8 is it.' },
      ],
    },
    {
      title: 'The Twelve Weeks',
      content: [
        { kind: 'p', text: 'Two sessions in every one of them. The app marks the deload for you; it is here so you can see it coming.' },
        {
          kind: 'table',
          head: ['Week', 'Phase', 'The hard day'],
          rows: [
            ['1', 'Groove', 'Working climbs, two grades down. Find the grade you can repeat.'],
            ['2', 'Groove', 'Same. Volume over intensity.'],
            ['3', 'Groove', 'Same, a little more of it.'],
            ['4', 'Groove', 'Week four should look like week one, on the calendar and in your fingers.'],
            ['5', 'Build', 'Limit burns. Fewer, harder, longer rests.'],
            ['6', 'Build', 'Add load to the hangboard, or to the pull.'],
            ['7', 'Build', 'The hardest week of the phase.'],
            ['8', 'Build', 'Deload. Three burns, two grades down — not a week off.'],
            ['9', 'Sharpen', 'Pick the project. Strength drops to maintenance.'],
            ['10', 'Sharpen', 'Burns on the project, with easy climbing either side.'],
            ['11', 'Sharpen', 'The week to send it.'],
            ['12', 'Sharpen', 'Finish fresher than you started. Retest what you measured in week 1.'],
          ],
        },
      ],
    },
    {
      title: 'The Three Phases',
      content: [
        { kind: 'h', text: 'Groove — weeks 1 to 4' },
        { kind: 'p', text: 'Getting the two sessions to actually happen, at a load your body will not resent. Volume over intensity. The goal of this phase is that week four looks like week one, on the calendar and in your fingers.' },
        { kind: 'h', text: 'Build — weeks 5 to 8' },
        { kind: 'p', text: 'The load phase. The hard day gets harder and shorter; the strength work adds a set rather than a session, because there is no room for another day. Week 8 is the deload — and it is a deload, not a week off.' },
        { kind: 'h', text: 'Sharpen — weeks 9 to 12' },
        { kind: 'p', text: 'Spend it. Strength drops to maintenance and the hard day gets the whole tank. Four weeks of projecting at the top of your grade, with enough finger work to keep what you built.' },
      ],
    },
    {
      title: 'Before You Start',
      content: [
        {
          kind: 'warn',
          title: 'STOP THE SESSION IF YOU FEEL',
          items: [
            'Sharp or stabbing pain in a finger, elbow or shoulder',
            'A pop, click or sudden give in a finger — stop climbing entirely, not just the exercise',
            'Pain that is worse the next morning than it was that evening',
          ],
          footer: 'Two sessions a week gives you a lot of recovery. Soreness that outlasts it is a signal, not a phase.',
        },
        { kind: 'p', text: 'The hangboard work here is submaximal by design. If you have never hung before, do the first four weeks on the largest edge you have, bodyweight or assisted, and take the whole of Groove to find out what your fingers tolerate. Nobody has ever regretted starting a hangboard too light.' },
        { kind: 'p', text: 'If you have no hangboard at all, the program still runs: the finger work becomes easy traversing on the biggest holds you can find, and the pull carries the strength progression instead.' },
      ],
    },
  ],
};
