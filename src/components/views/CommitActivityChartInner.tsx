import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CommitChartRow } from "../../utils/commitActivity";

interface CommitActivityChartInnerProps {
  rows: CommitChartRow[];
  series: string[];
  colors: Record<string, string>;
  /** Display label for a series key (repo "owner/name" → "name", "Other" → localized). */
  seriesLabel: (key: string) => string;
}

/**
 * The Recharts stacked bar chart, isolated in its own module so it can be
 * `React.lazy`-loaded — keeping Recharts out of the main bundle. Default export
 * for `lazy(() => import(...))`.
 */
export default function CommitActivityChartInner({
  rows,
  series,
  colors,
  seriesLabel,
}: CommitActivityChartInnerProps) {
  return (
    <ResponsiveContainer width="100%" height={320}>
      <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -12 }} barCategoryGap={2}>
        <CartesianGrid stroke="var(--border-soft)" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="bucket"
          tick={{ fontSize: 11, fill: "var(--muted)" }}
          tickLine={false}
          axisLine={{ stroke: "var(--border-soft)" }}
          minTickGap={16}
        />
        <YAxis
          allowDecimals={false}
          width={40}
          tick={{ fontSize: 11, fill: "var(--muted)" }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip
          formatter={(value, name) => [value, seriesLabel(String(name))]}
          contentStyle={{
            background: "var(--panel)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            fontSize: 12,
          }}
          itemStyle={{ color: "var(--text)" }}
          labelStyle={{ color: "var(--muted)" }}
          cursor={{ fill: "rgba(255, 255, 255, 0.05)" }}
        />
        <Legend formatter={(value) => seriesLabel(String(value))} wrapperStyle={{ fontSize: 11 }} />
        {series.map((key) => (
          <Bar key={key} dataKey={key} stackId="commits" fill={colors[key]} maxBarSize={28} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
