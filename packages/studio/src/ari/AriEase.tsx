/**
 * Ari: the curve, as a picture and as four numbers.
 *
 * Upstream already has the whole bezier editor (`EaseCurveSection`) — a Figma
 * style graph with draggable handles, spring and wiggle modes and 33 presets.
 * What it does not have is Ari's contract: a write only counts when the receipt
 * says the source holds it. `EaseCurveSection` commits fire-and-forget and
 * falls back after a two-second timer, which for an agent is a timer deciding
 * success. So this wrapper owns the commit:
 *
 * - one completed drag (pointer-UP, never pointer-move) is one bridge call and
 *   therefore one undoable change; the serial bridge is never handed a stream,
 * - a pointer-CANCEL restores the draft instead of writing it, which is why
 *   `EaseCurveSection` takes `discardDraftOnPointerCancel`,
 * - the pending state clears on the receipt, never on a clock. A refused write
 *   puts the saved curve back on screen with its Finnish reason,
 * - opening the panel writes nothing: the four control-point fields are seeded
 *   from the existing ease and only leave the panel on an explicit submit, so
 *   merely LOOKING at a named ease cannot rewrite it as a rounded `custom(...)`.
 */

import { useEffect, useState } from "react";
import { EaseCurveSection } from "../components/editor/EaseCurveSection";
import { MiniCurveSvg } from "../components/editor/easeCurveSvg";
import { parseEase } from "../webmcp/easeContract";
import type { AriAgentBridge } from "./agentBridge";
import { ARI_EASE_GROUPS, ariEaseLabel } from "./easeCatalog";
import { AriNumber, ariNumber } from "./AriNumber";
import { ariButton } from "./styles";

type BridgeCall = Pick<AriAgentBridge, "call">;

function receiptFailure(result: unknown): string | null {
  if (typeof result !== "object" || result === null) return "Käyrän tallennus ei vastannut.";
  if (Reflect.get(result, "ok") === true) return null;
  const reason = Reflect.get(result, "reason");
  return typeof reason === "string" ? reason : "Käyrän tallennus ei onnistunut.";
}

/** Glyph + Finnish name + the grouped preset list. Used for a new motion's feel
 * and for an existing one; the popover is absolutely positioned so opening it
 * never moves the buttons underneath. */
