import { useMemo } from 'react';
import { SKIN_TONES, type AvatarPalette } from '@/engine/avatar';
import { OUTFITS, earnedOutfits, freeOutfits, shopOutfits, type Outfit } from '@/engine/kits';
import { cosmeticSources } from '@/engine/skills';
import { SKILL_TREES } from '@/content/skills';
import { useCurrency, useGame, useOwned } from '@/store/game';
import { useProfile } from '@/store/profile';
import { useSkillEffects } from '@/store/skills';
import { Card } from '@/ui/Card';
import { SelectableCard, Swatch } from '@/ui/Chip';

/**
 * The only stored part of the avatar. Everything else — gear, ground,
 * posture — is derived, so this card is short by design.
 *
 * On the Game tab since M118; it was on the climber page, beside the stats
 * the coach reads, which is the mixing the split undid.
 */
export function AppearanceCard({ palette }: { palette: AvatarPalette }) {
  const setPalette = useProfile((s) => s.setAvatarPalette);
  const currency = useCurrency();
  const owned = useOwned();
  const buy = useGame((state) => state.buy);
  const cosmetics = useSkillEffects().cosmetics;
  const unlocked = useMemo(() => new Set(cosmetics.map((c) => c.id)), [cosmetics]);
  const activeOutfit = OUTFITS.find(
    (o) => o.top === palette.top && o.shorts === palette.shorts && o.shoes === palette.shoes,
  );

  const wear = (outfit: Outfit) =>
    setPalette({ top: outfit.top, shorts: outfit.shorts, shoes: outfit.shoes, gear: outfit.gear });

  return (
    <Card title="Appearance">
      <p className="text-xs text-ink-soft mb-3 leading-relaxed">
        Gear, ground and posture come from your training. These are yours to pick.
      </p>

      <div className="mb-3">
        <div className="text-2xs font-bold uppercase tracking-widest text-ink-soft mb-1.5">Skin</div>
        <div className="flex flex-wrap gap-2">
          {SKIN_TONES.map((tone) => (
            <Swatch
              key={tone}
              active={palette.skin === tone}
              onClick={() => setPalette({ skin: tone })}
              label={`Skin tone ${tone}`}
              color={tone}
            />
          ))}
        </div>
      </div>

      <KitRow
        title="Kit"
        outfits={freeOutfits()}
        active={activeOutfit?.name}
        onWear={wear}
      />

      {/* Earned, and only earned. A capstone granting a kit that was free to
          everyone from the first run is not a reward (PLAN.md M62). */}
      <KitRow
        title="Earned"
        note="Unlocked by the skill trees. Nothing here can be bought."
        outfits={earnedOutfits()}
        active={activeOutfit?.name}
        locked={(outfit) => !unlocked.has(outfit.unlock ?? '')}
        lockNote={(outfit) => unlockNote(outfit.unlock ?? '')}
        onWear={wear}
      />

      {/* The only thing in the app that costs anything, and it is paint. */}
      <KitRow
        title="Bought"
        note={`${currency.balance.toLocaleString()} coins. Cosmetic only — nothing here trains for you.`}
        outfits={shopOutfits()}
        active={activeOutfit?.name}
        locked={(outfit) => !owned.includes(outfit.name)}
        lockNote={(outfit) => `${(outfit.price ?? 0).toLocaleString()} coins`}
        onBuy={(outfit) => {
          void buy(outfit, currency.balance).then((bought) => {
            if (bought) wear(outfit);
          });
        }}
        canBuy={(outfit) => currency.balance >= (outfit.price ?? 0)}
        onWear={wear}
      />
    </Card>
  );
}

/** What the tree calls the node that grants a cosmetic, for the lock note. */
const COSMETIC_SOURCE = cosmeticSources(SKILL_TREES);

function unlockNote(id: string): string {
  const label = COSMETIC_SOURCE[id];
  return label ? `Earned by ${label}` : 'Earned in the skill trees';
}

function KitRow({
  title,
  note,
  outfits,
  active,
  locked,
  lockNote,
  canBuy,
  onBuy,
  onWear,
}: {
  title: string;
  note?: string;
  outfits: Outfit[];
  active?: string | undefined;
  locked?: (outfit: Outfit) => boolean;
  lockNote?: (outfit: Outfit) => string;
  canBuy?: (outfit: Outfit) => boolean;
  onBuy?: (outfit: Outfit) => void;
  onWear: (outfit: Outfit) => void;
}) {
  if (outfits.length === 0) return null;
  return (
    <div className="mt-3">
      <div className="text-2xs font-bold uppercase tracking-widest text-ink-soft mb-1.5">{title}</div>
      {note && <p className="text-xs text-ink-soft mb-2 leading-relaxed">{note}</p>}
      <div className="grid grid-cols-3 gap-2">
        {outfits.map((outfit) => {
          const shut = locked?.(outfit) ?? false;
          const buyable = shut && onBuy !== undefined && (canBuy?.(outfit) ?? false);
          const detail = shut ? (lockNote?.(outfit) ?? 'Locked') : undefined;
          return (
            <SelectableCard
              key={outfit.name}
              selected={active === outfit.name}
              onClick={() => {
                if (!shut) onWear(outfit);
                else if (buyable) onBuy?.(outfit);
              }}
              disabled={shut && !buyable}
              label={
                shut
                  ? `${outfit.name}: ${buyable ? `buy for ${detail}` : detail}`
                  : `Kit: ${outfit.name}`
              }
              className={`bg-sunken px-2 py-2 ${shut && !buyable ? 'opacity-55' : ''}`}
            >
              {/* All four, not three. `gear` was missing until M213, and it
                  is the colour that carries most on a climber high enough to
                  afford the late kits: at level 40 the figure is wearing a
                  harness, a rope and a helmet, all of it drawn in this one. */}
              <div className="flex gap-1 mb-1.5">
                {[outfit.top, outfit.shorts, outfit.shoes, outfit.gear].map((color) => (
                  <span
                    key={color}
                    className="w-4 h-4 rounded border border-line"
                    style={{ background: color }}
                  />
                ))}
              </div>
              <span className="text-xs font-semibold">{outfit.name}</span>
              {detail && (
                <span className="block text-2xs text-ink-soft leading-tight mt-0.5">
                  {buyable ? `Buy · ${detail}` : detail}
                </span>
              )}
            </SelectableCard>
          );
        })}
      </div>
    </div>
  );
}
