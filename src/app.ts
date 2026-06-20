import Fastify from "fastify";
import { z } from "zod";
import { createDemoRegistry } from "./actions.js";
import { createNLBackend } from "./nlbackend.js";
import { parserProviderFromEnv, type LlmParserOptions, type ParserProvider } from "./llm-parser.js";
import { statusCodeForReqResponse } from "./executor.js";
import type { RequestContext } from "./types.js";

const LlmBodySchema = z
  .object({
    hardware: z.enum(["cpu", "gpu", "auto"]).optional(),
    numGpu: z.number().int().min(0).optional(),
    numThread: z.number().int().min(1).optional(),
    writeModel: z.string().min(1).optional()
  })
  .strict();

const ReqBodySchema = z.object({
  text: z.string().min(1),
  debug: z.boolean().optional(),
  parser: z.enum(["ollama", "openai-compatible"]).optional(),
  llm: LlmBodySchema.optional(),
  actor: z
    .object({
      id: z.string().min(1),
      role: z.enum(["admin", "member", "anonymous"])
    })
    .optional()
});

export type CreateAppOptions = {
  parser?: ParserProvider;
};

export function createApp(options: CreateAppOptions = {}) {
  const app = Fastify({
    logger: false
  });
  const nl = createNLBackend({
    registry: createDemoRegistry(),
    parser: options.parser ?? parserProviderFromEnv("ollama")
  });

  app.get("/health", async () => ({ ok: true }));

  app.post("/req", async (request, reply) => {
    const body = ReqBodySchema.safeParse(request.body);
    if (!body.success) {
      return reply.code(400).send({
        ok: false,
        error: {
          code: "validation_failed",
          message: "요청 body는 text 문자열을 포함해야 합니다.",
          issues: body.error.issues
        }
      });
    }

    const ctx: RequestContext = body.data.actor ? { actor: body.data.actor } : {};
    const result = await nl.req(body.data.text, {
      debug: body.data.debug,
      ctx,
      parser: body.data.parser,
      llm: normalizeLlmOptions(body.data.llm)
    });
    return reply.code(statusCodeForReqResponse(result)).send(result);
  });

  return app;
}

function normalizeLlmOptions(value: z.infer<typeof LlmBodySchema> | undefined): LlmParserOptions | undefined {
  if (!value) {
    return undefined;
  }

  return {
    hardware: value.hardware,
    numGpu: value.numGpu,
    numThread: value.numThread,
    writeModel: value.writeModel
  };
}
