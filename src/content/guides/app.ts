import type { Guide } from './types';

/**
 * The app guide — rewritten, not ported.
 *
 * The prototype's version ran to 48 sections and about half of them
 * documented systems this app does not have: an armory, a shop, gear sets,
 * a garage, an exploration map, a card battler, sponsors, a gym tycoon
 * mode, a pro team, routesetting, a companion, the Headwall, a season pass,
 * friends and a leaderboard, an AI coach and an AI program builder. Porting
 * that would have been worse than having no guide, because a guide that
 * describes features you cannot find teaches a climber not to trust it.
 *
 * Two sections were worth keeping and neither was about the app — Climbing
 * 101 and the first-day walkthrough. They are their own guide now
 * (`starting.ts`), where a climber who has never tied in can find them
 * without reading about XP first.
 *
 * What follows is written against the app as it actually is. The rule for
 * every claim here: if a test or a module doc does not back it, it does not
 * go in. Numbers quoted from the economy, the load engine and the game cap
 * are asserted against their sources in guides.test.ts.
 */
export const APP: Guide = {
  id: 'app_guide',
  name: 'Using the App',
  subtitle: 'What every part of it does, and the rules it will not break.',
  sections: [
    {
      title: 'What this app is',
      content: [
        { kind: 'quote', text: 'A training log that keeps score honestly, and a climber that grows out of it.' },
        {
          kind: 'p',
          text: 'It is three things at once. A **training log** — sessions, climbs, projects, assessments, notes. A **program runner** — eleven programs, a finder to pick one, a calendar that places the weeks. And a **character** that grows out of the log rather than beside it: levels, stats, skill trees, an altimeter and a career timeline, all derived from what you actually did.',
        },
        {
          kind: 'p',
          text: 'The third part is the one that usually goes wrong in apps like this, so it is worth saying how it is kept honest. Every number about you is **derived from the log, never stored**. There is no hidden score to drift out of step, no way to award yourself anything, and no button that says "mark done". If the app says you sent 40 boulders at V4, it is because forty rows in your log say so.',
        },
        {
          kind: 'h',
          text: 'Fully offline',
        },
        {
          kind: 'list',
          items: [
            '**No account, no sign-in.** There is nobody to be.',
            '**Nothing leaves the device.** No analytics, no sync, no server. The app works in aeroplane mode because there is nothing for it to reach.',
            '**No AI.** No API key, no model, nothing generated at runtime. Where the app appears to give an opinion — the coach, the plateau diagnosis, the finder — it is running rules over your numbers, and every one of them shows its reasoning.',
            '**That also means there is no cloud copy.** Export a backup from Settings now and then. Clearing site data would take the lot.',
          ],
        },
        {
          kind: 'warn',
          title: 'BEFORE YOU TRAIN',
          items: [
            'This is training software, not a coach and not a clinician.',
            'Hangboarding and campusing injure fingers and elbows when loaded too soon.',
            'Warm up, stop when something hurts, and see a physiotherapist for anything that persists.',
          ],
          footer: 'You are responsible for what you do on the wall. The app can only count.',
        },
      ],
    },
    {
      title: 'Getting around',
      content: [
        { kind: 'p', text: 'Five things live in the bar at the bottom. Everything else is one tap from those.' },
        {
          kind: 'table',
          head: ['Tab', 'What is there'],
          rows: [
            ['Home', 'Today at a glance — your climber, what is planned, the live session bar, and whatever the app currently has to say.'],
            ['Train', 'The program catalogue, the finder, your own programs, and objectives.'],
            ['Calendar', 'The plan across weeks, and where you move sessions around.'],
            ['Projects', 'Climbs you are working, with their burns, high points and timelines.'],
            ['Progress', 'Grades, training load, the journal, assessments, career and the year in review.'],
          ],
        },
        { kind: 'h', text: 'Worth knowing where they are' },
        {
          kind: 'list',
          items: [
            '**Your climber** — tap the avatar on Home. Stats, level, vitality, rank, and anything that hurts.',
            '**Skill trees** — from the climber page. Every node unlocks from real training.',
            "**Coach's Corner** — standing observations about your training, from Home.",
            '**The weekly review** — Sunday, and any past week you want to reread.',
            '**Settings** — themes, grade scales, sound, equipment, backups, and these guides.',
          ],
        },
      ],
    },
    {
      title: 'Logging a session',
      content: [
        { kind: 'p', text: 'The log is the foundation. Everything else in the app is arithmetic on it.' },
        {
          kind: 'list',
          items: [
            '**Open a day** from the calendar, or tap Today.',
            '**Say what it was** — a program session, or free climbing. Indoors or outdoors.',
            '**Add climbs** — grade, how many, sent or attempted, and the style if you flashed or onsighted it.',
            '**Rate it** — RPE from 1 to 10, and how long it took. These two are what training load is made of, so guessing them roughly is much better than leaving them out.',
            '**Notes** — anything. They all end up in the journal, searchable.',
          ],
        },
        {
          kind: 'note',
          text: 'Start a session on the day it happens and the app runs a clock for it, with a bar at the top of every screen. Forget to close it and it goes stale rather than logging a nine-hour session — you get asked how long it really was.',
        },
        { kind: 'h', text: 'Fixing a session you got wrong' },
        {
          kind: 'list',
          items: [
            '**Wrong day** — re-date it from the session itself. Its duration comes with it; the clock does not, because a Tuesday logged on Thursday has no clock.',
            '**Logged twice** — merge them. RPE is averaged by duration so the training load of the merged session is exactly what the two were worth.',
            '**A day with two sessions** — supported. Switch between them at the top of the day.',
            '**A session you keep repeating** — save it as a template. Templates carry the shape, never the climbs.',
          ],
        },
      ],
    },
    {
      title: 'Programs',
      content: [
        {
          kind: 'p',
          text: 'Eleven of them: nine structured blocks, most twelve weeks across three or four phases, plus two log-only modes for when you are not running a block. Each block has a guide in this list explaining why it is built the way it is.',
        },
        { kind: 'h', text: 'Finding one' },
        {
          kind: 'p',
          text: 'The finder asks seven questions — what you climb, how long you have climbed, what grade, what you want, days a week, what equipment you have, and whether anything hurts — and scores every program against the answers. It shows the reasoning, and it is never a dead end: something is always recommended, with the reason it was picked and the reason the runners-up were not.',
        },
        { kind: 'h', text: 'Starting one' },
        {
          kind: 'list',
          items: [
            '**Pick your days.** The app checks them against the program\'s own rules before you commit — two finger sessions 24 hours apart gets flagged then, not in week six.',
            '**Pick a track** where the program has them, and the plan only shows you your own lines.',
            '**Then the calendar fills in.** Nothing is written to those future days: the plan is derived from the program, your start date and your chosen week, so changing any of them re-derives the future immediately.',
          ],
        },
        { kind: 'h', text: 'Changing the plan' },
        {
          kind: 'list',
          items: [
            '**Move a session** in the calendar — pick it, then place it. It swaps with whatever is there and warns you if the move breaks a rule that was not already broken.',
            '**Only the current week and later.** Past weeks are what happened.',
            '**Write your own** from the builder — blank, or a fork of any program to change. A finished program can be shared as a file, and imported ones are rebuilt from scratch rather than trusted.',
          ],
        },
      ],
    },
    {
      title: 'Training load, and the brake',
      content: [
        {
          kind: 'p',
          text: 'Every session produces a load figure: **RPE × hours**. The app compares your last 7 days against your 28-day average — the acute:chronic workload ratio — and that number drives more of the app than anything else you cannot see.',
        },
        {
          kind: 'p',
          text: 'The bands are in the Injury Management guide. What matters here is what the app does with them: when your load is spiking, the **effort bonus is switched off**. Rate a session RPE 10 in the danger zone and you get no multiplier for it.',
        },
        {
          kind: 'quote',
          text: 'The app will not pay you a bonus for digging the hole deeper, and it says so in the toast.',
        },
        {
          kind: 'note',
          text: 'ACWR stays blank until there is enough history to mean something — three weeks of calendar and enough sessions inside it. Three weeks with two sessions in them produces arithmetic like 4.0, which is true division and no information.',
        },
      ],
    },
    {
      title: 'Your climber',
      content: [
        {
          kind: 'p',
          text: 'A character sheet with no character creation. Everything on it is read out of the log.',
        },
        { kind: 'h', text: 'The five stats' },
        {
          kind: 'table',
          head: ['Stat', 'Fed by'],
          rows: [
            ['Strength', 'Fingers, pulling power, and the hardest thing you have held.'],
            ['Endurance', 'Time on the wall, volume, and weeks that held together.'],
            ['Technique', 'Drills, breadth of grades and styles, and clean first goes.'],
            ['Mental', 'History, consistency, projects finished, and days on real rock.'],
            ['Mobility', 'Flexibility, shoulder health, and committing to movement.'],
          ],
        },
        {
          kind: 'p',
          text: 'Each stat shows its own arithmetic — "34 = base 10 + max hang 12 + hard sends 9 + pull-ups 3". They are deliberately slow: a full cap is around 200 sessions or a thousand sends, so six months of good training reads in the mid-fifties and there is somewhere left to go.',
        },
        { kind: 'h', text: 'Vitality' },
        {
          kind: 'p',
          text: 'The bar under the avatar. It drains for consecutive training days, skipped warmups and untreated injuries, and a rest day inside 24 hours softens the damage.',
        },
        {
          kind: 'note',
          text: 'It gates nothing. You can train at any vitality, and the app will not stop you. An app that locked a session behind a resource bar would be coaching the bar instead of the climber — what this does is make the cost of grinding visible and give resting something to show for it.',
        },
      ],
    },
    {
      title: 'Levels, XP and what pays',
      content: [
        {
          kind: 'p',
          text: 'Awards are priced as a **fraction of a level**, not as flat points, so progress feels the same at level 5 and level 50. Levels get wider as you climb; what a session is worth grows with them.',
        },
        {
          kind: 'table',
          head: ['Action', 'Worth'],
          rows: [
            ['Logging a session', '15% of a level'],
            ['Warming up', '5%'],
            ['Finishing the session\'s drill', '3%'],
            ['A logged rest day', '3.75%'],
            ['A send', '1%, plus 0.5% per grade'],
            ['A new personal record', '50%'],
            ['Sending a project', '40%'],
          ],
        },
        {
          kind: 'p',
          text: 'On top of those: **outdoors** pays a little more, a **flash** is worth half again and an **onsight** double, and RPE adds an effort bonus — unless your load is spiking, in which case it does not.',
        },
        { kind: 'h', text: 'The rule the whole economy rests on' },
        {
          kind: 'quote',
          text: 'No game action can ever pay more than 7.5% of a level — half of what showing up and training pays.',
        },
        {
          kind: 'p',
          text: 'That is a hard cap in code, not a tuning choice. Playing The Ascent, clearing the board, any of it: grinding the game can never beat climbing. A test enforces it.',
        },
        {
          kind: 'note',
          text: 'Nothing is ever paid twice. A session that has already paid out carries a marker, so re-editing it, re-opening the app or reimporting a backup cannot double-count it.',
        },
      ],
    },
    {
      title: 'Skill trees',
      content: [
        {
          kind: 'p',
          text: 'Five trees — Dynamic Power, Static Tension, Endurance, Technique and Mental Grit — each a set of nodes unlocked by a requirement that is real training: sends at a grade, days on rock, hours, drills of a kind, weeks on target, clean first goes.',
        },
        {
          kind: 'p',
          text: 'There are **no skill points**. Nothing is spent and nothing is chosen. A node is unlocked because you did the thing, which makes the tree a map of your training rather than a shop — and means it can never be out of step with the log, because nothing about it is stored.',
        },
        {
          kind: 'note',
          text: 'The requirement vocabulary here is the same one objectives use, so "ten sends at V6" means exactly the same thing in both places and is measured by the same code.',
        },
      ],
    },
    {
      title: 'The board',
      content: [
        {
          kind: 'p',
          text: 'One board with three shapes on it: a **daily** quality task, a **weekly** set scaled to your own numbers, and **bounties** you accept for something bigger.',
        },
        {
          kind: 'p',
          text: 'There is no "mark done". A challenge completes because the sessions say so, which is why the board cannot be gamed without doing the thing. Accept a bounty and it counts sessions from the moment you accepted it — not retroactively.',
        },
        {
          kind: 'table',
          head: ['Shape', 'Worth'],
          rows: [
            ['Daily', '2% of a level'],
            ['Weekly', '4%'],
            ['Bounty', '6%'],
          ],
        },
        {
          kind: 'p',
          text: 'Small on purpose. A full week of everything is worth under three sessions, and a test enforces that — the board is a nudge toward better training, not a second way to earn.',
        },
        {
          kind: 'note',
          text: 'Mark an injury and the board changes: bounties that load the hurt part are not offered, and where a category has a safe option it picks that rather than dropping the category.',
        },
      ],
    },
    {
      title: 'Projects and objectives',
      content: [
        {
          kind: 'p',
          text: 'A **project** is something you are on — burns, a high point, a wall you can get to. Log attempts against it from the session and everything else about it is derived: attempt count, sessions on it, high point over time, the whole timeline.',
        },
        {
          kind: 'p',
          text: 'An **objective** is something you are training *for*, possibly without being able to touch it yet — a named line, a first V8, a trip in October. It is not tracked by attempts. It is tracked by what has to be true before it is realistic, and each of those is measured from the log rather than declared.',
        },
        {
          kind: 'list',
          items: [
            '**Readiness is the average of how far along each requirement is** — not how many are finished. Five requirements each 80% done is a climber nearly there, and calling that 0% would be a lie.',
            '**It tells you the furthest one away**, which is the honest answer to "what now?", and offers a program for it when a program could actually move it.',
            '**Three active at a time.** More than that and none of them is really the objective.',
            '**Marking one done pays nothing.** The session that sent it already paid, and a status you set by hand is not something to be paid for.',
            '**No prediction about your target date.** The app can measure what happened; it cannot tell you how the next three months will go.',
          ],
        },
      ],
    },
    {
      title: 'The altimeter and your career',
      content: [
        {
          kind: 'p',
          text: 'Every send adds real height to one lifetime climb: 15 feet for a boulder, 50 for a route, a quarter more outdoors. The ladder runs from a single gym wall through Half Dome and El Cap to Everest, then stacks the other thirteen eight-thousanders on top.',
        },
        {
          kind: 'quote',
          text: 'No game action adds a single foot, ever.',
        },
        {
          kind: 'p',
          text: 'That is what makes "Everest in eleven months" mean something rather than being a second XP bar. It is also the one place the app projects a finish date, and it earns that by measuring your actual pace over a known window — and it stays coarse on purpose, because "37 weeks" from eight weeks of data implies a precision the data does not have.',
        },
        { kind: 'h', text: 'Career milestones' },
        {
          kind: 'p',
          text: 'The ladder is finite; a climbing career is not. So there is a second, unbounded list: every new hardest grade, session and hour and send and day-on-rock counts on a ladder that widens as the numbers grow, every anniversary of your first logged session, and each named climb again on the next lap.',
        },
        {
          kind: 'p',
          text: 'Every one carries the date the log crossed it. After five years what you have is not a number, it is a list of days.',
        },
      ],
    },
    {
      title: 'What the app tells you',
      content: [
        {
          kind: 'p',
          text: 'Four things talk to you, and they are deliberately separate so they do not repeat each other.',
        },
        {
          kind: 'table',
          head: ['Where', 'What it says'],
          rows: [
            ['Training state', 'One of five verdicts about right now — Recovery first, Too early to tell, Breaking through, Plateaued, or Building — decided by rules in that order, because a climber who is hurt or buried in load does not need to hear about their plateau first. Each shows the evidence it used.'],
            ["Coach's Corner", 'Standing observations about your training as a whole. Dismissible, and a dismissed tip stays gone until the situation actually changes.'],
            ['The weekly review', 'One reading of the week just gone: load against last week, what you sent, how the board went, whether you turned up as often as the program asked, and the week ahead.'],
            ['The year in review', 'The long view, compared like for like against the same stretch of last year.'],
          ],
        },
        {
          kind: 'note',
          text: 'All four are rebuilt from the log every time, so any past week or year can be read exactly, including ones that happened before the feature existed. None of them is a snapshot taken at the time.',
        },
        {
          kind: 'p',
          text: 'They will also tell you when a year was quieter than the last one, or when you have not been on rock since spring. A log you cannot trust to say you climbed less is a log you cannot trust when it says you climbed more.',
        },
      ],
    },
    {
      title: 'Assessments, warmups and the timer',
      content: [
        {
          kind: 'p',
          text: '**Assessments** are the numbers your program is trying to move — max hang, weighted pull-up, max pull-ups, flexibility, and the rest. The app tracks each as a series, charts it, and tells you which are due for a retest based on the program you are running.',
        },
        {
          kind: 'p',
          text: '**Warmups** are generated per session from what it asks of you, what equipment you have, and what you have marked as injured. Anything that loads a hurt part is left out, and if everything available loads it, the app says so rather than quietly handing you a warmup that does.',
        },
        {
          kind: 'p',
          text: '**Protocol timers** run the named methods — repeaters, max hangs, ARC, campus laddering — with their work and rest intervals, cues, and the dose your program week actually asks for rather than the method\'s default.',
        },
      ],
    },
    {
      title: 'When something hurts',
      content: [
        {
          kind: 'p',
          text: 'Mark it on your climber page with a part, a side, a severity and whether you are managing it or coming back from it. That one entry changes the app everywhere:',
        },
        {
          kind: 'list',
          items: [
            'Warmups stop offering anything that loads it.',
            'The finder steers away from programs built around it.',
            'Exercises and drills that load it are flagged in the logger and on the program — as a warning, never a refusal to show you the program.',
            'Bounties that would load it are not offered.',
            'Vitality takes a hit, scaled to how bad it is and eased if you are on the way back.',
          ],
        },
        {
          kind: 'p',
          text: 'Each injury also gets a **return-to-climbing checklist** — things climbers tend to notice on the way back, phrased as questions you answer rather than instructions. Nothing on it prescribes an exercise, a dose or a timeline, and there is a place to write down what an actual clinician told you so it does not get lost.',
        },
        {
          kind: 'warn',
          title: 'WHAT THE CHECKLIST IS NOT',
          items: [
            'It is not a rehabilitation protocol, and ticking a box unlocks nothing.',
            'This app cannot see your injury or tell you when it is better.',
            'A doctor or physiotherapist can. If something hurts, that is a reason to ask one.',
          ],
          footer: 'Ticking them earns no XP, no vitality and no status change. An app that rewarded ticking boxes about your own body would be teaching climbers to lie to it.',
        },
      ],
    },
    {
      title: 'The Ascent',
      content: [
        {
          kind: 'p',
          text: 'A climbing minigame, in the app for the same reason a gym has a bouldering wall by the door. Tap to climb, avoid the falling rock, take the powerups. Free Solo is the hard mode and it has to be earned.',
        },
        {
          kind: 'p',
          text: 'It pays coins and a little XP, once a day, priced on your best run rather than added to per run — so there is no reason to grind it. And it is under the same cap as everything else in the game lane: no more than 7.5% of a level, half of what one session pays.',
        },
        {
          kind: 'note',
          text: 'It adds nothing to the altimeter. Not one foot. The altimeter only moves when you pull on something real.',
        },
      ],
    },
    {
      title: 'Your data',
      content: [
        {
          kind: 'p',
          text: 'It lives in this browser, on this device, and nowhere else. That is the whole privacy model and it is why there is no account.',
        },
        {
          kind: 'list',
          items: [
            '**Export a backup** from Settings — one file with everything, photos included.',
            '**Import it** on another device, or back onto this one.',
            '**Ask for persistent storage** in Settings so the browser does not evict the app under pressure.',
            '**Clearing site data deletes everything.** So does uninstalling, on some platforms. Back up first.',
          ],
        },
        { kind: 'h', text: 'Making it feel like yours' },
        {
          kind: 'list',
          items: [
            '**Grade scales** — read boulders in V or Font, routes in YDS or French. It changes everywhere at once, because grades are stored in one canonical form and only converted for display.',
            '**Theme** — light, dark, or follow the system.',
            '**Sound and haptics** — cues on timers, the board and the minigame. Off is a switch.',
            '**Equipment** — what you actually have. The finder and the warmup generator both read it.',
          ],
        },
      ],
    },
    {
      title: 'Rules this app keeps',
      content: [
        {
          kind: 'p',
          text: 'Worth stating in one place, because they are what makes the numbers worth reading.',
        },
        {
          kind: 'list',
          items: [
            '**Derived, not stored.** Anything that can be worked out from the log is worked out from the log. There is no second copy to drift.',
            '**Nothing is ever paid twice.** Editing, reopening or reimporting cannot double-count a session.',
            '**Climbing always outpays the game.** Enforced by a cap in code, not by tuning.',
            '**No projection that has not been earned.** The altimeter measures a real pace before it estimates anything; nothing else predicts at all.',
            '**Every opinion shows its reasoning.** The finder, the coach and the training state all say why.',
            '**A quiet week reads as a quiet week.** Nothing here reframes a decline as a rebuilding phase.',
            '**Nothing about your body is rewarded.** No XP for ticking a recovery box, and none for marking an objective sent.',
            '**No account, no network, no AI.** There is nothing to sign into and nothing to send.',
          ],
        },
      ],
    },
  ],
};
