import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { z } from "zod";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, entry]) => [key, canonicalize(entry)]));
}

export function hashMcpSchema(schema: unknown) {
  return createHash("sha256").update(JSON.stringify(canonicalize(schema ?? {}))).digest("hex");
}

function primitiveSchema(schema: Record<string, unknown>): z.ZodTypeAny {
  const enumValues = Array.isArray(schema.enum) ? schema.enum : null;
  if (enumValues?.length) {
    return z.any().refine((value) => enumValues.some((entry) => Object.is(entry, value)), { message: "Value is outside the certified enum" });
  }

  switch (schema.type) {
    case "string": {
      let result = z.string();
      if (typeof schema.minLength === "number") result = result.min(schema.minLength);
      if (typeof schema.maxLength === "number") result = result.max(schema.maxLength);
      return result;
    }
    case "integer": {
      let result = z.number().int();
      if (typeof schema.minimum === "number") result = result.min(schema.minimum);
      if (typeof schema.maximum === "number") result = result.max(schema.maximum);
      return result;
    }
    case "number": {
      let result = z.number();
      if (typeof schema.minimum === "number") result = result.min(schema.minimum);
      if (typeof schema.maximum === "number") result = result.max(schema.maximum);
      return result;
    }
    case "boolean":
      return z.boolean();
    case "null":
      return z.null();
    default:
      throw new Error(`MCP_JSON_SCHEMA_TYPE_UNSUPPORTED:${String(schema.type || "missing")}`);
  }
}

export function mcpJsonSchemaToZod(schema: unknown): z.ZodTypeAny {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) throw new Error("MCP_JSON_SCHEMA_INVALID");
  const value = schema as Record<string, unknown>;
  if (Object.keys(value).length === 0) return z.unknown();
  if (value.anyOf || value.oneOf || value.allOf || value.$ref || value.not || value.if || value.then || value.else) throw new Error("MCP_JSON_SCHEMA_COMPOSITION_UNSUPPORTED");

  if (value.type === "object" || value.properties) {
    const properties = value.properties && typeof value.properties === "object" && !Array.isArray(value.properties)
      ? value.properties as Record<string, unknown>
      : {};
    const required = new Set(Array.isArray(value.required) ? value.required.filter((entry): entry is string => typeof entry === "string") : []);
    const shape: Record<string, z.ZodTypeAny> = {};
    for (const [key, property] of Object.entries(properties)) {
      const child = mcpJsonSchemaToZod(property);
      shape[key] = required.has(key) ? child : child.optional();
    }
    const object = z.object(shape);
    return value.additionalProperties === false ? object.strict() : object.passthrough();
  }

  if (value.type === "array") {
    if (!value.items) throw new Error("MCP_JSON_SCHEMA_ARRAY_ITEMS_REQUIRED");
    let result = z.array(mcpJsonSchemaToZod(value.items));
    if (typeof value.minItems === "number") result = result.min(value.minItems);
    if (typeof value.maxItems === "number") result = result.max(value.maxItems);
    return result;
  }

  return primitiveSchema(value);
}

function collectHeaderAnnotations(schema: unknown, path: string[] = [], seen = new Set<string>()): Array<{ path: string[]; headerName: string; type: string }> {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return [];
  const value = schema as Record<string, unknown>;
  const annotation = value["x-mcp-header"];
  const found: Array<{ path: string[]; headerName: string; type: string }> = [];
  if (annotation !== undefined) {
    if (typeof annotation !== "string" || !annotation || !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(annotation)) throw new Error("MCP_X_HEADER_NAME_INVALID");
    const normalized = annotation.toLowerCase();
    if (seen.has(normalized)) throw new Error("MCP_X_HEADER_NAME_DUPLICATE");
    seen.add(normalized);
    if (!path.length || !["string", "integer", "boolean"].includes(String(value.type))) throw new Error("MCP_X_HEADER_TYPE_UNSUPPORTED");
    found.push({ path, headerName: `Mcp-Param-${annotation}`, type: String(value.type) });
  }
  if (value.type === "object" || value.properties) {
    const properties = value.properties && typeof value.properties === "object" && !Array.isArray(value.properties) ? value.properties as Record<string, unknown> : {};
    for (const [key, child] of Object.entries(properties)) found.push(...collectHeaderAnnotations(child, [...path, key], seen));
  }
  return found;
}

function valueAtPath(root: unknown, path: string[]) {
  let current = root;
  for (const key of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

function needsBase64HeaderEncoding(value: string) {
  if (value.startsWith("=?base64?") && value.endsWith("?=")) return true;
  if (value !== value.trim()) return true;
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code === 0x09) continue;
    if (code < 0x20 || code > 0x7e) return true;
  }
  return false;
}

export function encodeMcpHeaderValue(value: string) {
  return needsBase64HeaderEncoding(value)
    ? `=?base64?${Buffer.from(value, "utf8").toString("base64")}?=`
    : value;
}

export function buildMcpParameterHeaders(schema: unknown, args: unknown) {
  const headers: Record<string, string> = {};
  for (const annotation of collectHeaderAnnotations(schema)) {
    const value = valueAtPath(args, annotation.path);
    if (value === undefined || value === null) continue;
    if (annotation.type === "integer" && (typeof value !== "number" || !Number.isSafeInteger(value))) throw new Error("MCP_X_HEADER_INTEGER_INVALID");
    if (annotation.type === "boolean" && typeof value !== "boolean") throw new Error("MCP_X_HEADER_BOOLEAN_INVALID");
    if (annotation.type === "string" && typeof value !== "string") throw new Error("MCP_X_HEADER_STRING_INVALID");
    headers[annotation.headerName] = encodeMcpHeaderValue(String(value));
  }
  return headers;
}

export function assertSupportedMcpSchema(schema: unknown) {
  try {
    mcpJsonSchemaToZod(schema);
    collectHeaderAnnotations(schema);
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : "MCP_JSON_SCHEMA_UNSUPPORTED";
  }
}
