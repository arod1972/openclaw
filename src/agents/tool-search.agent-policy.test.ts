import { describe, expect, it } from "vitest";
import { configureAiTransportHost, getAiTransportHost } from "../../packages/ai/src/host.js";
import { buildOpenAICompletionsParams } from "../../packages/ai/src/transports/openai-completions-params.js";
import { makeCompletionsModel } from "../../packages/ai/src/transports/openai-completions.test-support.js";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import { resolveProviderRequestCapabilities } from "./provider-attribution.js";
import { fakeTool } from "./test-helpers/fake-tool.js";
import {
  applyToolSchemaDirectoryCatalog,
  applyToolSearchCatalog,
  createToolSearchCatalogRef,
  createToolSearchTools,
  projectModelFacingToolSearchControls,
  TOOL_CALL_RAW_TOOL_NAME,
  TOOL_DESCRIBE_RAW_TOOL_NAME,
  TOOL_SEARCH_RAW_TOOL_NAME,
} from "./tool-search.js";
import { resolveAgentToolSurfacePlan } from "./tool-surface-plan.js";

const controlNames = [
  TOOL_SEARCH_RAW_TOOL_NAME,
  TOOL_DESCRIBE_RAW_TOOL_NAME,
  TOOL_CALL_RAW_TOOL_NAME,
];

function controls() {
  return controlNames.map((name) => fakeTool(name, name));
}

function namesOf(tools: Array<{ name: string }>): string[] {
  return tools.map((tool) => tool.name);
}

function policyConfig(deny: string[]): OpenClawConfig {
  return {
    tools: { codeMode: false, toolSearch: true },
    agents: {
      ownership: "explicit",
      entries: {
        theo: { tools: { deny } },
        other: {},
      },
    },
  };
}

function cataloged(deny: string[], agentId = "theo") {
  const catalogRef = createToolSearchCatalogRef();
  const hidden = fakeTool("hidden_target", "List sessions");
  const message = fakeTool("message", "Send a message");
  const result = applyToolSearchCatalog({
    tools: [...controls(), hidden, message],
    config: policyConfig(deny),
    agentId,
    catalogRef,
    directToolNames: ["message"],
  });
  return { result, catalogRef, hidden, message };
}

