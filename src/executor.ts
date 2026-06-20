import { ZodError } from "zod";
import type { ActionRegistry } from "./registry.js";
import type { DebugTrace, ParserResult, ReqResponse, RequestContext } from "./types.js";

type ExecuteOptions = {
  debug?: boolean;
  ctx?: RequestContext;
  trace?: Partial<Omit<DebugTrace, "matchedAction" | "args">>;
};

export async function executeParsedRequest(
  registry: ActionRegistry,
  parsed: ParserResult,
  options: ExecuteOptions = {}
): Promise<ReqResponse> {
  if (parsed.type === "needs_clarification") {
    return {
      ok: false,
      error: {
        code: "needs_clarification",
        message: parsed.message,
        candidates: parsed.candidates
      }
    };
  }

  if (parsed.type === "unknown_action") {
    return {
      ok: false,
      error: {
        code: "unknown_action",
        message: parsed.message
      }
    };
  }

  const action = registry.get(parsed.action);
  const trace = {
    matchedAction: parsed.action,
    args: parsed.args,
    ...options.trace
  };

  if (!action) {
    return {
      ok: false,
      error: {
        code: "unknown_action",
        message: "등록된 action으로 처리할 수 없는 요청입니다."
      },
      ...(options.debug ? { trace } : {})
    };
  }

  let args: unknown;
  try {
    args = action.input.parse(parsed.args);
  } catch (error) {
    const issues = error instanceof ZodError ? error.issues : error;
    return {
      ok: false,
      error: {
        code: "validation_failed",
        message: "action input schema 검증에 실패했습니다.",
        issues
      },
      ...(options.debug ? { trace } : {})
    };
  }

  const ctx = options.ctx ?? {};
  const policy = action.policy ? await action.policy(args, ctx) : { allow: true as const };
  if (!policy.allow) {
    return {
      ok: false,
      error: {
        code: policy.code,
        message: policy.message
      },
      ...(options.debug ? { trace } : {})
    };
  }

  const data = await action.handler(args, ctx);
  if (isNotFoundResult(data)) {
    return {
      ok: false,
      error: {
        code: "not_found",
        message: "조건에 맞는 결과를 찾을 수 없습니다."
      },
      ...(options.debug ? { trace } : {})
    };
  }

  return {
    ok: true,
    data,
    ...(options.debug ? { trace } : {})
  };
}

export function statusCodeForReqResponse(response: ReqResponse): number {
  if (response.ok) {
    return 200;
  }

  switch (response.error.code) {
    case "not_found":
    case "unknown_action":
      return 404;
    case "policy_blocked":
      return 403;
    case "model_unavailable":
      return 503;
    case "needs_clarification":
    case "validation_failed":
    default:
      return 400;
  }
}

function isNotFoundResult(data: unknown): boolean {
  if (data === null || data === undefined) {
    return true;
  }

  if (Array.isArray(data)) {
    return data.length === 0;
  }

  if (typeof data !== "object") {
    return false;
  }

  const values = Object.values(data as Record<string, unknown>);
  return values.length > 0 && values.every((value) => value === null || value === undefined || (Array.isArray(value) && value.length === 0));
}
