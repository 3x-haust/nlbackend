import type { z } from "zod";

export type ActorRole = "admin" | "member" | "anonymous";

export interface RequestContext {
  actor?: {
    id: string;
    role: ActorRole;
  };
}

export type PolicyDecision =
  | { allow: true }
  | { allow: false; code: "policy_blocked"; message: string };

export interface ActionDefinition<TInput extends z.ZodTypeAny = z.ZodTypeAny, TOutput = unknown> {
  name: string;
  description: string;
  examples?: string[];
  input: TInput;
  kind?: "read" | "write";
  policy?: (args: z.infer<TInput>, ctx: RequestContext) => PolicyDecision | Promise<PolicyDecision>;
  handler: (args: z.infer<TInput>, ctx: RequestContext) => TOutput | Promise<TOutput>;
}

export type ActionDescriptor = {
  name: string;
  description: string;
  examples: string[];
  kind: "read" | "write";
  args: {
    requiredKeys: string[];
    properties: Record<
      string,
      {
        type: string;
        required: boolean;
        description?: string;
      }
    >;
  };
};

export type ProjectResourceRole = "domain" | "account" | "activity" | "system" | "reference";

export type ProjectResourceFieldContext = {
  name: string;
  aliases?: string[];
  type?: string;
  description?: string;
  searchable?: boolean;
  identity?: boolean;
};

export type ProjectResourceEvidence = {
  action: string;
  field: string;
  operator: "eq" | "contains" | "startsWith" | "endsWith";
  value: string | number | boolean | null;
  matchedValues: Array<string | number | boolean | null>;
  rowCount: number;
  confidence?: "high" | "medium" | "low";
  note?: string;
};

export type ProjectResourceContext = {
  name: string;
  description?: string;
  role?: ProjectResourceRole;
  aliases?: string[];
  actions?: string[];
  fields?: ProjectResourceFieldContext[];
  evidence?: ProjectResourceEvidence[];
};

export type ProjectContext = {
  notes?: string[];
  resources: ProjectResourceContext[];
};

export type ActionCall = {
  type: "action";
  action: string;
  args: Record<string, unknown>;
};

export type NeedsClarification = {
  type: "needs_clarification";
  message: string;
  candidates: string[];
};

export type UnknownAction = {
  type: "unknown_action";
  message: string;
};

export type ParserResult = ActionCall | NeedsClarification | UnknownAction;

export type DebugTrace = {
  matchedAction: string;
  args: Record<string, unknown>;
  parser?: "ollama" | "openai-compatible";
  model?: string;
  hardware?: "cpu" | "gpu" | "auto";
  numGpu?: number;
  projectContext?: ProjectContext;
};

export type ReqSuccess = {
  ok: true;
  data: unknown;
  trace?: DebugTrace;
};

export type ReqFailure = {
  ok: false;
  error: {
    code:
      | "needs_clarification"
      | "unknown_action"
      | "validation_failed"
      | "policy_blocked"
      | "model_unavailable"
      | "not_found";
    message: string;
    candidates?: string[];
    issues?: unknown;
  };
  trace?: DebugTrace;
};

export type ReqResponse = ReqSuccess | ReqFailure;
