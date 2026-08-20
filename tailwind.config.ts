import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#0a0e14",
        panel: "#10151d",
        panel2: "#141a24",
        border: "#1f2732",
        accent: "#3aa0ff",
        good: "#22c55e",
        warn: "#f5a623",
        crit: "#ef4444",
        muted: "#8792a2"
      },
      borderRadius: {
        xl: "14px"
      }
    }
  },
  plugins: []
};

export default config;
