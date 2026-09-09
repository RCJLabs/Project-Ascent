import type {
  InputHTMLAttributes,
  ReactNode,
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
  'focus-ring w-full bg-sunken border border-line rounded-xl px-3 py-2.5 text-sm min-h-11 text-ink placeholder:text-ink-soft disabled:opacity-50';

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

export function Input({ className = '', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`${CONTROL} ${className}`} {...rest} />;
}

export function Select({ className = '', ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={`${CONTROL} ${className}`} {...rest} />;
}

export function TextArea({ className = '', ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`${CONTROL} resize-y ${className}`} {...rest} />;
}
