import { LuTriangleAlert } from "react-icons/lu";
import type { MetricChipData } from "../../utils/metricDisplay";

/**
 * Renders a metric chip. When the metric errored it shows a warning icon + the
 * bare label, with the real failure reason as the hover tooltip (and aria-label).
 */
export function MetricChip({ chip, className }: { chip: MetricChipData; className?: string }) {
  const classes = [chip.errored ? "metric-error" : null, "tip", className]
    .filter(Boolean)
    .join(" ");
  if (chip.errored) {
    return (
      <span className={classes} data-tip={chip.title} role="img" aria-label={chip.title}>
        <LuTriangleAlert size={11} /> {chip.label}
      </span>
    );
  }
  return (
    <span className={classes} data-tip={chip.title}>
      {chip.text}
    </span>
  );
}
