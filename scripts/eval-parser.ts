import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createDemoRegistry } from "../src/actions.js";
import { parseRequestWithLlm, parserProviderFromEnv, type ParserProvider } from "../src/llm-parser.js";
import type { ParserResult } from "../src/types.js";

type Expected = {
  type: ParserResult["type"];
  action?: string;
  args?: Record<string, unknown>;
};

type EvalCase = {
  id: string;
  text: string;
  expected: Expected;
};

type EvalResult = {
  item: EvalCase;
  parsed: ParserResult;
  passed: boolean;
  reason?: string;
};

const args = new Set(process.argv.slice(2));
const provider = readArg("--provider", parserProviderFromEnv("ollama")) as ParserProvider;
const limit = Number(readArg("--limit", "0"));
const only = readArg("--case", "");
const cases = loadCases()
  .filter((item) => (only ? item.id.includes(only) : true))
  .slice(0, limit > 0 ? limit : undefined);

if (cases.length === 0) {
  console.error("No eval cases matched.");
  process.exit(1);
}

const registry = createDemoRegistry();
const results: EvalResult[] = [];

for (const item of cases) {
  const parsed = (await parseRequestWithLlm(item.text, registry, { provider })).parsed;
  const verdict = compare(parsed, item.expected);
  results.push({
    item,
    parsed,
    ...verdict
  });
}

const passed = results.filter((result) => result.passed).length;
const failed = results.length - passed;

for (const result of results) {
  const mark = result.passed ? "PASS" : "FAIL";
  console.log(`${mark} ${result.item.id} :: ${result.item.text}`);
  if (!result.passed) {
    console.log(`  expected: ${JSON.stringify(result.item.expected)}`);
    console.log(`  received: ${JSON.stringify(result.parsed)}`);
    console.log(`  reason: ${result.reason}`);
  }
}

console.log("");
console.log(`provider=${provider} passed=${passed}/${results.length} failed=${failed}`);

if (failed > 0 && !args.has("--allow-failures")) {
  process.exit(1);
}

function loadCases(): EvalCase[] {
  const path = resolve("bench/eval-prompts.json");
  return JSON.parse(readFileSync(path, "utf8")) as EvalCase[];
}

function readArg(name: string, fallback: string): string {
  const values = process.argv.slice(2);
  const inline = values.find((value) => value.startsWith(`${name}=`));
  if (inline) {
    return inline.slice(name.length + 1);
  }

  const index = values.indexOf(name);
  if (index >= 0) {
    return values[index + 1] ?? fallback;
  }

  return fallback;
}

function compare(parsed: ParserResult, expected: Expected): { passed: boolean; reason?: string } {
  if (parsed.type !== expected.type) {
    return { passed: false, reason: `type mismatch` };
  }

  if (expected.type !== "action") {
    return { passed: true };
  }

  if (parsed.type !== "action") {
    return { passed: false, reason: "expected action" };
  }

  if (parsed.action !== expected.action) {
    return { passed: false, reason: "action mismatch" };
  }

  if (expected.args !== undefined && !deepEqual(parsed.args, expected.args)) {
    return { passed: false, reason: "args mismatch" };
  }

  return { passed: true };
}

function deepEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(sortJson(left)) === JSON.stringify(sortJson(right));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, sortJson(entry)])
    );
  }
  return value;
}
