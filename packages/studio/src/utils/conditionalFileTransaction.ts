import { UncertainSourceOperation } from "./sourceOperations";
type Writer<T extends string | null> = (
  path: string,
  content: T,
  expectedContent?: T,
) => Promise<void>;

/** Compensating transaction shared by saving and undo/redo. The writer must
 * enforce expected bytes (Studio's project writer sends a SHA-256 If-Match).
 * expectedContent overrides forward-write preconditions, never rollback baselines.
 * Rollbacks never overwrite a concurrent edit and attempt every written path.
 */
export async function writeConditionalFiles<T extends string | null>(
  files: Record<string, T>,
  before: Record<string, T>,
  write: Writer<T>,
  finish: () => Promise<void> = async () => {},
  expectedContent: Record<string, T> = before,
): Promise<void> {
  const written: string[] = [];
  try {
    for (const [path, after] of Object.entries(files)) {
      await write(
        path,
        after,
        Object.hasOwn(expectedContent, path) ? expectedContent[path] : before[path],
      );
      written.push(path);
    }
    await finish();
  } catch (error) {
    if (error instanceof UncertainSourceOperation) throw error;
    const failures: unknown[] = [error];
    for (const path of written.reverse()) {
      try {
        await write(path, before[path], files[path]);
      } catch (rollbackError) {
        failures.push(rollbackError);
      }
    }
    if (failures.length > 1)
      throw new AggregateError(failures, "File transaction rollback did not complete");
    throw error;
  }
}
