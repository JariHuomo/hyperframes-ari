import { useEffect, useRef, type ReactNode } from "react";
import { ariButton as button } from "./styles";
/** Shared keyboard/modal shell for source-backed structure editors. */
export function AriStructureDialog({
  label,
  title,
  busy,
  onClose,
  children,
}: {
  label: string;
  title: string;
  busy: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      aria-label={label}
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else onClose();
      }}
      className="fixed inset-4 z-[200] m-auto max-h-[calc(100%-2rem)] w-[min(900px,calc(100%-2rem))] overflow-auto rounded-xl border border-neutral-500 bg-neutral-950 p-6 text-neutral-100"
    >
      <div className="flex justify-between">
        <h2 className="text-xl">{title}</h2>
        <button autoFocus className={button} disabled={busy} onClick={onClose}>
          Sulje
        </button>
      </div>
      {children}
    </dialog>
  );
}

export function AriStructureSelection({
  label,
  placeholder,
  value,
  onChange,
  children,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (target: string) => void;
  children: ReactNode;
}) {
  return (
    <label>
      {label}{" "}
      <select
        className="bg-neutral-800 p-2"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">{placeholder}</option>
        {children}
      </select>
    </label>
  );
}

export function selectStructureRow(
  rows: Record<string, unknown>[],
  target: string,
  setName: (name: string) => void,
  navigate: (row: Record<string, unknown>) => void,
) {
  const row = rows.find((row) => row.target === target);
  if (!row) return;
  setName(String(row.name));
  navigate(row);
}
