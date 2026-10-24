/** Codex strict JSON Schema 경계. 원래 도메인 스키마는 변경하지 않음. */
type Schema = boolean | Record<string, unknown>;
const record = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === "object" && !Array.isArray(value);
const schemaOf = (value: unknown): Schema => typeof value === "boolean" || record(value) ? value : true;
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);

function localRef(root: Schema, ref: unknown): Schema | undefined {
  if (typeof ref !== "string" || !ref.startsWith("#")) return undefined;
  if (ref === "#") return root;
  if (!ref.startsWith("#/")) return undefined;
  let node: unknown = root;
  for (const segment of ref.slice(2).split("/")) {
    const key = decodeURIComponent(segment).replace(/~1/g, "/").replace(/~0/g, "~");
    if (!record(node) || !own(node, key)) return undefined;
    node = node[key];
  }
  return typeof node === "boolean" || record(node) ? node : undefined;
}

/** 원래 null 허용 필드는 생략 처리하지 않음. */
function allowsNull(schema: Schema, root: Schema, seen = new Set<Schema>()): boolean {
  if (typeof schema === "boolean") return schema;
  if (seen.has(schema)) return false;
  const next = new Set(seen).add(schema);
  const ref = localRef(root, schema.$ref);
  if (ref !== undefined && !allowsNull(ref, root, next)) return false;
  if (own(schema, "const") && schema.const !== null) return false;
  if (Array.isArray(schema.enum) && !schema.enum.includes(null)) return false;
  if (schema.type !== undefined && schema.type !== "null" && !(Array.isArray(schema.type) && schema.type.includes("null"))) return false;
  for (const keyword of ["anyOf", "oneOf"] as const) {
    if (Array.isArray(schema[keyword]) && !schema[keyword].some(child => allowsNull(schemaOf(child), root, next))) return false;
  }
  if (Array.isArray(schema.allOf) && !schema.allOf.every(child => allowsNull(schemaOf(child), root, next))) return false;
  if (schema.not !== undefined && allowsNull(schemaOf(schema.not), root, next)) return false;
  return true;
}

function transform(schema: Schema, root: Schema): Schema {
  if (typeof schema === "boolean") return schema;
  const out = { ...schema };
  for (const keyword of ["definitions", "$defs", "patternProperties", "dependentSchemas"] as const) {
    if (record(schema[keyword])) out[keyword] = Object.fromEntries(Object.entries(schema[keyword]).map(([key, child]) => [key, transform(schemaOf(child), root)]));
  }
  for (const keyword of ["anyOf", "oneOf", "allOf", "prefixItems"] as const) {
    if (Array.isArray(schema[keyword])) out[keyword] = schema[keyword].map(child => transform(schemaOf(child), root));
  }
  for (const keyword of ["not", "if", "then", "else", "contains", "propertyNames", "additionalItems"] as const) {
    if (schema[keyword] !== undefined) out[keyword] = transform(schemaOf(schema[keyword]), root);
  }
  if (schema.items !== undefined) out.items = Array.isArray(schema.items)
    ? schema.items.map(child => transform(schemaOf(child), root))
    : transform(schemaOf(schema.items), root);
  if (record(schema.properties)) {
    const required = new Set(Array.isArray(schema.required) ? schema.required : []);
    out.properties = Object.fromEntries(Object.entries(schema.properties).map(([key, child]) => {
      const original = schemaOf(child);
      const converted = transform(original, root);
      return [key, !required.has(key) && !allowsNull(original, root) ? { anyOf: [converted, { type: "null" }] } : converted];
    }));
    out.required = Object.keys(schema.properties);
    out.additionalProperties = false;
  }
  return out;
}

