import { expect, it, vi } from "vitest";
import { clearRemovedHistorySelection } from "./historySelection";
it("clears only a selection whose file was actually removed, preserving empty and edited files", () => {
  const clear = vi.fn();
  for (const restored of ["", "new bytes"])
    clearRemovedHistorySelection({ "scene.html": { restored } }, "scene.html", clear);
  clearRemovedHistorySelection({ "scene.html": { restored: null } }, "other.html", clear);
  clearRemovedHistorySelection(undefined, "scene.html", clear);
  expect(clear).not.toHaveBeenCalled();
  clearRemovedHistorySelection({ "scene.html": { restored: null } }, "scene.html", clear);
  expect(clear).toHaveBeenCalledOnce();
});
