import { spawn, spawnSync } from "node:child_process";

// 3b is the default: small models (<=1.5b) cannot reliably build structured args.
// Raspberry-Pi-class hosts can downshift via NLBACKEND_OLLAMA_MODEL=qwen2.5:1.5b.
export const DEFAULT_OLLAMA_MODEL = "qwen2.5:3b";
export const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";

export type EnsureOllamaOptions = {
  baseUrl?: string;
  model?: string;
  autoStart?: boolean;
  pullIfMissing?: boolean;
  timeoutMs?: number;
};

export class LocalModelError extends Error {
  constructor(
    message: string,
    readonly code: "ollama_not_found" | "ollama_unreachable" | "model_missing" | "model_pull_failed"
  ) {
    super(message);
  }
}

export function ollamaConfigFromEnv() {
  return {
    baseUrl: process.env.NLBACKEND_OLLAMA_URL ?? DEFAULT_OLLAMA_BASE_URL,
    model: process.env.NLBACKEND_OLLAMA_MODEL ?? DEFAULT_OLLAMA_MODEL,
    numGpu: parseOptionalNumber(process.env.NLBACKEND_OLLAMA_NUM_GPU, 0),
    numThread: parseOptionalNumber(process.env.NLBACKEND_OLLAMA_NUM_THREAD),
    autoPull: process.env.NLBACKEND_OLLAMA_AUTO_PULL !== "0"
  };
}

export async function ensureOllamaModel(options: EnsureOllamaOptions = {}) {
  const baseUrl = options.baseUrl ?? DEFAULT_OLLAMA_BASE_URL;
  const model = options.model ?? DEFAULT_OLLAMA_MODEL;
  const timeoutMs = options.timeoutMs ?? 30_000;

  if (!(await isOllamaReachable(baseUrl))) {
    if (options.autoStart === false) {
      throw new LocalModelError(`Ollama server is not reachable at ${baseUrl}.`, "ollama_unreachable");
    }

    const ollamaBin = findOllamaBinary();
    if (!ollamaBin) {
      throw new LocalModelError("Ollama CLI is not installed, so the local model server cannot be started.", "ollama_not_found");
    }

    spawn(ollamaBin, ["serve"], {
      detached: true,
      env: {
        ...process.env,
        OLLAMA_FLASH_ATTENTION: process.env.OLLAMA_FLASH_ATTENTION ?? "0"
      },
      stdio: "ignore"
    }).unref();

    await waitForOllama(baseUrl, timeoutMs);
  }

  if (await hasOllamaModel(baseUrl, model)) {
    return { baseUrl, model, pulled: false };
  }

  if (options.pullIfMissing === false) {
    throw new LocalModelError(`Ollama model is not installed: ${model}`, "model_missing");
  }

  await pullOllamaModel(baseUrl, model);
  return { baseUrl, model, pulled: true };
}

export async function isOllamaReachable(baseUrl = DEFAULT_OLLAMA_BASE_URL): Promise<boolean> {
  try {
    const response = await fetch(joinUrl(baseUrl, "/api/tags"));
    return response.ok;
  } catch {
    return false;
  }
}

export function findOllamaBinary(): string | null {
  const result = spawnSync("sh", ["-lc", "command -v ollama"], {
    encoding: "utf8"
  });

  const path = result.stdout.trim();
  return path.length > 0 ? path : null;
}

async function waitForOllama(baseUrl: string, timeoutMs: number) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await isOllamaReachable(baseUrl)) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 750));
  }

  throw new LocalModelError(`Ollama server did not become ready at ${baseUrl}.`, "ollama_unreachable");
}

async function hasOllamaModel(baseUrl: string, model: string): Promise<boolean> {
  const response = await fetch(joinUrl(baseUrl, "/api/tags"));
  if (!response.ok) {
    throw new LocalModelError(`Ollama tags request failed with HTTP ${response.status}.`, "ollama_unreachable");
  }

  const body = (await response.json()) as { models?: Array<{ name?: string; model?: string }> };
  return (body.models ?? []).some((entry) => entry.name === model || entry.model === model);
}

async function pullOllamaModel(baseUrl: string, model: string) {
  const ollamaBin = findOllamaBinary();
  if (ollamaBin) {
    await new Promise<void>((resolve, reject) => {
      const child = spawn(ollamaBin, ["pull", model], {
        stdio: "inherit"
      });
      child.on("exit", (code) => {
        if (code === 0) resolve();
        else reject(new LocalModelError(`ollama pull ${model} failed with exit code ${code}.`, "model_pull_failed"));
      });
      child.on("error", (error) => reject(error));
    });
    return;
  }

  const response = await fetch(joinUrl(baseUrl, "/api/pull"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model, stream: false })
  });

  if (!response.ok) {
    throw new LocalModelError(`Ollama model pull failed with HTTP ${response.status}.`, "model_pull_failed");
  }
}

function parseOptionalNumber(value: string | undefined, fallback?: number): number | undefined {
  if (value === undefined || value === "") {
    return fallback;
  }
  if (value === "auto") {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function joinUrl(baseUrl: string, path: string) {
  return `${baseUrl.replace(/\/$/, "")}${path}`;
}