/** union 분기 선택용 형상 확인. 최종 검증은 원래 Zod에서 수행함. */
function compatible(schema: Schema, value: unknown, root: Schema, depth = 0): boolean {
  if (depth > 128) return false;
  if (typeof schema === "boolean") return schema;
  const ref = localRef(root, schema.$ref);
  if (ref !== undefined && !compatible(ref, value, root, depth + 1)) return false;
  if (own(schema, "const") && JSON.stringify(schema.const) !== JSON.stringify(value)) return false;
  if (Array.isArray(schema.enum) && !schema.enum.some(item => JSON.stringify(item) === JSON.stringify(value))) return false;
  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  if (types.length && !types.some(type => {
    switch (type) {
      case "null": return value === null;
      case "object": return record(value);
      case "array": return Array.isArray(value);
      case "integer": return typeof value === "number" && Number.isInteger(value);
      case "number": return typeof value === "number" && Number.isFinite(value);
      default: return typeof value === type;
    }
  })) return false;
  for (const keyword of ["anyOf", "oneOf"] as const) {
    if (Array.isArray(schema[keyword]) && !schema[keyword].some(child => compatible(schemaOf(child), value, root, depth + 1))) return false;
  }
  if (Array.isArray(schema.allOf) && !schema.allOf.every(child => compatible(schemaOf(child), value, root, depth + 1))) return false;
  if (record(value) && record(schema.properties)) {
    const required = new Set(Array.isArray(schema.required) ? schema.required : []);
    if ([...required].some(key => typeof key === "string" && !own(value, key))) return false;
    if (schema.additionalProperties === false && Object.keys(value).some(key => !own(schema.properties as object, key))) return false;
    for (const [key, child] of Object.entries(schema.properties)) {
      if (!own(value, key)) continue;
      if (value[key] === null && !required.has(key)) continue;
      if (!compatible(schemaOf(child), value[key], root, depth + 1)) return false;
    }
  }
  if (Array.isArray(value) && schema.items !== undefined) {
    if (!value.every((item, index) => compatible(schemaOf(Array.isArray(schema.items) ? schema.items[index] : schema.items), item, root, depth + 1))) return false;
  }
  return true;
}

/** 여러 분기가 맞으면 모든 분기가 생략한 키만 제거해 의미 있는 null을 보존함. */
function consensus(original: unknown, candidates: unknown[]): unknown {
  if (Array.isArray(original)) return original.map((item, index) => consensus(item, candidates.map(candidate => (candidate as unknown[])[index])));
  if (!record(original)) return original;
  return Object.fromEntries(Object.entries(original).flatMap(([key, value]) => {
    const owners = candidates.filter(candidate => record(candidate) && own(candidate, key)) as Record<string, unknown>[];
    if (!owners.length) return [];
    return [[key, owners.length === candidates.length ? consensus(value, owners.map(candidate => candidate[key])) : value]];
  }));
}

function restore(schema: Schema, value: unknown, root: Schema, depth = 0): unknown {
  if (typeof schema === "boolean" || depth > 128) return value;
  let result = value;
  const ref = localRef(root, schema.$ref);
  if (ref !== undefined) result = restore(ref, result, root, depth + 1);
  for (const keyword of ["anyOf", "oneOf"] as const) {
    if (!Array.isArray(schema[keyword])) continue;
    const branches = schema[keyword].map(schemaOf).filter(branch => compatible(branch, result, root));
    if (branches.length) result = consensus(result, branches.map(branch => restore(branch, result, root, depth + 1)));
  }
  if (record(result) && record(schema.properties)) {
    const required = new Set(Array.isArray(schema.required) ? schema.required : []);
    const properties = schema.properties;
    result = Object.fromEntries(Object.entries(result).flatMap(([key, child]) => {
      if (!own(properties, key)) return [[key, child]];
      const childSchema = schemaOf(properties[key]);
      if (child === null && !required.has(key) && !allowsNull(childSchema, root)) return [];
      return [[key, restore(childSchema, child, root, depth + 1)]];
    }));
  } else if (Array.isArray(result) && schema.items !== undefined) {
    result = result.map((child, index) => restore(schemaOf(Array.isArray(schema.items) ? schema.items[index] : schema.items), child, root, depth + 1));
  }
  return result;
}

export function compileCodexSchema(original: Record<string, unknown>): {
  schema: Record<string, unknown>;
  restore: (output: unknown) => unknown;
} {
  const root = structuredClone(original);
  return {
    schema: transform(root, root) as Record<string, unknown>,
    restore: output => restore(root, output, root),
  };
}
