// A writer is bound to one project (see useFileManager), so writer identity plus
// path is the complete durable-file identity. Sharing this queue across SDK and
// legacy mutation paths prevents independent read-modify-write transactions from
// cloning the same stale bytes and overwriting one another.
let refreshing = false;

/** Refuse new writes during a checked read; drain already accepted writes first. */
export async function withStudioFileRefresh<T>(task: () => Promise<T>): Promise<T> {
  // Check and reserve in the same microtask once the accepted writes are drained.
  while (pendingMutations.size) await Promise.all([...pendingMutations]);
  if (refreshing) throw new Error("Tilannetta päivitetään jo. Odota hetki.");
  refreshing = true;
  try {
    return await task();
  } finally {
    refreshing = false;
  }
}

const pendingMutations = new Set<Promise<unknown>>();

/** Wait through transactions queued while an earlier save is finishing. A failed
 * save rejects export rather than silently exporting its rollback baseline. */
export async function waitForStudioFileMutations(): Promise<void> {
  while (pendingMutations.size) await Promise.all([...pendingMutations]);
}

const mutationQueues = new WeakMap<object, Map<string, Promise<unknown>>>();

export function serializeStudioFileMutation<T>(
  writer: object,
  targetPath: string,
  task: () => Promise<T>,
): Promise<T> {
  if (refreshing)
    return Promise.reject(
      new Error("Tilannetta päivitetään. Yritä muutosta uudelleen päivityksen jälkeen."),
    );
  let queues = mutationQueues.get(writer);
  if (!queues) {
    queues = new Map();
    mutationQueues.set(writer, queues);
  }
  const prior = queues.get(targetPath) ?? Promise.resolve();
  const next = prior.then(task, task);
  queues.set(targetPath, next);
  pendingMutations.add(next);
  void next.then(
    () => {
      pendingMutations.delete(next);
      if (queues?.get(targetPath) === next) queues.delete(targetPath);
    },
    () => {
      pendingMutations.delete(next);
      if (queues?.get(targetPath) === next) queues.delete(targetPath);
    },
  );
  return next;
}

export function serializeStudioFileMutations<T>(
  writer: object,
  targetPaths: readonly string[],
  task: () => Promise<T>,
): Promise<T> {
  const paths = [...new Set(targetPaths)].sort();
  const acquire = (index: number): Promise<T> => {
    const path = paths[index];
    if (path === undefined) return task();
    return serializeStudioFileMutation(writer, path, () => acquire(index + 1));
  };
  return acquire(0);
}
