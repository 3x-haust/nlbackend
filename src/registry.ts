import { z } from "zod";
import type { ActionDefinition, ActionDescriptor } from "./types.js";

export class ActionRegistry {
  private readonly actions = new Map<string, ActionDefinition>();

  register<TInput extends z.ZodTypeAny, TOutput>(definition: ActionDefinition<TInput, TOutput>): this {
    if (this.actions.has(definition.name)) {
      throw new Error(`Action is already registered: ${definition.name}`);
    }

    this.actions.set(definition.name, definition as unknown as ActionDefinition);
    return this;
  }

  get(name: string): ActionDefinition | undefined {
    return this.actions.get(name);
  }

  has(name: string): boolean {
    return this.actions.has(name);
  }

  names(): string[] {
    return [...this.actions.keys()];
  }

  descriptors(): ActionDescriptor[] {
    return [...this.actions.values()].map((action) => ({
      name: action.name,
      description: action.description,
      examples: action.examples ?? [],
      kind: action.kind ?? "read",
      args: describeInput(action.input)
    }));
  }
}

function describeInput(input: z.ZodTypeAny): ActionDescriptor["args"] {
  const object = unwrapToObject(input);
  if (!object) {
    return {
      requiredKeys: [],
      properties: {}
    };
  }

  const shape = object.shape;
  const properties = Object.fromEntries(
    Object.entries(shape).map(([key, schema]) => {
      const zodSchema = schema as z.ZodTypeAny;
      const required = !zodSchema.safeParse(undefined).success;

      return [
        key,
        {
          type: describeZodType(zodSchema),
          required,
          description: zodSchema.description
        }
      ];
    })
  );

  return {
    requiredKeys: Object.entries(properties)
      .filter(([, value]) => value.required)
      .map(([key]) => key),
    properties
  };
}

function describeZodType(schema: z.ZodTypeAny): string {
  const unwrapped = unwrapSchema(schema);

  if (unwrapped instanceof z.ZodString) {
    return "string";
  }
  if (unwrapped instanceof z.ZodNumber) {
    return "number";
  }
  if (unwrapped instanceof z.ZodBoolean) {
    return "boolean";
  }
  if (unwrapped instanceof z.ZodEnum) {
    return `enum(${unwrapped.options.join(" | ")})`;
  }
  if (unwrapped instanceof z.ZodArray) {
    return `array<${describeZodType(unwrapped.element)}>`;
  }
  if (unwrapped instanceof z.ZodObject) {
    const shape = unwrapped.shape;
    const entries = Object.entries(shape)
      .map(([key, value]) => `${key}: ${describeZodType(value as z.ZodTypeAny)}`)
      .join(", ");
    return `object{${entries}}`;
  }
  if (unwrapped instanceof z.ZodRecord) {
    return `record<${describeZodType(unwrapped.valueSchema)}>`;
  }
  if (unwrapped instanceof z.ZodUnion) {
    return `union(${unwrapped.options.map((option: z.ZodTypeAny) => describeZodType(option)).join(" | ")})`;
  }
  if (unwrapped instanceof z.ZodLiteral) {
    return `literal(${JSON.stringify(unwrapped.value)})`;
  }

  return unwrapped._def.typeName.replace(/^Zod/, "").toLowerCase();
}

function unwrapSchema(schema: z.ZodTypeAny): z.ZodTypeAny {
  let current = schema;
  while (
    current instanceof z.ZodOptional ||
    current instanceof z.ZodNullable ||
    current instanceof z.ZodDefault ||
    current instanceof z.ZodEffects
  ) {
    current = current instanceof z.ZodEffects ? current._def.schema : current._def.innerType;
  }
  return current;
}

// .refine()/.transform() wrap a schema in ZodEffects, and optional/nullable/default
// wrap it too; unwrap them so a refined object (e.g. createCrudUpdateSchema) still
// exposes its real shape to the prompt and the constrained-decoding arg schema.
function unwrapToObject(schema: z.ZodTypeAny): z.ZodObject<z.ZodRawShape> | undefined {
  let current: z.ZodTypeAny = schema;
  for (let depth = 0; depth < 10; depth += 1) {
    if (current instanceof z.ZodObject) {
      return current;
    }
    if (current instanceof z.ZodEffects) {
      current = current._def.schema;
      continue;
    }
    if (current instanceof z.ZodOptional || current instanceof z.ZodNullable || current instanceof z.ZodDefault) {
      current = current._def.innerType;
      continue;
    }
    return undefined;
  }
  return undefined;
}
