import { defineConfig } from "vite-plus";

export default defineConfig({
  pack: {
    entry: { index: "src/index.ts", reader: "src/reader/index.ts", writer: "src/writer/index.ts" },
    format: ["esm"],
    platform: "neutral",
    dts: true,
  },
});
