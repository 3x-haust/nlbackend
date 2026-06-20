import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { FastifyInstance } from "fastify";
import { createApp } from "../src/app.js";
import { createNLBackend } from "../src/nlbackend.js";

type CannedParsed = {
  type: string;
  action?: string;
  args?: Record<string, unknown>;
  message?: string;
  candidates?: string[];
};

// The LLM is the only parser now, so tests stub it. The canned answer is keyed by
// the actual user request (the `User request:` line), not by substrings of the
// prompt — action examples are embedded in the prompt and would false-match.
function cannedFor(userText: string): CannedParsed {
  if (userText === "이름이 유성윤인 유저 찾아줘") {
    return { type: "action", action: "users.findByName", args: { name: "유성윤" } };
  }
  if (userText === "유저 다 찾아줘") {
    return { type: "action", action: "users.list", args: {} };
  }
  if (userText === "김민지를 admin으로 바꿔줘") {
    return { type: "action", action: "users.updateRole", args: { name: "김민지", role: "admin" } };
  }
  if (userText === "48ysfat 세션 토큰 24435 맞는지 확인해줘") {
    return { type: "action", action: "auth.verifySessionToken", args: { sessionId: "48ysfat", token: "24435" } };
  }
  if (userText === "유성윤 찾아줘") {
    return {
      type: "needs_clarification",
      message: "어떤 리소스에서 찾을지 더 알려주세요.",
      candidates: ["users.findByName", "todos.listByAssignee", "logs.search"]
    };
  }
  return { type: "unknown_action", message: "등록된 action으로 처리할 수 없는 요청입니다." };
}

function userTextFromPrompt(prompt: string): string {
  const direct = prompt.match(/User request: (.*)$/s);
  if (direct) {
    return direct[1].trim();
  }
  const repair = prompt.match(/Original user request:\n([\s\S]*?)\n\n/);
  return repair ? repair[1].trim() : "";
}

function installLlmStub() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const target = String(url);
      if (target.endsWith("/api/tags")) {
        return jsonResponse({ models: [{ name: "qwen2.5:3b" }] });
      }

      const body = init?.body ? (JSON.parse(String(init.body)) as { prompt?: string }) : {};
      const canned = cannedFor(userTextFromPrompt(body.prompt ?? ""));
      return jsonResponse({ response: JSON.stringify(canned) });
    })
  );
}

beforeEach(() => {
  installLlmStub();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /req", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = createApp({ parser: "ollama" });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns only handler data by default", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/req",
      payload: {
        text: "이름이 유성윤인 유저 찾아줘"
      }
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toMatchObject({
      ok: true,
      data: {
        users: [
          {
            id: "user_1",
            name: "유성윤",
            email: "sungyoon@example.com",
            role: "admin",
            status: "active"
          },
          {
            id: "user_3",
            name: "유성윤",
            email: "other-yoo@example.com",
            role: "member",
            status: "blocked"
          }
        ]
      }
    });
    expect(body.trace).toBeUndefined();
    expect(body.action).toBeUndefined();
  });

  it("includes matched action trace only in debug mode", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/req",
      payload: {
        text: "이름이 유성윤인 유저 찾아줘",
        debug: true
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      trace: {
        matchedAction: "users.findByName",
        args: {
          name: "유성윤"
        }
      }
    });
  });

  it("executes exactly the list action the model selected", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/req",
      payload: {
        text: "유저 다 찾아줘",
        debug: true
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      ok: true,
      data: {
        users: [
          { id: "user_1" },
          { id: "user_2" },
          { id: "user_3" },
          { id: "user_4" }
        ]
      },
      trace: {
        matchedAction: "users.list",
        args: {}
      }
    });
  });

  it("does not execute ambiguous prompts the model flagged for clarification", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/req",
      payload: {
        text: "유성윤 찾아줘"
      }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({
      ok: false,
      error: {
        code: "needs_clarification",
        candidates: ["users.findByName", "todos.listByAssignee", "logs.search"]
      }
    });
  });

  it("blocks registered write actions through the policy gate", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/req",
      payload: {
        text: "김민지를 admin으로 바꿔줘",
        debug: true
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      ok: false,
      error: {
        code: "policy_blocked",
        message: "관리자 권한이 필요한 action입니다."
      },
      trace: {
        matchedAction: "users.updateRole",
        args: {
          name: "김민지",
          role: "admin"
        }
      }
    });
  });
});

describe("NLBackend SDK surface", () => {
  it("supports nl.req natural-language execution", async () => {
    const nl = createNLBackend({ parser: "ollama" });
    await expect(nl.req("48ysfat 세션 토큰 24435 맞는지 확인해줘")).resolves.toMatchObject({
      ok: true,
      data: {
        success: true,
        userId: "user_1"
      }
    });
  });
});

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body
  } as Response;
}
