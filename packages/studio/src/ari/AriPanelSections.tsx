import { useState, type ReactNode, type KeyboardEvent } from "react";
import { useDomEditSelectionContext } from "../contexts/DomEditContext";
import { useAriScene } from "./useAriScene";
import { ariButton } from "./styles";

const sections = ["Teksti", "Ulkoasu", "Liike", "Tarkistus"] as const;

/** Switching sections never writes or changes the shared canvas selection. */
export function AriPanelSections({
  text,
  appearance,
  motion,
  review,
}: {
  text: ReactNode;
  appearance: ReactNode;
  motion: ReactNode;
  review: ReactNode;
}) {
  const [active, setActive] = useState(2);
  const { domEditSelection: selection } = useDomEditSelectionContext();
  const scene = useAriScene();
  const panels = [text, appearance, motion, review];
  function selectSection(index: number) {
    setActive(index);
    const panel = document.querySelector('[data-testid="ari-command-panel"]');
    if (panel) panel.scrollTop = 0;
  }
  function navigate(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const targets: Record<string, number> = {
      ArrowRight: (index + 1) % sections.length,
      ArrowLeft: (index + sections.length - 1) % sections.length,
      Home: 0,
      End: sections.length - 1,
    };
    const next = targets[event.key];
    if (next === undefined) return;
    event.preventDefault();
    selectSection(next);
    document.getElementById(`ari-section-${next}`)?.focus();
  }
  return (
    <section aria-label="Muokkauspaneeli" data-testid="ari-edit-panel">
      <style>{`@media (prefers-reduced-motion: reduce) { [data-testid="ari-edit-panel"] *, [data-testid="ari-control-panel"] * { animation: none !important; transition: none !important; scroll-behavior: auto !important; } }`}</style>
      <header className="mb-2 text-xs" data-testid="ari-panel-selection">
        <strong className="block truncate text-sm">{selection?.label ?? "Ei valintaa"}</strong>
        <p className="truncate">
          Kohtaus: {scene.instance?.hostLabel ?? (selection ? "Pääkohtaus" : "—")}
        </p>
        <p>
          Esiintymä:{" "}
          {scene.nested
            ? `${scene.index || "Valitse"} / ${scene.instances.length}`
            : selection
              ? "1 / 1"
              : "—"}
        </p>
        {scene.instances.length > 1 && (
          <p>Muutos koskee kaikkia {scene.instances.length} esiintymää.</p>
        )}
      </header>
      <div role="tablist" aria-label="Muokkauksen osiot" className="mb-3 grid grid-cols-4 gap-1">
        {sections.map((label, index) => (
          <button
            key={label}
            type="button"
            role="tab"
            id={`ari-section-${index}`}
            aria-controls={`ari-panel-${index}`}
            aria-selected={active === index}
            tabIndex={active === index ? 0 : -1}
            className={`${ariButton} px-1 ${active === index ? "bg-emerald-900" : ""}`}
            onKeyDown={(event) => navigate(event, index)}
            onClick={() => selectSection(index)}
          >
            {label}
          </button>
        ))}
      </div>
      {panels.map((panel, index) => (
        <div
          key={sections[index]}
          role="tabpanel"
          id={`ari-panel-${index}`}
          aria-labelledby={`ari-section-${index}`}
          hidden={active !== index}
        >
          {panel}
        </div>
      ))}
    </section>
  );
}
