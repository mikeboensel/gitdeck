import { memo } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

/** A pre-formatted donut slice. All display strings are built by the outer
 *  component (which owns i18n) so this Recharts module stays presentational. */
export interface DiskChartDatum {
  key: string;
  name: string;
  bytes: number;
  color: string;
  sizeLabel: string;
  percentLabel: string;
  pathLabel?: string;
  statusLabel?: string;
  safe?: boolean;
  reasonLabels: string[];
  committedLabel?: string;
}

interface DiskUsageChartInnerProps {
  data: DiskChartDatum[];
  onActiveChange: (key: string | null) => void;
}

/** Rich tooltip body — Recharts injects `active`/`payload`. */
function DiskTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: DiskChartDatum }>;
}) {
  const first = active ? payload?.[0] : undefined;
  if (!first) return null;
  const d = first.payload;
  return (
    <div className="disk-tooltip">
      <div className="disk-tooltip-name">{d.name}</div>
      {d.pathLabel ? <div className="disk-tooltip-path">{d.pathLabel}</div> : null}
      <div className="disk-tooltip-row">
        <span className="disk-tooltip-size">{d.sizeLabel}</span>
        <span className="disk-tooltip-pct">{d.percentLabel}</span>
      </div>
      {d.statusLabel ? (
        <div className={`disk-tooltip-status ${d.safe ? "safe" : "unsafe"}`}>{d.statusLabel}</div>
      ) : null}
      {d.reasonLabels.map((r) => (
        <div className="disk-tooltip-reason" key={r}>
          {r}
        </div>
      ))}
      {d.committedLabel ? <div className="disk-tooltip-committed">{d.committedLabel}</div> : null}
    </div>
  );
}

/**
 * The Recharts donut, isolated so it can be `React.lazy`-loaded (keeping Recharts
 * out of the main bundle). Default export for `lazy(() => import(...))`. Hovering
 * a slice reports its key up so the companion table can highlight the same row.
 */
function LocalDiskUsageInner({ data, onActiveChange }: DiskUsageChartInnerProps) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={data}
          dataKey="bytes"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={72}
          outerRadius={120}
          paddingAngle={1}
          stroke="var(--panel)"
          onMouseEnter={(_, index) => onActiveChange(data[index]?.key ?? null)}
          onMouseLeave={() => onActiveChange(null)}
        >
          {data.map((d) => (
            <Cell key={d.key} fill={d.color} />
          ))}
        </Pie>
        <Tooltip content={<DiskTooltip />} cursor={false} />
      </PieChart>
    </ResponsiveContainer>
  );
}

// Memoized: a stable `data` reference (memoized upstream) plus the stable
// `setActiveKey` callback means hover-driven parent re-renders skip the chart
// entirely.
export default memo(LocalDiskUsageInner);
