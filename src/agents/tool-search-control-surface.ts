import type { OpenClawConfig } from "../config/types.openclaw.js";
import { createToolSearchControlAllowance } from "./tool-search-control-policy.js";
import { TOOL_SEARCH_CONTROL_TOOL_NAMES, type ToolSearchCatalogRef } from "./tool-search-types.js";

/** Hidden entries are the catalog the control tools front. Direct tools do not count. */
export function hiddenToolSearchCatalogCount(catalogRef?: ToolSearchCatalogRef): number {
  const entries = catalogRef?.current?.entries;
  if (!entries) {
    return 0;
  }
  let hidden = 0;
  for (const entry of entries) {
    if (entry.directVisible !== true) {
      hidden += 1;
    }
  }
  return hidden;
}

/** Final model-facing gate: drop denied controls, and drop every control when nothing is hidden. */
export function projectModelFacingToolSearchControls<T extends { name: string }>(
  tools: T[],
  params: {
    enabled: boolean;
    catalogRef?: ToolSearchCatalogRef;
    config?: OpenClawConfig;
    agentId?: string;
    modelProvider?: string;
    modelId?: string;
  },
): T[] {
  if (!params.enabled) {
    return tools;
  }
  const hidden = hiddenToolSearchCatalogCount(params.catalogRef);
  if (hidden === 0) {
    return tools.filter((tool) => !TOOL_SEARCH_CONTROL_TOOL_NAMES.has(tool.name));
  }
  const allowControl = createToolSearchControlAllowance(params);
  return tools.filter(
    (tool) => !TOOL_SEARCH_CONTROL_TOOL_NAMES.has(tool.name) || allowControl(tool.name),
  );
}
