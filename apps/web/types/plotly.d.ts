declare module "plotly.js-dist-min" {
  interface PlotlyModule {
    newPlot(
      el: HTMLElement,
      data: unknown[],
      layout?: Record<string, unknown>,
      config?: Record<string, unknown>,
    ): Promise<unknown>;
    purge(el: HTMLElement): void;
  }
  const Plotly: PlotlyModule;
  export default Plotly;
}
