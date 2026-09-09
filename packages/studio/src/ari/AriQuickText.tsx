/** Ari: ordinary text editing uses the exact same save contract as scripts. */
import { useState } from "react";
import type { AriAgentBridge } from "./agentBridge";
import { ariButton } from "./styles";

export function AriQuickText({
  bridge,
  handle,
  initialText,
  busy,
}: {
  bridge: AriAgentBridge;
  handle: string;
  initialText: string;
  busy: boolean;
}) {
  const [text, setText] = useState(initialText);
  return (
    <form
      className="mb-4 rounded border border-emerald-700 bg-emerald-950/30 p-3"
      onSubmit={(event) => {
        event.preventDefault();
        void bridge.call("studio_set_text", { handle, text });
      }}
    >
      <label className="block text-sm font-medium">
        Valitun kohteen teksti
        <textarea
          aria-label="Mainosteksti"
          className="my-2 block h-20 w-full rounded border border-neutral-500 bg-neutral-900 p-2"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </label>
      <button
        className={`${ariButton} bg-emerald-900`}
        disabled={busy || text === initialText}
        type="submit"
      >
        Tallenna teksti
      </button>
    </form>
  );
}
