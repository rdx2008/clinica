import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // App autenticado: páginas dependem de cookie/banco a cada requisição, então
  // o modo Cache Components (pré-renderização parcial) fica desligado.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
