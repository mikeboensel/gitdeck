/**
 * Safely extract a human-readable message from an unknown thrown value.
 * `catch` bindings are typed `unknown` — the thrown value is not guaranteed to
 * be an Error, so narrow before reading `.message`.
 */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
