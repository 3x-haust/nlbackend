import "reflect-metadata";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppModule } from "./app.module.js";

type CannedParsed = {
  type: string;
  action?: string;
  args?: Record<string, unknown>;
  message?: string;
  candidates?: string[];
};

// The only parser is the LLM, so the example test drives the same
// natural-language surface through a stubbed local model. The canned answer is
// keyed by the actual user request line, not by prompt substrings.
function cannedFor(userText: string): CannedParsed {
  if (userText === "이름이 유성윤인 유저 찾아줘") {
    return { type: "action", action: "users.findByName", args: { name: "유성윤" } };
  }
  if (userText === "유저 다 찾아줘") {
    return { type: "action", action: "users.list", args: {} };
  }
  if (userText === "유성윤에게 내일까지 액션 레지스트리 만들기 할 일 추가해줘") {
    return {
      type: "action",
      action: "todos.create",
      args: { assigneeName: "유성윤", title: "액션 레지스트리 만들기", due: "tomorrow" }
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

describe("NestJS SQLite /req example", () => {
  let app: INestApplication;

  beforeEach(async () => {
    process.env.NLBACKEND_SQLITE_PATH = ":memory:";
    process.env.NLBACKEND_PARSER = "ollama";
    process.env.NLBACKEND_WARMUP = "0";

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

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule]
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
    vi.unstubAllGlobals();
    delete process.env.NLBACKEND_SQLITE_PATH;
    delete process.env.NLBACKEND_PARSER;
    delete process.env.NLBACKEND_WARMUP;
  });

  it("runs a natural-language request against SQLite data", async () => {
    const response = await request(app.getHttpServer())
      .post("/req")
      .send({
        text: "이름이 유성윤인 유저 찾아줘",
        debug: true
      })
      .expect(200);

    expect(response.body).toMatchObject({
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
      },
      trace: {
        matchedAction: "users.findByName",
        args: {
          name: "유성윤"
        }
      }
    });
  });

  it("executes the list action the model selected against SQLite", async () => {
    const response = await request(app.getHttpServer())
      .post("/req")
      .send({
        text: "유저 다 찾아줘",
        debug: true
      })
      .expect(200);

    expect(response.body).toMatchObject({
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

  it("persists write actions in SQLite when an actor is provided", async () => {
    await request(app.getHttpServer())
      .post("/req")
      .send({
        text: "유성윤에게 내일까지 액션 레지스트리 만들기 할 일 추가해줘",
        actor: {
          id: "user_1",
          role: "admin"
        }
      })
      .expect(200);

    const todos = await request(app.getHttpServer()).get("/demo/todos").expect(200);
    expect(todos.body.todos.filter((todo: { title: string }) => todo.title === "액션 레지스트리 만들기")).toHaveLength(2);
  });
});

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body
  } as Response;
}
