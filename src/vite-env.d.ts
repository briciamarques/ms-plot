/// <reference types="vite/client" />

declare module "plotly.js-dist-min" {
  const Plotly: {
    react: (
      root: HTMLElement,
      data: unknown[],
      layout: Record<string, unknown>,
      config?: Record<string, unknown>,
    ) => Promise<HTMLElement>;
    purge: (root: HTMLElement) => void;
    downloadImage: (
      root: HTMLElement,
      options: Record<string, unknown>,
    ) => Promise<string>;
  };

  export default Plotly;
}
