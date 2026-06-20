import { createDemoRegistry } from "./actions.js";
import { executeParsedRequest } from "./executor.js";
import { ensureLlmProviderReady, parseRequestWithLlm, parserProviderFromEnv, type LlmParserOptions, type ParserProvider } from "./llm-parser.js";
import type { ActionRegistry } from "./registry.js";
import type { ProjectContext, ReqResponse, RequestContext } from "./types.js";

export type ProjectContextProvider = (input: {
  text: string;
  registry: ActionRegistry;
  ctx: RequestContext;
}) => ProjectContext | Promise<ProjectContext | undefined> | undefined;

export type NLBackendOptions = {
  registry?: ActionRegistry;
  ctx?: RequestContext;
  parser?: ParserProvider;
  llm?: LlmParserOptions;
  projectContextProvider?: ProjectContextProvider;
};

export type ReqOptions = {
  debug?: boolean;
  ctx?: RequestContext;
  parser?: ParserProvider;
  llm?: LlmParserOptions;
};

export class NLBackend {
  private readonly registry: ActionRegistry;
  private readonly defaultContext: RequestContext;
  private readonly defaultParser: ParserProvider;
  private readonly defaultLlmOptions: LlmParserOptions;
  private readonly projectContextProvider?: ProjectContextProvider;

  constructor(options: NLBackendOptions = {}) {
    this.registry = options.registry ?? createDemoRegistry();
    this.defaultContext = options.ctx ?? {};
    this.defaultParser = options.parser ?? parserProviderFromEnv("ollama");
    this.defaultLlmOptions = options.llm ?? {};
    this.projectContextProvider = options.projectContextProvider;
  }

  async ensureReady(options: ReqOptions = {}): Promise<void> {
    const parser = options.parser ?? this.defaultParser;
    if (parser === "ollama") {
      await ensureLlmProviderReady({
        ...this.defaultLlmOptions,
        ...options.llm,
        provider: "ollama"
      });
    }
  }

  async req(text: string, options: ReqOptions = {}): Promise<ReqResponse> {
    const parser = options.parser ?? this.defaultParser;
    const ctx = options.ctx ?? this.defaultContext;

    try {
      const llmOptions = {
        ...this.defaultLlmOptions,
        ...options.llm
      };
      if (!llmOptions.projectContext && this.projectContextProvider) {
        llmOptions.projectContext = await this.projectContextProvider({
          text,
          registry: this.registry,
          ctx
        });
      }

      const parsedWithTrace = await parseRequestWithLlm(text, this.registry, {
        ...llmOptions,
        provider: parser
      });

      return executeParsedRequest(this.registry, parsedWithTrace.parsed, {
        debug: options.debug,
        ctx,
        trace: parsedWithTrace.trace
      });
    } catch (error) {
      return {
        ok: false,
        error: {
          code: "model_unavailable",
          message: error instanceof Error ? error.message : "로컬 모델 parser를 사용할 수 없습니다."
        }
      };
    }
  }
}

export function createNLBackend(options: NLBackendOptions = {}): NLBackend {
  return new NLBackend(options);
}
