import { z } from "zod";

export const CrudScalarSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const CrudOperatorSchema = z.enum([
  "eq",
  "neq",
  "contains",
  "startsWith",
  "endsWith",
  "lt",
  "lte",
  "gt",
  "gte",
  "in"
]);

export const CrudSortDirectionSchema = z.enum(["asc", "desc"]);

type CrudFieldTuple = readonly [string, ...string[]];
type MutableEnumTuple<TFields extends CrudFieldTuple> = [TFields[number], ...TFields[number][]];

function enumTuple<TFields extends CrudFieldTuple>(fields: TFields): MutableEnumTuple<TFields> {
  return [...fields] as MutableEnumTuple<TFields>;
}

export function createCrudFilterSchema<const TFields extends CrudFieldTuple>(fields: TFields) {
  return z
    .object({
      field: z.enum(enumTuple(fields)).describe("Allowed resource field to filter."),
      operator: CrudOperatorSchema.describe(
        "Comparison operator. Use endsWith for given-name style full-name requests when no separate givenName field exists."
      ),
      value: z.union([CrudScalarSchema, z.array(CrudScalarSchema)]).describe("Explicit value extracted from the user request."),
      caseSensitive: z.boolean().optional().describe("Defaults to false for text matching.")
    })
    .strict();
}

export function createCrudSortSchema<const TFields extends CrudFieldTuple>(fields: TFields) {
  return z
    .object({
      field: z.enum(enumTuple(fields)).describe("Allowed resource field to sort by."),
      direction: CrudSortDirectionSchema
    })
    .strict();
}

export function createCrudSearchSchema<const TFields extends CrudFieldTuple>(fields: TFields) {
  const filter = createCrudFilterSchema(fields);
  const sort = createCrudSortSchema(fields);

  return z
    .object({
      filters: z.array(filter).default([]).describe("Structured natural-language constraints. Keep every user constraint here."),
      keyword: z.string().min(1).optional().describe("Fallback free-text keyword only when no precise field is implied."),
      sort: z.array(sort).default([]),
      limit: z.number().int().min(1).max(100).default(20),
      offset: z.number().int().min(0).default(0)
    })
    .strict();
}

export function createCrudWhereSchema<const TFields extends CrudFieldTuple>(fields: TFields) {
  const filter = createCrudFilterSchema(fields);

  return z
    .object({
      filters: z.array(filter).min(1).describe("Narrow target rows. Required for update/delete.")
    })
    .strict();
}

export function createCrudGetSchema() {
  return z
    .object({
      id: z.string().min(1)
    })
    .strict();
}

export function createCrudCreateSchema<TData extends z.ZodRawShape>(shape: TData) {
  return z
    .object({
      data: z.object(shape).strict()
    })
    .strict();
}

export function createCrudUpdateSchema<const TFields extends CrudFieldTuple, TPatch extends z.ZodRawShape>(
  fields: TFields,
  patchShape: TPatch
) {
  return z
    .object({
      where: createCrudWhereSchema(fields),
      patch: z.object(patchShape).partial().strict(),
      limit: z.number().int().min(1).max(100).default(20)
    })
    .strict()
    .refine((value) => Object.keys(value.patch ?? {}).length > 0, {
      path: ["patch"],
      message: "patch must include at least one field"
    });
}

export function createCrudDeleteSchema<const TFields extends CrudFieldTuple>(fields: TFields) {
  return z
    .object({
      where: createCrudWhereSchema(fields),
      mode: z.enum(["soft", "hard"]).default("soft"),
      limit: z.number().int().min(1).max(100).default(20)
    })
    .strict();
}

export type CrudScalar = z.infer<typeof CrudScalarSchema>;
export type CrudOperator = z.infer<typeof CrudOperatorSchema>;
export type CrudFilter = z.infer<ReturnType<typeof createCrudFilterSchema>>;
export type CrudSort = z.infer<ReturnType<typeof createCrudSortSchema>>;
export type CrudSearchArgs = z.infer<ReturnType<typeof createCrudSearchSchema>>;
export type CrudWhereArgs = z.infer<ReturnType<typeof createCrudWhereSchema>>;
export type CrudDeleteArgs = z.infer<ReturnType<typeof createCrudDeleteSchema>>;
