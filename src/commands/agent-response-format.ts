import { resolveOpenAiStreamParams } from "../gateway/openai-compat-errors.js";
import type { AgentStreamParams } from "../agents/command/shared-types.js";

const NON_EMPTY = /\S/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Parse `--response-format <json>` into the closed agent reply contract. */
export function parseAgentResponseFormatFlag(
  raw: string | undefined,
): Record<string, unknown> | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const text = raw.trim();
  if (!text) {
    throw new Error("--response-format must be a JSON object");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("--response-format must be JSON");
  }
  if (!isRecord(parsed)) {
    throw new Error("--response-format must be a JSON object");
  }
  if (parsed.type === "json_schema") {
    const descriptor = parsed.json_schema;
    if (
      !isRecord(descriptor) ||
      typeof descriptor.name !== "string" ||
      !NON_EMPTY.test(descriptor.name) ||
      !isRecord(descriptor.schema) ||
      Object.keys(descriptor).some((key) => key !== "name" && key !== "schema") ||
      Object.keys(parsed).some((key) => key !== "type" && key !== "json_schema")
    ) {
      throw new Error(
        '--response-format json_schema must be {"type":"json_schema","json_schema":{"name":"...","schema":{...}}}',
      );
    }
    return parsed;
  }
  if (parsed.type === "json_object") {
    if (
      !isRecord(parsed.schema) ||
      Object.keys(parsed).some((key) => key !== "type" && key !== "schema")
    ) {
      throw new Error(
        '--response-format json_object must be {"type":"json_object","schema":{...}}',
      );
    }
    return parsed;
  }
  throw new Error("--response-format type must be json_schema or json_object");
}

/** Parse `--seed <integer>`. Omitted when the flag is absent. */
export function parseAgentSeedFlag(raw: string | undefined): number | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const text = raw.trim();
  if (!/^-?\d+$/.test(text)) {
    throw new Error("--seed must be an integer");
  }
  const seed = Number(text);
  if (!Number.isSafeInteger(seed)) {
    throw new Error("--seed must be an integer");
  }
  return seed;
}

/**
 * Stream overrides for one agent turn. Same shape chat completions builds
 * with resolveOpenAiStreamParams. Undefined when neither field was set.
 */
export function agentTurnStreamParams(input: {
  responseFormat?: Record<string, unknown>;
  seed?: number;
}): AgentStreamParams | undefined {
  return resolveOpenAiStreamParams({
    responseFormat: input.responseFormat,
    seed: input.seed,
  });
}
