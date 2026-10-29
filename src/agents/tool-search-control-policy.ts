import type { OpenClawConfig } from "../config/types.openclaw.js";
import { resolveProviderToolPolicyEntry } from "./provider-tool-policy.js";
import { isToolAllowedByPolicyName } from "./tool-policy-match.js";
import { readAgentTools } from "./tool-search-config.js";

/**
 * Control tools are created after the ordinary tool-policy pipeline. Deny
 * still applies to those names, including `*` and the `tool_call` alias for
 * `dispatch_action`. Allowlists and profiles do not: they already decided
 * which real tools were admitted, and the controls are how a non-empty hidden
 * catalog stays reachable. Group, sandbox, and subagent policies filtered the
 * catalog inputs and are not re-applied.
 */
export function createToolSearchControlAllowance(params: {
  config?: OpenClawConfig;
  agentId?: string;
  modelProvider?: string;
  modelId?: string;
}): (name: string) => boolean {
  const config = params.config;
  if (!config) {
    return () => true;
  }
  const agentTools = readAgentTools(config, params.agentId);
  const globalTools = config.tools;
  const providerPolicy = resolveProviderToolPolicyEntry({
    byProvider: globalTools?.byProvider,
    modelProvider: params.modelProvider,
    modelId: params.modelId,
  })?.policy;
  const agentProviderPolicy = resolveProviderToolPolicyEntry({
    byProvider: agentTools?.byProvider,
    modelProvider: params.modelProvider,
    modelId: params.modelId,
  })?.policy;
  const denies = [
    globalTools?.deny,
    providerPolicy?.deny,
    agentTools?.deny,
    agentProviderPolicy?.deny,
  ].filter((deny): deny is string[] => Array.isArray(deny));
  if (denies.length === 0) {
    return () => true;
  }
  return (name: string) => denies.every((deny) => isToolAllowedByPolicyName(name, { deny }));
}
