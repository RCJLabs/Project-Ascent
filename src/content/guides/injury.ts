import type { Guide } from './types';

export const INJURY: Guide = {
  id: 'injury_management',
  name: 'Injury Management & ACWR',
  sections: [
    {
      title: 'Understanding ACWR',
      content: [
        { kind: 'p', text: 'The **Acute:Chronic Workload Ratio (ACWR)** is a powerful metric used by elite athletes and coaches to monitor training load and minimize injury risk. It compares your recent training (Acute Load) to your long-term average (Chronic Load).' },
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
            [ '< 0.8', '**Under-training**', 'Your recent load is significantly lower than your average. This is fine for tapering or deloading, but sustained under-training leads to loss of fitness.'],
            [ '0.8 - 1.3', '**The Sweet Spot**', 'Optimal training load. You are pushing hard enough to make gains while keeping injury risk at a minimum.'],
            [ '1.3 - 1.5', '**Caution Zone**', 'Your training load is increasing rapidly. You are at a higher risk of injury. Monitor joint and tendon health closely.'],
            [ '> 1.5', '**Danger Zone**', 'High risk of injury. You have ramped up too fast. A deload or rest period is highly recommended to prevent overuse injuries.'],
          ],
        },
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
