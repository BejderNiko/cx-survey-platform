"use client";

import { useEffect, useRef } from "react";

/** Thin Plotly wrapper (plotly.js-dist-min, loaded lazily on the client). */
export function PlotlyChart({
  data,
  layout,
  height = 360,
}: {
  data: unknown[];
  layout?: Record<string, unknown>;
  height?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    const node = ref.current;
    (async () => {
      const Plotly = (await import("plotly.js-dist-min")).default;
      if (cancelled || !node) return;
      await Plotly.newPlot(
        node,
        data,
        {
          margin: { t: 40, r: 20, b: 60, l: 60 },
          height,
          paper_bgcolor: "transparent",
          plot_bgcolor: "transparent",
          font: { size: 12 },
          ...layout,
        },
        { displaylogo: false, responsive: true },
      );
    })();
    return () => {
      cancelled = true;
      if (node) {
        import("plotly.js-dist-min").then((m) => m.default.purge(node)).catch(() => {});
      }
    };
  }, [data, layout, height]);

  const title =
    typeof layout?.title === "object"
      ? (layout.title as { text?: string }).text
      : (layout?.title as string | undefined);
  // figure (not role="img"): Plotly renders focusable controls inside the chart
  return (
    <figure aria-label={title ?? "Chart"} className="m-0">
      <div ref={ref} />
    </figure>
  );
}
