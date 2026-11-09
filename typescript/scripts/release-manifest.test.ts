import { describe, expect, it } from "vite-plus/test";

import { inspectPackage, SOURCE_CONDITION, stripSourceCondition } from "./release-manifest.ts";

const workspaceManifest = {
  name: "@open-ocpp-trace/jsonl",
  version: "1.2.3",
  files: ["dist"],
  exports: {
    ".": {
      [SOURCE_CONDITION]: "./src/index.ts",
      types: "./dist/index.d.ts",
      default: "./dist/index.js",
    },
    "./reader": {
      [SOURCE_CONDITION]: "./src/reader/index.ts",
      types: "./dist/reader.d.ts",
      default: "./dist/reader.js",
    },
    "./package.json": "./package.json",
  },
  dependencies: { "@open-ocpp-trace/core": "1.2.3" },
};

const publishedManifest = stripSourceCondition(workspaceManifest);

const publishedFiles = [
  "package.json",
  "README.md",
  "LICENSE",
  "dist/index.d.ts",
  "dist/index.js",
  "dist/reader.d.ts",
  "dist/reader.js",
  "dist/index-BQK4DWMR.d.ts",
];

describe("stripSourceCondition", () => {
  it("removes the source condition from every export and keeps the others in order", () => {
    expect(publishedManifest.exports).toEqual({
      ".": { types: "./dist/index.d.ts", default: "./dist/index.js" },
      "./reader": { types: "./dist/reader.d.ts", default: "./dist/reader.js" },
      "./package.json": "./package.json",
    });
    expect(Object.keys(publishedManifest.exports["."])).toEqual(["types", "default"]);
  });

  it("removes the condition from nested conditions", () => {
    const nested = stripSourceCondition({
      exports: { ".": { import: { [SOURCE_CONDITION]: "./src/a.ts", default: "./dist/a.js" } } },
    });
    expect(nested.exports).toEqual({ ".": { import: { default: "./dist/a.js" } } });
  });

  it("keeps every other field and does not mutate its input", () => {
    expect(publishedManifest.dependencies).toEqual(workspaceManifest.dependencies);
    expect(publishedManifest.files).toEqual(["dist"]);
    expect(workspaceManifest.exports["."]).toHaveProperty(SOURCE_CONDITION);
  });
});

describe("inspectPackage", () => {
  it("accepts a published manifest whose exports all exist", () => {
    expect(inspectPackage(publishedManifest, publishedFiles)).toEqual([]);
  });

  it("reports the source condition and its dangling target", () => {
    expect(inspectPackage(workspaceManifest, publishedFiles)).toEqual([
      `exports["."]["${SOURCE_CONDITION}"] is a development-only condition`,
      `exports["."]["${SOURCE_CONDITION}"] points to ./src/index.ts, which is not in the package`,
      `exports["./reader"]["${SOURCE_CONDITION}"] is a development-only condition`,
      `exports["./reader"]["${SOURCE_CONDITION}"] points to ./src/reader/index.ts, which is not in the package`,
    ]);
  });

  it("reports a types path that is not in the package", () => {
    const manifest = {
      ...publishedManifest,
      exports: {
        ...publishedManifest.exports,
        ".": { types: "./dist/missing.d.ts", default: "./dist/index.js" },
      },
    };
    expect(inspectPackage(manifest, publishedFiles)).toEqual([
      'exports["."]["types"] points to ./dist/missing.d.ts, which is not in the package',
    ]);
  });

  it("reports a missing LICENSE or README.md", () => {
    const files = publishedFiles.filter((file) => file !== "LICENSE" && file !== "README.md");
    expect(inspectPackage(publishedManifest, files)).toEqual([
      "LICENSE is missing",
      "README.md is missing",
    ]);
  });

  it("reports files outside dist/", () => {
    const files = [...publishedFiles, "src/index.ts", "test/reader.test.ts", ".env"];
    expect(inspectPackage(publishedManifest, files)).toEqual([
      "src/index.ts is not expected in the package",
      "test/reader.test.ts is not expected in the package",
      ".env is not expected in the package",
    ]);
  });

  it("reports an unresolved workspace dependency", () => {
    const manifest = {
      ...publishedManifest,
      dependencies: { "@open-ocpp-trace/core": "workspace:*" },
    };
    expect(inspectPackage(manifest, publishedFiles)).toEqual([
      'dependencies["@open-ocpp-trace/core"] is workspace:*, not a published version',
    ]);
  });
});