export function AriEasePicker({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (ease: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const name = ariEaseLabel(value) ?? "Mukautettu käyrä";
  return (
    <div className="relative">
      <span className="block text-xs text-neutral-300">{label}</span>
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        disabled={disabled}
        className={`${ariButton} mt-1 flex w-full items-center gap-2 text-left`}
        onClick={() => setOpen((previous) => !previous)}
      >
        <MiniCurveSvg ease={value} active size={20} />
        <span className="truncate">{name}</span>
      </button>
      {open && (
        <div
          role="listbox"
          aria-label={`${label}: vaihtoehdot`}
          className="absolute inset-x-0 top-full z-30 mt-1 max-h-72 overflow-auto rounded-lg border border-neutral-600 bg-neutral-900 p-2 shadow-xl"
        >
          {ARI_EASE_GROUPS.map((group) => (
            <div key={group.title} className="mb-2">
              <p className="px-1 text-[11px] uppercase tracking-wide text-neutral-400">
                {group.title}
              </p>
              {group.options.map((option) => (
                <button
                  key={option.ease}
                  type="button"
                  role="option"
                  aria-selected={option.ease === value}
                  data-ari-ease={option.ease}
                  className={`${ariButton} flex w-full items-center gap-2 border-transparent text-left ${
                    option.ease === value ? "bg-emerald-900" : ""
                  }`}
                  onClick={() => {
                    onChange(option.ease);
                    setOpen(false);
                  }}
                >
                  <MiniCurveSvg ease={option.ease} active={option.ease === value} size={18} />
                  <span className="truncate">{option.label}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** The four cubic control points as numbers. Seeded from the current ease and
 * re-seeded whenever it changes (the `key` in `AriEase`), never written until
 * the form is submitted. */
function CurvePointFields({
  points,
  disabled,
  onCommit,
}: {
  points: [number, number, number, number];
  disabled: boolean;
  onCommit: (ease: string) => void;
}) {
  const [values, setValues] = useState(points.map((point) => String(point)) as string[]);
  const labels = ["X1", "Y1", "X2", "Y2"];
  const [error, setError] = useState("");
  // Deliberately NOT a <form>. This panel is rendered inside `MotionForm`'s own
  // form, and a nested form is invalid HTML: the browser gave the inner submit
  // button no React-handled submit at all, so pressing "Tallenna ohjauspisteet"
  // performed a NATIVE submit — the studio navigated away and the curve was
  // never written. An explicit button keeps the "commit only on an explicit
  // action" contract without the nesting.
  function submit() {
    const numbers = values.map(ariNumber);
    if (!numbers.every(Number.isFinite)) {
      setError("Anna neljä lukua.");
      return;
    }
    const ease = `custom(M0,0 C${numbers[0]},${numbers[1]} ${numbers[2]},${numbers[3]} 1,1)`;
    const parsed = parseEase(ease);
    if (!parsed.ok) {
      setError(parsed.reason);
      return;
    }
    setError("");
    onCommit(parsed.ease);
  }
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-4 gap-2">
        {labels.map((label, index) => (
          <AriNumber
            key={label}
            label={label}
            value={values[index] ?? ""}
            onChange={(next) =>
              setValues((previous) => previous.map((old, i) => (i === index ? next : old)))
            }
          />
        ))}
      </div>
      <button type="button" className={ariButton} disabled={disabled} onClick={submit}>
        Tallenna ohjauspisteet
      </button>
      {error && (
        <p role="alert" className="text-sm text-amber-300">
          {error}
        </p>
      )}
    </div>
  );
}

export function AriEase({
  bridge,
  handle,
  animationId,
  instance,
  ease,
  busy,
  index = 0,
}: {
  bridge: BridgeCall;
  handle: string;
  animationId: string;
  instance?: string;
  ease: string;
  busy: boolean;
  index?: number;
  position?: number;
  duration?: number;
}) {
  // What the panel is painting while a write is in flight, and what it painted
  // before the last accepted one. Both are panel state only: `previous` is
  // never written back, it is the curve the comparison replay is judged against.
  const [optimistic, setOptimistic] = useState<string | null>(null);
  const [previous, setPrevious] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [frames, setFrames] = useState<{ url: string; progress: number }[] | null>(null);
  // The source told us what it holds; drop the optimistic paint.
  useEffect(() => setOptimistic(null), [ease]);

  const shown = optimistic ?? ease;
  const parsed = parseEase(shown);
  const points = parsed.ok ? parsed.points : undefined;

  async function commit(next: string) {
    if (next === shown) return;
    const before = shown;
    setError("");
    setPending(true);
    setOptimistic(next);
    const result = await bridge.call("studio_update_animation", {
      handle,
      animationId,
      ...(instance ? { instance } : {}),
      ease: next,
    });
    setPending(false);
    const failure = receiptFailure(result);
    if (failure) {
      // Receipt-driven, not timed: a refused write puts the saved curve back.
      setOptimistic(null);
      setError(failure);
      return;
    }
    setPrevious(before);
    const saved = Reflect.get(result as object, "easeCurve");
    const savedEase =
      typeof saved === "object" && saved !== null ? Reflect.get(saved, "ease") : undefined;
    if (typeof savedEase === "string") setOptimistic(savedEase);
  }

  async function captureSamples() {
    setError("");
    const result = await bridge.call("studio_frame", {
      animationId,
      ...(instance ? { instance } : {}),
      samples: [0.25, 0.5, 0.75],
    });
    const failure = receiptFailure(result);
    if (failure) {
      setError(failure);
      return;
    }
    const captured = Reflect.get(result as object, "frames");
    if (!Array.isArray(captured)) return;
    setFrames(
      captured.flatMap((frame: unknown) => {
        if (typeof frame !== "object" || frame === null) return [];
        const url = Reflect.get(frame, "url");
        const progress = Reflect.get(frame, "progress");
        return typeof url === "string" && typeof progress === "number" ? [{ url, progress }] : [];
      }),
    );
  }

  return (
    <div
      className="space-y-2 rounded border border-neutral-700 p-2"
      aria-label={`Liike ${index + 1} käyrä`}
    >
      <AriEasePicker
        label={`Liike ${index + 1} tuntuma`}
        value={shown}
        onChange={(next) => void commit(next)}
        disabled={busy || pending}
      />
      <EaseCurveSection
        ease={shown}
        onCustomEaseCommit={(next) => void commit(next)}
        discardDraftOnPointerCancel
      />
      {points && (
        <CurvePointFields
          key={shown}
          points={points}
          disabled={busy || pending}
          onCommit={(next) => void commit(next)}
        />
      )}
      {/* Fixed-height status row: the buttons below it must not move while a
          handle is being dragged. */}
      <p className="min-h-5 text-xs" role="status">
        {pending ? "Tallennetaan käyrää…" : previous ? "Käyrä tallennettu" : ""}
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={ariButton}
          disabled={busy || pending}
          onClick={() => window.dispatchEvent(new Event("ari-open-versions"))}
        >
          Vertaa edelliseen
        </button>
        <button
          type="button"
          className={ariButton}
          disabled={busy || pending}
          onClick={() => void captureSamples()}
        >
          Ruutukuvat 25/50/75 %
        </button>
      </div>
      {previous && (
        <p className="flex items-center gap-2 text-xs text-neutral-300">
          <MiniCurveSvg ease={previous} active={false} size={18} />
          <span>Edellinen tuntuma — vertaa tallennetut versiot erillisessä näkymässä</span>
        </p>
      )}
      {frames && (
        <div className="flex gap-2">
          {frames.map((frame) => (
            <a key={frame.url} href={frame.url} target="_blank" rel="noreferrer">
              <img
                src={frame.url}
                alt={`Liikkeen ruutukuva ${Math.round(frame.progress * 100)} %`}
                className="max-h-24 rounded object-contain"
              />
            </a>
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-amber-300">
          {error}
        </p>
      )}
    </div>
  );
}
