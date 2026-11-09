import { defaultServerConditions, defineConfig } from "vite-plus";

// Workspace packages export their TypeScript sources under this condition so
// that a package can be type-checked and tested against a sibling without
// building it first. The same name is listed in `customConditions` in
// tsconfig.base.json; published consumers never set it and resolve `dist`.
const SOURCE_CONDITION = "@open-ocpp-trace/source";

export default defineConfig({
  ssr: {
    resolve: {
      conditions: [SOURCE_CONDITION, ...defaultServerConditions],
    },
  },
  lint: {
    // The smoke consumer imports the packed packages, which only exist in
    // the throwaway project of scripts/smoke-consumer.sh; that script
    // type-checks it there with tsc.
    ignorePatterns: ["**/dist/**", "**/node_modules/**", "scripts/smoke-consumer/consumer.ts"],
    options: { typeAware: true, typeCheck: true },
  },
  fmt: {
    ignorePatterns: ["**/dist/**", "**/node_modules/**", "bun.lock"],
  },
  test: {
    include: ["packages/*/test/**/*.test.ts"],
  },
});
