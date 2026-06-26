import { showToast } from "./toast";

/**
 * Write `value` to the clipboard and surface a toast showing what was copied.
 * Centralizes the `navigator.clipboard?.writeText` guard (the API is absent on
 * insecure origins) so every copy action gets identical feedback. `label` is
 * the already-translated eyebrow (e.g. "Copied to clipboard"); `value` is shown
 * beneath it as the copied text.
 */
export function copyToClipboard(value: string, label: string): void {
  const result = navigator.clipboard?.writeText(value);
  if (!result) {
    showToast(value, { kind: "error", label });
    return;
  }
  result.then(
    () => showToast(value, { kind: "success", label }),
    () => showToast(value, { kind: "error", label }),
  );
}
