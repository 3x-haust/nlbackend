#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const args = new Set(process.argv.slice(2));
const optional = args.has("--optional");
const checkOnly = args.has("--check");
const model = process.env.NLBACKEND_OLLAMA_MODEL || "qwen2.5:3b";
const baseUrl = process.env.NLBACKEND_OLLAMA_URL || "http://127.0.0.1:11434";

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  if (optional) {
    console.warn(`[nlbackend] local model setup skipped: ${message}`);
    process.exit(0);
  }
  console.error(`[nlbackend] local model setup failed: ${message}`);
  process.exit(1);
});

async function main() {
  if (process.env.NLBACKEND_SKIP_LOCAL_MODEL_SETUP === "1") {
    console.log("[nlbackend] local model setup skipped by NLBACKEND_SKIP_LOCAL_MODEL_SETUP=1");
    return;
  }

  if ((process.env.NLBACKEND_LLM_PROVIDER || process.env.NLBACKEND_PARSER || "ollama") !== "ollama") {
    console.log("[nlbackend] local model setup skipped because provider is not ollama");
    return;
  }

  let ollama = command("ollama");
  if (!ollama) {
    ollama = await installOllama();
  }

  if (!(await reachable())) {
    if (checkOnly) {
      throw new Error(`Ollama server is not reachable at ${baseUrl}`);
    }
    console.log("[nlbackend] starting Ollama server");
    spawn(ollama, ["serve"], {
      detached: true,
      env: {
        ...process.env,
        OLLAMA_FLASH_ATTENTION: process.env.OLLAMA_FLASH_ATTENTION || "0"
      },
      stdio: "ignore"
    }).unref();
    await waitForServer();
  }

  if (await hasModel(model)) {
    console.log(`[nlbackend] local model already installed: ${model}`);
    return;
  }

  if (checkOnly) {
    throw new Error(`Ollama model is missing: ${model}`);
  }

  console.log(`[nlbackend] pulling local CPU-capable model: ${model}`);
  run(ollama, ["pull", model]);
  console.log(`[nlbackend] ready: ${model}`);
}

async function installOllama() {
  if (process.env.NLBACKEND_SKIP_OLLAMA_INSTALL === "1") {
    throw new Error("Ollama CLI is missing and automatic install is disabled");
  }

  if (process.platform === "darwin" && command("brew")) {
    console.log("[nlbackend] installing Ollama with Homebrew");
    run("brew", ["install", "ollama"]);
    const installed = command("ollama");
    if (installed) return installed;
  }

  throw new Error("Ollama CLI is missing. Install Ollama or set NLBACKEND_SKIP_LOCAL_MODEL_SETUP=1.");
}

function command(name) {
  const result = spawnSync("sh", ["-lc", `command -v ${name}`], { encoding: "utf8" });
  const output = result.stdout.trim();
  return output.length > 0 ? output : null;
}

function run(cmd, cmdArgs) {
  const result = spawnSync(cmd, cmdArgs, { stdio: "inherit" });
  if (result.status !== 0) {
    throw new Error(`${cmd} ${cmdArgs.join(" ")} failed with exit code ${result.status}`);
  }
}

async function reachable() {
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/tags`);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForServer() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 30_000) {
    if (await reachable()) return;
    await delay(750);
  }
  throw new Error(`Ollama server did not become ready at ${baseUrl}`);
}

async function hasModel(name) {
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/api/tags`);
  if (!response.ok) return false;
  const body = await response.json();
  return (body.models || []).some((entry) => entry.name === name || entry.model === name);
}
