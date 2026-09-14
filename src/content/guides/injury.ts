import type { Guide } from './types';

export const INJURY: Guide = {
  id: 'injury_management',
  name: 'Injury Management & ACWR',
  sections: [
    {
      title: 'Understanding ACWR',
      content: [
        { kind: 'p', text: 'The **Acute:Chronic Workload Ratio (ACWR)** compares how hard you have trained in the last week against what you have been used to over the last month. It is the number on the load card, and it is the app\u2019s one summary of whether your training is changing faster than your body is likely to keep up with.' },
        { kind: 'list', items: [
          '**Acute Load:** Your total training volume and intensity over the last 7 days.',
          '**Chronic Load:** Your average weekly training volume and intensity over the last 28 days.',
        ] },
        { kind: 'h', text: 'The ACWR Levels' },
        {
          kind: 'table',
          head: [
            'Ratio',
            'Status',
            'Description',
          ],
          rows: [
            [ '< 0.8', '**Under-training**', 'Your recent load is well below your average. Right for a taper, a deload or a week off; sustained, it is where fitness goes.'],
            [ '0.8 - 1.3', '**The Sweet Spot**', 'Your week looks like the month behind it. Not a guarantee of anything \u2014 it is the band this model treats as ordinary.'],
            [ '1.3 - 1.5', '**Caution Zone**', 'Your load is climbing quickly. Sustainable briefly, not for weeks; worth watching joints and tendons while it is here.'],
            [ '> 1.5', '**Danger Zone**', 'A sharp rise relative to what you are used to. This is what the model exists to flag, and the point at which an easier week is the cheap option.'],
          ],
        },
        { kind: 'h', text: 'What this number is not' },
        {
          kind: 'note',
          text: '**The ratio is contested, and the app uses the contested form of it.** Your last seven days sit inside the twenty-eight the app compares them to \u2014 the same training is on both sides of the division, which creates a relationship between the two numbers that has nothing to do with injury. There is a version that avoids this, comparing the week against the twenty-one days before it, and the thresholds above do not travel to it: on five hard days of a trip this form reads about 3.1 and that one reads about 10.5. The app keeps this form because the bands are the ones calibrated for it \u2014 not because the question is settled.',
        },
        { kind: 'p', text: 'What is not in doubt is the mechanism underneath it: connective tissue adapts more slowly than the muscle that makes a hard session feel possible, so a load that rises faster than the tissue can follow is a real way to get hurt. The ratio is a rough way of noticing that, on numbers you typed in yourself. Treat a reading as a reason to look at your week, never as a diagnosis \u2014 and never as permission, either. Plenty of injuries arrive at 1.0.' },
      ],
    },
    {
      title: 'Injury Prevention Tips',
      content: [
        { kind: 'p', text: 'Preventing injuries is the fastest way to progress in climbing. Consistency beats intensity over the long term.' },
        { kind: 'h', text: '1. The 10% Rule' },
        { kind: 'p', text: 'Avoid increasing your total weekly volume or intensity by more than 10% at a time. Rapid spikes are the primary cause of pulley and tendon issues.' },
        { kind: 'h', text: '2. Proper Warmups' },
        { kind: 'p', text: 'Never skip your warmup. Every session in the log builds one for you, and it already routes around anything you have marked as hurt.' },
        { kind: 'h', text: '3. Antagonistic Training' },
        { kind: 'p', text: 'Climbing is a \'pull-dominant\' sport. Balance your physique by training \'push\' muscles (chest, triceps, shoulders) and wrist extensors to prevent elbow and shoulder imbalances.' },
        { kind: 'h', text: '4. Listen to \'Tweaks\'' },
        { kind: 'p', text: 'A minor \'tweak\' in a finger or shoulder is a warning. If you feel sharp pain, stop immediately. Continuing to climb on a minor injury often leads to months of rehab.' },
      ],
    },
    {
      title: 'Managing Active Injuries',
      content: [
        { kind: 'p', text: 'If you are already injured, your priority shifts from performance to structural integrity.' },
        { kind: 'list', items: [
          '**Log it:** Mark it on your climber page, with a severity and a side. That changes what your warmups load, what the program finder recommends, which bounties you are offered and what the logger flags — not just what you are told.',
          '**Loading:** Tendons respond to load, and complete rest is not automatically the right answer — but what load, and when, depends on what is actually wrong with yours. That is a question for a physiotherapist, not for this app or the internet.',
          '**Deload:** If your ACWR is in the Danger zone when an injury occurs, it\'s a clear sign your body couldn\'t handle the recent volume.',
          '**Sleep:** Tendons have poor blood flow and are slow to remodel. Sleep is the recovery input with the least argument behind it and the one most climbers cut first.',
        ] },
        {
          kind: 'warn',
          title: 'Medical Disclaimer',
          items: [
            'This app records what you did and does arithmetic on it. It cannot see your injury.',
            'It is NOT a substitute for professional medical diagnosis or treatment.',
            'If you suspect a pulley tear or serious joint injury, see a sports physiotherapist immediately.',
          ],
        },
      ],
    },
  ],
};
