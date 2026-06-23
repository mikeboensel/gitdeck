import type { TranslationKey } from "../i18n/translations";
import { formatNumber } from "./format";

type Translate = (key: TranslationKey, replacements?: Record<string, string | number>) => string;

export interface MetricChipData {
  /** True when the metric could not be read; render an error icon + reason. */
  errored: boolean;
  /** Bare metric label (e.g. "views"), shown next to the error icon. */
  label: string;
  /** Full chip text when known, e.g. "12 views". */
  text: string;
  /** Tooltip: the metric's explanation, or the actual failure reason when errored. */
  title: string;
}

/**
 * Builds the data for a per-repo metric chip. When `errorReason` is set the chip
 * renders as an error (icon + bare label) whose tooltip is the real reason the
 * fetch failed — never a misleading "0".
 */
export function metricChip(
  value: number,
  errorReason: string | undefined,
  labelKey: TranslationKey,
  tipKey: TranslationKey,
  t: Translate,
): MetricChipData {
  const label = t(labelKey, { count: "" }).trim();
  if (errorReason) {
    return { errored: true, label, text: label, title: errorReason };
  }
  return {
    errored: false,
    label,
    text: t(labelKey, { count: formatNumber(value) }),
    title: t(tipKey),
  };
}
