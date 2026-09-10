import type { EditHistoryState } from "./editHistory";
export function memoryHistoryStorage() {
  let stored: EditHistoryState | null = null;
  return {
    get: async () => stored,
    set: async (_id: string, state: EditHistoryState) => {
      stored = structuredClone(state);
    },
    delete: async () => {
      stored = null;
    },
  };
}
