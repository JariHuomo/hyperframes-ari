/** Ari: Finnish decimal entry; commit only on explicit form submission. */
export const ariInput =
  "mt-1 min-h-10 w-full rounded border border-neutral-500 bg-neutral-900 px-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-300";
export function ariNumber(value: string): number {
  return value.trim() ? Number(value.replace(",", ".")) : Number.NaN;
}
export function AriNumber({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block min-w-0 text-xs text-neutral-300">
      {label}
      <input
        aria-label={label}
        className={ariInput}
        inputMode="decimal"
        value={value.replace(".", ",")}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
