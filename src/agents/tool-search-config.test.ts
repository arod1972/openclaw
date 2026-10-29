import { describe, expect, it } from "vitest";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { resolveToolSearchConfig } from "./tool-search-config.js";

describe("Tool Search activation defaults", () => {
  it.each([undefined, {}, { tools: {} }] satisfies Array<OpenClawConfig | undefined>)(
    "uses structured search without authored settings: %j",
    (config) => {
      expect(resolveToolSearchConfig(config)).toMatchObject({
        enabled: true,
        mode: "tools",
        searchDefaultLimit: 8,
        maxSearchLimit: 20,
      });
    },
  );

  it.each([
    { raw: false, enabled: false, mode: "tools" },
    { raw: true, enabled: true, mode: "tools" },
    { raw: {}, enabled: false, mode: "tools" },
    { raw: { enabled: true }, enabled: true, mode: "tools" },
    { raw: { searchDefaultLimit: 4 }, enabled: true, mode: "tools" },
    { raw: { mode: "tools" }, enabled: true, mode: "tools" },
    { raw: { mode: "directory" }, enabled: true, mode: "directory" },
    { raw: { enabled: false, mode: "tools" }, enabled: false, mode: "tools" },
    { raw: { include: [] }, enabled: true, mode: "tools" },
    { raw: { enabled: false, include: [{ source: "mcp" }] }, enabled: false, mode: "tools" },
  ] satisfies Array<{
    raw: NonNullable<NonNullable<OpenClawConfig["tools"]>["toolSearch"]>;
    enabled: boolean;
    mode: string;
  }>)("preserves authored $raw configuration", ({ raw, enabled, mode }) => {
    expect(resolveToolSearchConfig({ tools: { toolSearch: raw } })).toMatchObject({
      enabled,
      mode,
    });
  });

  it("retains omitted and empty selectors distinctly", () => {
    expect(resolveToolSearchConfig()).not.toHaveProperty("include");
    expect(resolveToolSearchConfig()).not.toHaveProperty("exclude");
    expect(
      resolveToolSearchConfig({ tools: { toolSearch: { include: [], exclude: [] } } }),
    ).toMatchObject({ include: [], exclude: [] });
    const selection = {
      include: [{ source: "mcp" as const }],
      exclude: [{ source: "mcp" as const, name: "github_read_*" }],
    };
    expect(resolveToolSearchConfig({ tools: { toolSearch: selection } })).toMatchObject(selection);
  });

  it("lets an agent toolSearch setting replace the global one", () => {
    const globalToolSearch = { enabled: true, mode: "tools" as const, searchDefaultLimit: 8 };
    const config = {
      tools: { toolSearch: globalToolSearch },
      agents: {
        entries: {
          theo: { tools: { toolSearch: false } },
          directory: {
            tools: { toolSearch: { mode: "directory" as const, searchDefaultLimit: 3 } },
          },
          empty: { tools: { toolSearch: {} } },
          other: {},
        },
      },
    } satisfies OpenClawConfig;
    expect(resolveToolSearchConfig(config, "theo")).toMatchObject({
      enabled: false,
      mode: "tools",
    });
    expect(resolveToolSearchConfig(config, "directory")).toMatchObject({
      enabled: true,
      mode: "directory",
      searchDefaultLimit: 3,
    });
    expect(resolveToolSearchConfig(config, "empty")).toMatchObject({ enabled: false });
    expect(resolveToolSearchConfig(config, "other")).toMatchObject({
      enabled: true,
      mode: "tools",
      searchDefaultLimit: 8,
    });
    expect(resolveToolSearchConfig(config)).toMatchObject({ enabled: true, mode: "tools" });
    expect(config.tools.toolSearch).toBe(globalToolSearch);
  });
});
