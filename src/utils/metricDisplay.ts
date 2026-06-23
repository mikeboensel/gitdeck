import type { TranslationKey } from "../i18n/translations";
import { formatNumber } from "./format";
import { isKnownMetric } from "./insights";

type Translate = (key: TranslationKey, replacements?: Record<string, string | number>) => string;

export interface MetricChip {
  /** Rendered chip text, e.g. "12 views" or "— views" when unknown. */
  text: string;
  /** Tooltip: the metric's normal explanation, or the "couldn't read" note. */
  title: string;
  /** False when the value is the unknown sentinel (-1), so callers can style it. */
  known: boolean;
}

/**
 * Builds the text + tooltip for a per-repo metric chip, rendering the unknown
 * sentinel (-1) as "—" with an explanatory tooltip instead of a misleading "0".
 */
export function metricChip(
  value: number,
  labelKey: TranslationKey,
  tipKey: TranslationKey,
  t: Translate,
): MetricChip {
  const known = isKnownMetric(value);
  return {
    text: t(labelKey, { count: known ? formatNumber(value) : t("metric.na") }),
    title: known ? t(tipKey) : t("tip.unavailable"),
    known,
  };
}
