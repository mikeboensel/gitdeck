import { formatNumber } from "../../../utils/format";

function chartPath(values: number[], width: number, height: number) {
  if (values.length < 2) return "";
  const max = Math.max(...values, 1);
  const min = Math.min(...values);
  const range = Math.max(max - min, 1);
  return values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / range) * height;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

export function MiniChart({
  title,
  values,
  tone = "accent",
}: {
  title: string;
  values: number[];
  tone?: "accent" | "purple" | "green" | "amber";
}) {
  const width = 240;
  const height = 72;
  const path = chartPath(values, width, height);
  const latest = values.at(-1) ?? 0;
  const first = values[0] ?? latest;
  const delta = latest - first;

  return (
    <div className={`repo-chart tone-${tone}`}>
      <div className="repo-chart-head">
        <span>{title}</span>
        <strong>{formatNumber(latest)}</strong>
      </div>
      {path ? (
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title}>
          <path className="repo-chart-baseline" d={`M 0 ${height - 1} H ${width}`} />
          <path className="repo-chart-line" d={path} />
        </svg>
      ) : (
        <div className="repo-chart-empty">Not enough data</div>
      )}
      <em>
        {delta === 0 ? "No change" : `${delta > 0 ? "+" : ""}${formatNumber(delta)} in range`}
      </em>
    </div>
  );
}
