import type { ReactNode } from "react";

/**
 * One metric tile in a `.stats` row: a label (`k`), a value (`v`), and a caption
 * (`sub`), with an optional hover tooltip. Purely presentational — every value
 * is computed by the caller.
 */
export function StatCard({
  label,
  value,
  sub,
  title,
}: {
  label: ReactNode;
  value: ReactNode;
  sub: ReactNode;
  title?: string;
}) {
  return (
    <div className="stat" title={title}>
      <div className="k">{label}</div>
      <div className="v">{value}</div>
      <div className="sub">{sub}</div>
    </div>
  );
}
