import { describe, expect, it } from "vitest";
import {
  agentTurnStreamParams,
  parseAgentResponseFormatFlag,
  parseAgentSeedFlag,
} from "./agent-response-format.js";

const schema = {
  type: "object",
  properties: { gap: { type: "number" } },
  required: ["gap"],
  additionalProperties: false,
};

describe("agent reply format flags", () => {
  it("parses the two closed shapes and rejects anything else", () => {
    const jsonSchema = {
      type: "json_schema",
      json_schema: { name: "reply", schema },
    };
    expect(parseAgentResponseFormatFlag(JSON.stringify(jsonSchema))).toEqual(jsonSchema);
    expect(
      parseAgentResponseFormatFlag(JSON.stringify({ type: "json_object", schema })),
    ).toEqual({ type: "json_object", schema });
    expect(parseAgentResponseFormatFlag(undefined)).toBeUndefined();
    expect(() => parseAgentResponseFormatFlag("{")).toThrow(/JSON/);
    expect(() => parseAgentResponseFormatFlag('{"type":"text"}')).toThrow(/json_schema or json_object/);
    expect(() => parseAgentResponseFormatFlag('{"type":"json_object"}')).toThrow(/schema/);
  });

  it("parses an integer seed and nothing else", () => {
    expect(parseAgentSeedFlag(undefined)).toBeUndefined();
    expect(parseAgentSeedFlag("17")).toBe(17);
    expect(parseAgentSeedFlag("-3")).toBe(-3);
    expect(() => parseAgentSeedFlag("1.5")).toThrow(/integer/);
    expect(() => parseAgentSeedFlag("nope")).toThrow(/integer/);
  });

  it("reaches streamParams only when a field is set", () => {
    const format = { type: "json_object", schema };
    expect(agentTurnStreamParams({})).toBeUndefined();
    expect(agentTurnStreamParams({ responseFormat: format })).toEqual({
      responseFormat: format,
    });
    expect(agentTurnStreamParams({ seed: 9 })).toEqual({ seed: 9 });
    expect(agentTurnStreamParams({ responseFormat: format, seed: 9 })).toEqual({
      responseFormat: format,
      seed: 9,
    });
  });
});
