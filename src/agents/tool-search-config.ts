import { normalizeAgentId } from "@openclaw/normalization-core/agent-id";
import type { OpenClawConfig } from "../config/types.openclaw.js";
import type {
  AgentToolsConfig,
  ToolSearchConfig as AuthoredToolSearchConfig,
} from "../config/types.tools.js";
import { MAX_TOOL_SEARCH_RESULTS, type ToolSearchConfig } from "./tool-search-types.js";

const DEFAULT_SEARCH_LIMIT = 8;
const DEFAULT_MAX_SEARCH_LIMIT = 20;

export function readAgentTools(
  config: OpenClawConfig | undefined,
  agentId?: string,
): AgentToolsConfig | undefined {
  if (!config || !agentId?.trim()) {
    return undefined;
  }
  const id = normalizeAgentId(agentId);
  const entries = config.agents?.entries;
  if (!entries) {
    return undefined;
  }
  for (const key of Object.keys(entries)) {
    if (normalizeAgentId(key) === id) {
      return entries[key]?.tools;
    }
  }
  return undefined;
}

function readAgentToolSearch(
  config: OpenClawConfig | undefined,
  agentId?: string,
): AuthoredToolSearchConfig | undefined {
  return readAgentTools(config, agentId)?.toolSearch;
}

/** Agent `tools.toolSearch` replaces the global setting wholesale when it is set. */
export function resolveToolSearchConfig(
  config?: OpenClawConfig,
  agentId?: string,
): ToolSearchConfig {
  const agentSetting = readAgentToolSearch(config, agentId);
  const setting = agentSetting !== undefined ? agentSetting : config?.tools?.toolSearch;
  const raw: Exclude<AuthoredToolSearchConfig, boolean> =
    setting === undefined || typeof setting === "boolean" ? { enabled: setting ?? true } : setting;
  const configured = Object.keys(raw).some((key) => key !== "enabled");
  const maxSearchLimit = Math.min(
    MAX_TOOL_SEARCH_RESULTS,
    raw.maxSearchLimit ?? DEFAULT_MAX_SEARCH_LIMIT,
  );
  return {
    enabled: raw.enabled ?? configured,
    mode: raw.mode ?? "tools",
    searchDefaultLimit: Math.min(maxSearchLimit, raw.searchDefaultLimit ?? DEFAULT_SEARCH_LIMIT),
    maxSearchLimit,
    ...(raw.include !== undefined ? { include: raw.include } : {}),
    ...(raw.exclude !== undefined ? { exclude: raw.exclude } : {}),
  };
}

/**
 * Copy an authored agent Tool Search choice onto `tools.toolSearch` without
 * mutating the caller's config. Omitted agent settings leave the object as-is.
 */
export function resolveToolSearchRuntimeConfig(
  config: OpenClawConfig | undefined,
  agentId?: string,
): OpenClawConfig | undefined {
  const agentSetting = readAgentToolSearch(config, agentId);
  if (!config || agentSetting === undefined) {
    return config;
  }
  return {
    ...config,
    tools: { ...config.tools, toolSearch: agentSetting },
  };
}

/**
 * Memory flush and explicit disable win after the agent overlay. The cloned
 * agent entry is cleared too, so a later resolve with the same agent id cannot
 * put the authored setting back.
 */
export function forceToolSearchDisabled(
  config: OpenClawConfig | undefined,
  agentId?: string,
): OpenClawConfig | undefined {
  if (!config) {
    return config;
  }
  const disabled: OpenClawConfig = {
    ...config,
    tools: { ...config.tools, toolSearch: false },
  };
  if (readAgentToolSearch(config, agentId) === undefined || !agentId) {
    return disabled;
  }
  return replaceAgentToolSearch(disabled, agentId, false);
}

function replaceAgentToolSearch(
  config: OpenClawConfig,
  agentId: string,
  toolSearch: false,
): OpenClawConfig {
  const id = normalizeAgentId(agentId);
  const entries = config.agents?.entries;
  if (!entries) {
    return config;
  }
  const key = Object.keys(entries).find((candidate) => normalizeAgentId(candidate) === id);
  const entry = key ? entries[key] : undefined;
  if (!key || !entry?.tools) {
    return config;
  }
  return {
    ...config,
    agents: {
      ...config.agents,
      entries: {
        ...entries,
        [key]: { ...entry, tools: { ...entry.tools, toolSearch } },
      },
    },
  };
}
