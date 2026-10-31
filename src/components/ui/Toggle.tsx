"use client";

interface Props {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  id?: string;
}

/** Interruptor: checkbox real con role="switch". El texto es la etiqueta. */
export function Toggle({ checked, onChange, label, id }: Props) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-end gap-2 text-[13px] font-semibold">
      <span>{label}</span>
      <input
        id={id}
        type="checkbox"
        role="switch"
        className="peer sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        aria-hidden="true"
        className="relative block h-[26px] w-11 shrink-0 rounded-full bg-track ring-1 ring-inset ring-mid transition-colors peer-checked:bg-[var(--c-switch-on)] peer-checked:ring-0 peer-focus-visible:outline peer-focus-visible:outline-[3px] peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--c-focus)] [&>span]:left-[3px] peer-checked:[&>span]:left-[21px] peer-checked:[&>span]:bg-[var(--c-switch-knob)]"
      >
        <span className="absolute top-[3px] block size-5 rounded-full bg-mid transition-[left,background-color]" />
      </span>
    </label>
  );
}
