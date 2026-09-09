/** Ari: selection and authoring state are shared with the canvas and script bridge. */
import { useState } from "react";
import { useDomEditSelectionContext } from "../contexts/DomEditContext";
import type { AriAgentBridge } from "./agentBridge";
import { AriNumber, ariInput, ariNumber } from "./AriNumber";
import { ariButton } from "./styles";

export function AriProperties({
  bridge,
  handle,
  busy,
}: {
  bridge: AriAgentBridge;
  handle: string;
  busy: boolean;
}) {
  const { domEditSelection: selection } = useDomEditSelectionContext();
  if (!selection) return null;
  return (
    <PropertiesForm
      key={handle + JSON.stringify(selection.computedStyles)}
      bridge={bridge}
      handle={handle}
      busy={busy}
      textEditable={selection.textFields.length > 0}
      styles={selection.computedStyles}
    />
  );
}
function PropertiesForm({
  bridge,
  handle,
  busy,
  styles,
  textEditable,
}: {
  textEditable: boolean;
  bridge: AriAgentBridge;
  handle: string;
  busy: boolean;
  styles: Record<string, string>;
}) {
  const [size, setSize] = useState(
    String(parseFloat(styles.fontSize || styles["font-size"] || "48")),
  );
  const [color, setColor] = useState(styles.color || "#ffffff");
  const [x, setX] = useState("0");
  const [y, setY] = useState("0");
  const [error, setError] = useState("");
  return (
    <details className="mb-4 rounded border border-neutral-600 p-3" open>
      <summary className="cursor-pointer text-sm font-semibold">Ulkoasu ja sijainti</summary>
      {textEditable && (
        <form
          className="mt-3 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            const n = ariNumber(size);
            if (!Number.isFinite(n) || n <= 0) {
              setError("Anna positiivinen tekstikoko.");
              return;
            }
            setError("");
            void bridge.call("studio_set_style", {
              handle,
              styles: { "font-size": `${n}px`, color },
            });
          }}
        >
          <div className="grid grid-cols-2 gap-2">
            <AriNumber label="Tekstikoko (px)" value={size} onChange={setSize} />
            <label className="text-xs">
              Tekstin väri
              <input
                aria-label="Tekstin väri"
                className={ariInput}
                value={color}
                onChange={(e) => setColor(e.target.value)}
              />
            </label>
          </div>
          <button className={ariButton} disabled={busy}>
            Tallenna ulkoasu
          </button>
        </form>
      )}
      <form
        className="mt-3 space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          const nx = ariNumber(x),
            ny = ariNumber(y);
          if (!Number.isFinite(nx) || !Number.isFinite(ny)) {
            setError("Anna siirto numeroina.");
            return;
          }
          setError("");
          void bridge.call("studio_transform", { handle, x: nx, y: ny });
        }}
      >
        <p className="text-xs text-neutral-400">Siirto alkuperäisestä asettelusta</p>
        <div className="grid grid-cols-2 gap-2">
          <AriNumber label="Vaakasiirto (px)" value={x} onChange={setX} />
          <AriNumber label="Pystysiirto (px)" value={y} onChange={setY} />
        </div>
        <button className={ariButton} disabled={busy}>
          Siirrä kohdetta
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
