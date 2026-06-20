import { Body, Controller, Get, Inject, Post, Res } from "@nestjs/common";
import { statusCodeForReqResponse, type LlmParserOptions, type ParserProvider, type ReqResponse, type RequestContext } from "nlbackend";
import { NlRequestService } from "./nl-request.service.js";
import { SqliteDemoService } from "./sqlite-demo.service.js";

type ReqBody = {
  text?: unknown;
  debug?: unknown;
  parser?: unknown;
  llm?: unknown;
  actor?: RequestContext["actor"];
};

@Controller()
export class ReqController {
  constructor(
    @Inject(NlRequestService)
    private readonly nlRequest: NlRequestService,
    @Inject(SqliteDemoService)
    private readonly sqlite: SqliteDemoService
  ) {}

  @Get("health")
  health() {
    return {
      ok: true,
      dbPath: this.sqlite.dbPath
    };
  }

  @Get("demo/users")
  async users() {
    return {
      users: await this.sqlite.listUsers()
    };
  }

  @Get("demo/todos")
  async todos() {
    return {
      todos: await this.sqlite.listTodos()
    };
  }

  @Get("demo/students")
  async students() {
    return {
      students: await this.sqlite.listStudents()
    };
  }

  @Post("req")
  async req(@Body() body: ReqBody, @Res({ passthrough: true }) response: { status: (code: number) => unknown }): Promise<ReqResponse> {
    if (typeof body.text !== "string" || body.text.trim().length === 0) {
      response.status(400);
      return {
        ok: false,
        error: {
          code: "validation_failed",
          message: "요청 body는 text 문자열을 포함해야 합니다."
        }
      };
    }

    const result = await this.nlRequest.req(body.text, {
      debug: body.debug === true,
      ctx: body.actor ? { actor: body.actor } : {},
      parser: parseProvider(body.parser),
      llm: parseLlmOptions(body.llm)
    });
    response.status(statusCodeForReqResponse(result));
    return result;
  }
}

function parseProvider(value: unknown): ParserProvider | undefined {
  if (value === "ollama" || value === "openai-compatible") {
    return value;
  }
  return undefined;
}

function parseLlmOptions(value: unknown): LlmParserOptions | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const hardware =
    record.hardware === "cpu" || record.hardware === "gpu" || record.hardware === "auto" ? record.hardware : undefined;
  const numGpu = Number.isInteger(record.numGpu) && Number(record.numGpu) >= 0 ? Number(record.numGpu) : undefined;
  const numThread = Number.isInteger(record.numThread) && Number(record.numThread) >= 1 ? Number(record.numThread) : undefined;
  const numPredict = Number.isInteger(record.numPredict) && Number(record.numPredict) >= 1 ? Number(record.numPredict) : undefined;
  const keepAlive = typeof record.keepAlive === "string" && record.keepAlive.trim().length > 0 ? record.keepAlive : undefined;
  const writeModel = typeof record.writeModel === "string" && record.writeModel.trim().length > 0 ? record.writeModel.trim() : undefined;

  return {
    hardware,
    numGpu,
    numThread,
    numPredict,
    keepAlive,
    writeModel
  };
}
