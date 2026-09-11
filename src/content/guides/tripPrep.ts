import type { Guide } from './types';

/**
 * The guide for Trip Prep (PLAN.md M95).
 *
 * Short, like the program. The one thing a climber has to understand before
 * starting this is that it is not a training block, and every section here
 * is a way of saying that.
 */
export const TRIP_PREP: Guide = {
  id: 'trip_prep',
  name: 'TRIP PREP',
  subtitle: '4 Weeks Before It Matters',
  sections: [
    {
      title: 'Introduction',
      content: [
        { kind: 'quote', text: 'You cannot get strong in four weeks, and trying is how people arrive injured.' },
        { kind: 'p', text: 'Four weeks before a trip is not a training block. It is a taper with three weeks of sharpening in front of it. The strength you are taking is the strength you already have, and these four weeks exist to make sure you arrive able to use it.' },
        { kind: 'p', text: 'Everything in the catalogue is twelve weeks because twelve weeks is how long adaptation takes. Compressing one into four does not make a short training block — it makes a rushed one. This is a different shape on purpose.' },
        { kind: 'h', text: 'Who This Program Is For' },
        {
          kind: 'table',
          head: ['Profile', 'Description'],
          rows: [
            ['The Trip Climber', 'A week somewhere good, four weeks out. You want to climb well on day one, not day four.'],
            ['The Season Opener', 'Rock season starts next month and you have been indoors since October.'],
            ['The Project Returner', 'You are going back to something specific and you know exactly what it asks for.'],
          ],
        },
        { kind: 'note', text: 'This one is not for a first season. Below the grade range the program states, four weeks is better spent building something than protecting it — run Ground Zero or Base Camp and go on the trip anyway.' },
      ],
    },
    {
      title: 'Specific Means Specific',
      content: [
        { kind: 'p', text: 'The one word that decides whether these four weeks work is **specific**. Generic training is what the twelve-week blocks are for. This block trains the trip.' },
        {
          kind: 'table',
          head: ['If the trip is', 'Climb'],
          rows: [
            ['Steep limestone', 'Steep. Long sequences, poor rests, pockets if you can find them.'],
            ['Slabby granite', 'Slabs. Stand on your feet, trust smears, get used to being scared of nothing.'],
            ['Sandstone highballs', 'Tall problems, topouts, mantels. Rehearse committing.'],
            ['Multi-pitch trad', 'Long days. Pitch after pitch, gear on your harness, shoes off between.'],
          ],
        },
        { kind: 'p', text: 'And rehearse the whole day, not just the moves — pacing, rests, shoes on and off, eating something. The commonest way to climb badly on the first day of a trip is not weakness; it is having forgotten how to spend eight hours at a crag.' },
      ],
    },
    {
      title: 'The Four Weeks',
      content: [
        { kind: 'h', text: 'Sharpen — weeks 1 to 3' },
        { kind: 'p', text: 'Three sessions a week, four if the fourth is easy. Two of them hard at most: six to eight quality burns with real rest, at or just below your limit, on terrain that looks like the trip. Volume stays moderate because there is no time to recover from a big week and no benefit to trying.' },
        { kind: 'p', text: 'Week 3 is the hardest of the block. You should finish it tired but not broken — if you finish it broken, the taper is not long enough to fix it.' },
        { kind: 'h', text: 'Taper — week 4' },
        { kind: 'p', text: 'Volume halves; intensity stays. That is what a taper is. You stay sharp by climbing hard briefly, not by resting completely — a week of total rest arrives at the trip flat.' },
        {
          kind: 'warn',
          title: 'NOTHING NEW IN WEEK 4',
          items: [
            'No new edge size and no new hangboard load',
            'No new exercise, and no first attempt at a protocol',
            'No new angle, no new shoes, no new project',
          ],
          footer: 'The taper is the worst possible week to meet something for the first time. There is nothing left to gain and plenty to lose.',
        },
        { kind: 'p', text: 'This block asks for no test week, for the same reason. A maximum effort in week 4 goes into the record as your strength and costs you the trip it was meant to serve.' },
      ],
    },
    {
      title: 'The Four Weeks',
      content: [
        {
          kind: 'table',
          head: ['Week', 'Phase', 'What it is'],
          rows: [
            ['1', 'Sharpen', 'Find the terrain. Six to eight burns, real rest, nothing heroic.'],
            ['2', 'Sharpen', 'The same, harder. This is the week the specificity should start paying.'],
            ['3', 'Sharpen', 'The hardest week of the block. Tired but not broken.'],
            ['4', 'Taper', 'Half the volume, the same intensity. Nothing new. Travel.'],
          ],
        },
      ],
    },
    {
      title: 'The Week',
      content: [
        { kind: 'p', text: 'The app recommends hard Tuesday, fingers Thursday, easy Saturday. Two rules matter more than the days:' },
        { kind: 'list', items: [
          '**Forty-eight hours between hard sessions**, every week of this block. Three hard sessions in a week is how a four-week block becomes a four-week injury.',
          '**Never hang the day before the session that matters.** The Finger Primer is short and sharp and it costs you the next day — which is fine on a Thursday and ruinous on a Monday.',
        ]},
        { kind: 'p', text: 'Skip the Finger Primer entirely if your fingers are sore from the specific session. It exists to keep them awake, not to train them, and there is nothing in four weeks that a missed hangboard session costs you.' },
      ],
    },
    {
      title: 'Arriving',
      content: [
        { kind: 'p', text: 'Sleep and eat like it is part of the plan, because in week 4 it is the plan. Travel is fatigue: a long drive or a flight the day before climbing is worth a rest day you have already budgeted for.' },
        { kind: 'p', text: 'The measure of whether this worked is not a number. It is whether you climb at your grade on day one instead of day four. Four days of a week-long trip is most of it.' },
        { kind: 'note', text: 'After the trip, the trip tells you what to train. If it was your fingers that ran out, Iron Grip. If it was your endurance, The Long Game. If it was everything, Base Camp.' },
      ],
    },
  ],
};
