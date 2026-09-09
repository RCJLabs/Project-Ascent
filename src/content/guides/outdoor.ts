import type { Guide } from './types';

export const OUTDOOR: Guide = {
  id: 'outdoor_climbing',
  name: 'Outdoor Climbing Guide',
  subtitle: 'Tactics, safety, and performance on real rock.',
  sections: [
    {
      title: 'Projecting Tactics',
      content: [
        { kind: 'p', text: 'Projecting is the process of working a route or boulder problem that is at or above your limit. It requires patience, strategy, and a systematic approach.' },
        { kind: 'list', items: [
          '**Bolt-to-Bolt (Sport):** On your first go, don\'t worry about sending. Climb from bolt to bolt, resting on the rope to figure out the moves and find the best clips.',
          '**Micro-Beta:** Real rock is complex. Pay attention to thumb catches, exact foot placements, and body tension. Brush the holds to find the best texture.',
          '**Link-ups:** Once you know the moves, start linking sections. Try climbing from the crux to the top, or from the ground to the rest before the crux.',
          '**Rest Management:** Rest 10-15 minutes between redpoint burns on sport routes, and 3-5 minutes between hard boulder attempts.',
        ] },
      ],
    },
    {
      title: 'Conditions & Skin Management',
      content: [
        { kind: 'p', text: 'Unlike the gym, outdoor climbing is heavily dependent on weather and skin condition.' },
        { kind: 'list', items: [
          '**Temperature & Humidity:** Cold, dry conditions provide the best friction. Warm, humid conditions make holds feel greasy.',
          '**Skin Care:** Wash your hands after climbing. Use a file to sand down calluses and prevent flappers. Apply climbing salve before bed.',
          '**Taping:** If you get a split or flapper, tape it immediately using climbing tape. For crack climbing, make tape gloves to protect the back of your hands.',
        ] },
      ],
    },
    {
      title: 'Safety & Etiquette',
      content: [
        { kind: 'p', text: 'Safety is paramount outdoors. Always double-check your systems and respect the environment.' },
        { kind: 'list', items: [
          '**Buddy Check:** Always check your partner\'s knot and belay device before leaving the ground.',
          '**Communication:** Establish clear commands before climbing, especially if you won\'t be able to see or hear each other.',
          '**Leave No Trace:** Pack out all trash, including tape and food wrappers. Brush your tick marks off the rock before leaving.',
          '**Crag Dogs:** Keep dogs leashed and quiet, or leave them at home if they are disruptive.',
        ] },
      ],
    },
  ],
};
