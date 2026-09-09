import type {
  InputHTMLAttributes,
  ReactNode,
  Ref,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react';
import { useId } from 'react';

/**
 * Form controls, styled once.
 *
 * `w-full bg-sunken border border-line rounded-xl px-3 py-2.5 text-sm` was
 * declared as a local `const input` in ten separate feature files, and the
 * copies had already drifted — some `px-2.5`, some without `w-full`, some
 * without `text-sm`. There were 76 raw `<input>`, `<select>` and
 * `<textarea>` elements across features, none of them with a focus ring
 * beyond the browser default.
 *
 * `Field` also solves the labelling problem properly. Most call sites were
 * using `aria-label`, which works but leaves nothing for a pointer user to
 * tap and nothing on screen for anyone who needs the name to stay visible.
 * A real `<label>` tied by id does both.
 */

const CONTROL =
  'focus-ring w-full bg-sunken border border-line text-ink placeholder:text-ink-soft disabled:opacity-50';

/**
 * Two sizes, because the climb-entry row fits four controls across a 320px
 * phone and the standard one does not. `compact` is still 40px tall, which
 * is past the 24px WCAG floor; anything smaller would not be.
 *
 * A size *prop* rather than a class override at the call site: `text-xs`
 * and `text-sm` have equal specificity, so which one wins depends on the
 * order Tailwind happens to emit them in, not on the order they are
 * written. That is a coin flip, and it has no business deciding type size.
 */
const SIZE = {
  md: 'rounded-xl px-3 py-2.5 text-sm min-h-11',
  compact: 'rounded-lg px-2.5 py-2 text-sm min-h-10',
} as const;

type ControlSize = keyof typeof SIZE;

export interface FieldProps {
  label: ReactNode;
  /** Shown under the label, and tied to the control by `aria-describedby`. */
  hint?: ReactNode;
  children: (props: { id: string; 'aria-describedby': string | undefined }) => ReactNode;
  className?: string;
}

export function Field({ label, hint, children, className = '' }: FieldProps) {
  const id = useId();
  const hintId = hint === undefined ? undefined : `${id}-hint`;
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm text-ink-soft mb-1">
        {label}
      </label>
      {hint !== undefined && (
        <p id={hintId} className="text-xs text-ink-soft mb-1.5 leading-relaxed">
          {hint}
        </p>
      )}
      {children({ id, 'aria-describedby': hintId })}
    </div>
  );
}

export function Input({
  className = '',
  size = 'md',
  ref,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> & {
  size?: ControlSize;
  ref?: Ref<HTMLInputElement>;
}) {
  return <input ref={ref} className={`${CONTROL} ${SIZE[size]} ${className}`} {...rest} />;
}

export function Select({
  className = '',
  size = 'md',
  ...rest
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> & { size?: ControlSize }) {
  return <select className={`${CONTROL} ${SIZE[size]} ${className}`} {...rest} />;
}

export function TextArea({
  className = '',
  size = 'md',
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { size?: ControlSize }) {
  return <textarea className={`${CONTROL} ${SIZE[size]} resize-y ${className}`} {...rest} />;
}

/**
 * A checkbox with its label.
 *
 * The hand-rolled version was a `<button>` with a tick glyph inside — which
 * looks right, has the correct `aria-label`, and is still announced as a
 * button rather than as a checkbox, so nothing tells you whether it is
 * ticked or that space toggles it. A real input with `appearance-none` gets
 * the semantics for free and keeps the look.
 */
export function Checkbox({
  checked,
  onChange,
  label,
  className = '',
}: {
  checked: boolean;
  onChange: () => void;
  /** The visible label. Also the accessible name. */
  label: ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <span className={`flex items-start gap-2.5 ${className}`}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="focus-ring appearance-none w-5 h-5 shrink-0 mt-0.5 rounded border border-line bg-sunken checked:bg-accent checked:border-accent relative after:absolute after:inset-0 after:flex after:items-center after:justify-center after:text-accent-ink after:text-xs after:leading-none checked:after:content-['✓']"
      />
      <label htmlFor={id} className={`flex-1 text-sm leading-relaxed ${checked ? 'opacity-60' : ''}`}>
        {label}
      </label>
    </span>
  );
}