describe("Tool Search control policy", () => {
  it("omits control tools from the model surface when the hidden catalog is empty", () => {
    const emptyRef = createToolSearchCatalogRef();
    const empty = applyToolSearchCatalog({
      tools: controls(),
      config: { tools: { toolSearch: true } },
      catalogRef: emptyRef,
    });
    // The catalog stays registered so a later client append can still land.
    // The model does not see controls until that append hides something.
    expect(empty.catalogRegistered).toBe(true);
    expect(emptyRef.current?.entries ?? []).toEqual([]);
    expect(
      namesOf(
        projectModelFacingToolSearchControls(empty.tools, {
          enabled: true,
          catalogRef: emptyRef,
        }),
      ),
    ).toEqual([]);

    const directRef = createToolSearchCatalogRef();
    const directOnly = applyToolSearchCatalog({
      tools: [...controls(), fakeTool("message", "Send a message")],
      config: { tools: { toolSearch: true } },
      catalogRef: directRef,
      directToolNames: ["message"],
    });
    expect(directOnly.catalogRegistered).toBe(true);
    expect(directRef.current?.entries.every((entry) => entry.directVisible === true)).toBe(true);
    expect(
      namesOf(
        projectModelFacingToolSearchControls(directOnly.tools, {
          enabled: true,
          catalogRef: directRef,
        }),
      ),
    ).toEqual(["message"]);
  });

  it("keeps control tools when a hidden catalog entry remains", () => {
    const { result, catalogRef } = cataloged([]);
    expect(namesOf(result.tools)).toEqual([...controlNames, "message"]);
    expect(catalogRef.current?.entries.map((entry) => entry.name)).toEqual([
      "hidden_target",
      "message",
    ]);
    expect(catalogRef.current?.entries[0]?.directVisible).not.toBe(true);
  });

  it.each([
    {
      deny: ["tool_search"],
      absent: ["tool_search"],
      present: ["tool_describe", "dispatch_action"],
    },
    { deny: ["tool_call"], absent: ["dispatch_action"], present: ["tool_search", "tool_describe"] },
    {
      deny: ["dispatch_action"],
      absent: ["dispatch_action"],
      present: ["tool_search", "tool_describe"],
    },
  ])("applies agent deny $deny to control tools only", ({ deny, absent, present }) => {
    const { result, catalogRef } = cataloged(deny);
    const names = namesOf(result.tools);
    for (const name of absent) {
      expect(names).not.toContain(name);
    }
    for (const name of present) {
      expect(names).toContain(name);
    }
    expect(names).toContain("message");
    expect(names).not.toContain("hidden_target");
    expect(catalogRef.current?.entries.map((entry) => entry.name)).toContain("hidden_target");
  });

  it("removes every control tool on deny * and leaves the already-admitted tool", () => {
    const { result, catalogRef } = cataloged(["*"]);
    expect(namesOf(result.tools)).toEqual(["hidden_target", "message"]);
    expect(result.catalogRegistered).toBe(false);
    expect(catalogRef.current).toBeUndefined();
  });

  it("keeps controls when a closed profile admits a hidden tool", () => {
    const catalogRef = createToolSearchCatalogRef();
    const result = applyToolSearchCatalog({
      tools: [...controls(), fakeTool("hidden_target", "List sessions")],
      config: {
        tools: { profile: "coding", toolSearch: true },
        agents: { entries: { theo: { tools: { profile: "coding" } } } },
      },
      agentId: "theo",
      catalogRef,
    });
    expect(namesOf(result.tools)).toEqual(controlNames);
    expect(namesOf(result.tools)).not.toContain("hidden_target");
    expect(catalogRef.current?.entries.map((entry) => entry.name)).toContain("hidden_target");
  });

  it("does not apply one agent's deny list to another agent", () => {
    const { result } = cataloged(["*"], "other");
    expect(namesOf(result.tools)).toEqual([...controlNames, "message"]);
  });

  it("removes a denied control in directory mode without dropping the hidden tool", () => {
    const catalogRef = createToolSearchCatalogRef();
    const result = applyToolSchemaDirectoryCatalog({
      tools: [...controls(), fakeTool("hidden_target", "List sessions")],
      config: {
        tools: { toolSearch: { enabled: true, mode: "directory" } },
        agents: { entries: { theo: { tools: { deny: ["tool_search"] } } } },
      },
      agentId: "theo",
      catalogRef,
    });
    expect(namesOf(result.tools)).not.toContain("tool_search");
    expect(namesOf(result.tools)).toEqual(
      expect.arrayContaining(["tool_describe", "dispatch_action"]),
    );
    expect(namesOf(result.tools)).not.toContain("hidden_target");
    expect(catalogRef.current?.entries.map((entry) => entry.name)).toContain("hidden_target");
  });

  it("lets the agent toolSearch setting replace the global and lean defaults", () => {
    const globalToolSearch = { enabled: true, mode: "tools" as const };
    const config: OpenClawConfig = {
      tools: { codeMode: false, toolSearch: globalToolSearch },
      agents: {
        entries: {
          theo: { tools: { toolSearch: false } },
          directory: { tools: { toolSearch: { mode: "directory" } } },
          other: {},
        },
      },
    };
    const base = {
      config,
      forceDirectMessageTool: false,
      toolsEnabled: true,
      isRawModelRun: false,
      model: { toolSearchMode: "tools" as const },
    };
    expect(
      resolveAgentToolSurfacePlan({ ...base, agentId: "theo" }).toolSearchControlsEnabled,
    ).toBe(false);
    expect(
      resolveAgentToolSurfacePlan({ ...base, agentId: "directory" }).toolSearchConfig.mode,
    ).toBe("directory");
    expect(
      resolveAgentToolSurfacePlan({ ...base, agentId: "other" }).toolSearchControlsEnabled,
    ).toBe(true);
    expect(
      resolveAgentToolSurfacePlan({ ...base, agentId: "directory", trigger: "memory" })
        .toolSearchControlsEnabled,
    ).toBe(false);
    expect(config.tools?.toolSearch).toBe(globalToolSearch);
  });

  it("sends no tools and no tool_choice for a denied agent with responseFormat", () => {
    const previousHost = getAiTransportHost();
    configureAiTransportHost({
      ...previousHost,
      resolveProviderRequestCapabilities,
    });
    try {
      const config = policyConfig([
        "*",
        "tool_search",
        "tool_describe",
        "tool_call",
        "dispatch_action",
      ]);
      const plan = resolveAgentToolSurfacePlan({
        config,
        agentId: "theo",
        forceDirectMessageTool: false,
        toolsEnabled: true,
        isRawModelRun: false,
      });
      const catalogRef = createToolSearchCatalogRef();
      // Policy already removed ordinary tools. Tool Search then re-adds its controls.
      const recreated = plan.toolSearchControlsEnabled
        ? createToolSearchTools({
            config: plan.toolSearchRuntimeConfig,
            agentId: "theo",
            catalogRef,
            executeTool: async () => ({ content: [], details: {} }),
          })
        : [];
      const compacted = applyToolSearchCatalog({
        tools: recreated,
        config: plan.toolSearchRuntimeConfig,
        agentId: "theo",
        catalogRef,
      });
      const modelTools = projectModelFacingToolSearchControls(compacted.tools, {
        enabled: plan.toolSearchConfig.enabled,
        catalogRef,
        config: plan.toolSearchRuntimeConfig,
        agentId: "theo",
      });
      expect(namesOf(modelTools)).toEqual([]);
      for (const name of controlNames) {
        expect(namesOf(modelTools)).not.toContain(name);
      }
      const model = makeCompletionsModel({
        provider: "llamacpp",
        id: "theo-local",
        baseUrl: "http://127.0.0.1:8080/v1",
        compat: { supportsJsonSchemaResponseFormat: true },
      });
      const schema = {
        type: "object",
        properties: { reply: { type: "string" } },
        required: ["reply"],
        additionalProperties: false,
      };
      const tools = modelTools.map((tool) => ({
        name: tool.name,
        description: tool.description ?? "",
        parameters: (tool.parameters ?? { type: "object", properties: {} }) as Record<
          string,
          unknown
        >,
      }));
      for (const responseFormat of [
        { type: "json_schema" as const, json_schema: { name: "reply", schema } },
        { type: "json_object" as const },
      ]) {
        const params = buildOpenAICompletionsParams(
          model,
          { systemPrompt: "Reply with JSON.", messages: [], tools },
          { responseFormat },
        );
        expect(params).not.toHaveProperty("tools");
        expect(params).not.toHaveProperty("tool_choice");
        expect(params.response_format).toBeDefined();
      }
    } finally {
      configureAiTransportHost(previousHost);
    }
  });
});
