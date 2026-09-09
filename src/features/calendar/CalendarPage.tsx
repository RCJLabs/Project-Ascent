import { useEffect, useMemo, useState } from 'react';
import { Link } from 'wouter';
import { BookOpen, ChevronLeft, ChevronRight } from 'lucide-react';
import { getProgram } from '@/content/programs';
import { fromKey, monthGrid, monthLabel, today } from '@/engine/dates';
import { plannedDay } from '@/engine/plan';
import { useProfile } from '@/store/profile';
import { useSessions } from '@/store/sessions';
import { Card } from '@/ui/Card';
import { PageHeader } from '@/ui/PageHeader';

const DAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function JournalLink() {
  return (
    <Link href="/journal" className="text-ink-soft p-1 -m-1" aria-label="Journal">
      <BookOpen size={20} />
    </Link>
  );
}

export function CalendarPage() {
  const now = fromKey(today());
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  const activeProgramId = useProfile((s) => s.activeProgramId);
  const startDates = useProfile((s) => s.startDates);
  const plans = useProfile((s) => s.plans);
  const byDate = useSessions((s) => s.byDate);
  const load = useSessions((s) => s.load);
  const hydrated = useSessions((s) => s.hydrated);

  useEffect(() => {
    if (!hydrated) void load();
  }, [hydrated, load]);

  const program = activeProgramId ? getProgram(activeProgramId) : undefined;
  const startDate = activeProgramId ? startDates[activeProgramId] : undefined;
  const plan = activeProgramId ? plans[activeProgramId] : undefined;

  const days = useMemo(() => monthGrid(year, month), [year, month]);

  function shift(by: number) {
    const d = new Date(year, month + by, 1);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  }

  if (!program || !startDate || !plan) {
    return (
      <>
        <PageHeader title="Calendar" action={<JournalLink />} />
        <Card>
          <p className="text-sm text-ink-soft mb-3">
            No active program yet. Pick one and plan your week, and your sessions will appear here.
          </p>
          <Link href="/find" className="text-accent font-semibold text-sm">
            Find my program →
          </Link>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Calendar" subtitle={program.name} action={<JournalLink />} />

      <div className="flex items-center justify-between mb-3">
        <button onClick={() => shift(-1)} className="p-2 -m-2 text-ink-soft" aria-label="Previous month">
          <ChevronLeft size={20} />
        </button>
        <span className="font-bold">{monthLabel(year, month)}</span>
        <button onClick={() => shift(1)} className="p-2 -m-2 text-ink-soft" aria-label="Next month">
          <ChevronRight size={20} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 mb-1">
        {DAY_INITIALS.map((d, i) => (
          <div key={i} className="text-center text-[10px] font-bold uppercase text-ink-soft py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {days.map((date) => {
          const day = plannedDay(program, startDate, plan, date);
          const logged = byDate[date] ?? [];
          const done = logged.some((s) => s.completed);
          const inMonth = fromKey(date).getMonth() === month;
          const isToday = date === today();
          const planned = day.sessionType && !day.isRest;

          return (
            <Link
              key={date}
              href={`/log/${date}`}
              className={`aspect-square rounded-xl border flex flex-col items-center justify-center gap-0.5 transition-colors ${
                isToday ? 'border-accent' : 'border-line'
              } ${inMonth ? 'bg-surface' : 'bg-transparent opacity-40'} ${
                done ? 'bg-accent/15' : ''
              }`}
            >
              <span className={`text-xs ${isToday ? 'font-black text-accent' : 'text-ink-soft'}`}>
                {fromKey(date).getDate()}
              </span>
              {done ? (
                <span className="text-sm leading-none">✅</span>
              ) : planned ? (
                <span className="text-sm leading-none">{day.sessionType!.icon}</span>
              ) : (
                <span className="text-sm leading-none text-ink-soft/40">·</span>
              )}
              {day.isDeload && inMonth && (
                <span className="text-[8px] font-bold uppercase text-warn leading-none">DL</span>
              )}
            </Link>
          );
        })}
      </div>

      <Card className="mt-4">
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-soft">
          <span>✅ Logged</span>
          <span>{program.sessionTypes.find((t) => !t.isRest)?.icon} Planned session</span>
          <span className="text-warn font-bold">DL — deload week</span>
        </div>
      </Card>
    </>
  );
}
