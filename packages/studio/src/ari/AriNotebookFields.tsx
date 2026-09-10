/** Shared notebook form primitives, so one control has one spelling (D5–D7). */
export const ariField =
  "block w-full rounded border border-neutral-500 bg-neutral-900 p-2 focus-visible:outline focus-visible:outline-emerald-300";

/** Human, external agent or test data — never a technical actor: a machine
 * neither stops the work nor approves a version. */
export function ActorTypeSelect({
  label,
  value,
  onChange,
  busy,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  busy: boolean;
}) {
  return (
    <label className="block">
      {label}
      <select
        className={ariField}
        disabled={busy}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="human">Ihmisen kirjaama</option>
        <option value="external_agent">Ulkoisen agentin kirjaama</option>
        <option value="test_data">Testiaineisto</option>
      </select>
    </label>
  );
}
