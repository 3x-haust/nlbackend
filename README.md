# NLBackend

**English** · [한국어](./README.ko.md)

> **Call your backend in natural language.** A local LLM picks one of *your* registered actions and extracts its arguments — your code validates (zod), authorizes, and executes. No hardcoded keyword routing, no cloud required.

[![npm](https://img.shields.io/npm/v/nlbackend.svg)](https://www.npmjs.com/package/nlbackend) [![license](https://img.shields.io/npm/l/nlbackend.svg)](./LICENSE) ![node](https://img.shields.io/node/v/nlbackend.svg) ![types](https://img.shields.io/badge/types-TypeScript-blue.svg)

```ts
await nl.req("이름이 유성윤인 유저 찾아줘");
// -> users.findByName({ name: "유성윤" })  ->  your handler runs  ->  rows from your DB
```

The user (and you) never see the mapping. NLBackend turns the request into one **registered** action call, validates it against your zod schema, runs your policy, and executes your handler. Unregistered or ambiguous requests are refused or sent back for clarification — never guessed into a side effect.

---

## Why

LLMs are great at *understanding intent* and terrible at *being your source of truth*. NLBackend draws a hard line:

- **The LLM only chooses an action and extracts arguments.** It never invents data, decides authorization, or touches your database.
- **Your code does everything real.** Registered handlers fetch/mutate data; zod validates every argument; your policy gates every write.
- **Nothing unregistered runs.** If no action fits, the answer is `unknown_action`. If it's ambiguous, `needs_clarification`.

There is **no keyword→action table** baked into the library. Selection and extraction are done by the model, constrained by your registered schemas.

## Flow

```text
natural-language request
  → LLM selects ONE registered action  (constrained to your action names)
  → LLM extracts arguments             (constrained to that action's schema)
  → zod validation                     (repair-by-reprompt on failure)
  → policy / authorization gate
  → your handler executes
  → JSON response
```

## Features

- 🧠 **LLM-driven, not keyword-driven** — the model selects the action and fills args; the library only builds a project-agnostic prompt, validates, and executes.
- 🏠 **Local-first** — runs on [Ollama](https://ollama.com) (`qwen2.5:3b` by default), CPU or GPU. Also speaks any OpenAI-compatible `/v1/chat/completions` endpoint.
- 🪶 **Runs on small hardware** — two-stage parsing (select action → fill args) plus JSON-schema **constrained decoding** make even Raspberry-Pi-class models reliable. Downshift with `NLBACKEND_OLLAMA_MODEL=qwen2.5:1.5b`.
- 🛡️ **Safe by construction** — zod-validated args, per-action policies, prompt-injection guard, and refusal of unregistered/ambiguous requests.
- ✍️ **Write-model tiering** — route precision-critical write (update/delete) actions to a stronger model while reads stay fast: `writeModel: "qwen2.5:7b"`.
- 🔌 **Project-agnostic** — register your own actions and zod schemas; optional `projectContext` can be **auto-derived from your ORM entities** (see the example), so you don't hand-write aliases.
- 🧩 **Structured CRUD helpers** — `createCrudSearchSchema`, `createCrudUpdateSchema`, etc., so the model expresses filters/sort/patch in your fields.

## Install

```bash
npm install nlbackend
# or: pnpm add nlbackend  /  yarn add nlbackend
```

You also need a model provider. The simplest is local Ollama:

```bash
# https://ollama.com
ollama pull qwen2.5:3b
```

> A bundled helper can do this for you in dev: `npm run model:setup`.

## Quickstart

```ts
import { ActionRegistry, createNLBackend } from "nlbackend";
import { z } from "zod";

const users = [{ id: "u1", name: "유성윤", email: "yoo@example.com", role: "admin" }];

const registry = new ActionRegistry()
  .register({
    name: "users.list",
    description: "모든 유저를 조회한다.",
    examples: ["전체 유저 보여줘", "show all users"],
    input: z.object({}),
    handler: () => ({ users })
  })
  .register({
    name: "users.findByName",
    description: "이름으로 유저를 검색한다.",
    examples: ["이름이 유성윤인 유저 찾아줘"],
    input: z.object({ name: z.string().min(1) }),
    handler: ({ name }) => ({ users: users.filter((u) => u.name === name) })
  });

const nl = createNLBackend({ registry }); // defaults to local Ollama

const res = await nl.req("이름이 유성윤인 유저 찾아줘");
// { ok: true, data: { users: [ { id: "u1", name: "유성윤", ... } ] } }

const ambiguous = await nl.req("유성윤 찾아줘");
// { ok: false, error: { code: "needs_clarification", candidates: [...] } }
```

Pass `debug: true` to see what the model chose:

```ts
await nl.req("이름이 유성윤인 유저 찾아줘", { debug: true });
// res.trace = { matchedAction: "users.findByName", args: { name: "유성윤" }, parser: "ollama", model: "qwen2.5:3b" }
```

### Writes, policies, and clarification

```ts
registry.register({
  name: "users.updateRole",
  description: "유저 role을 변경한다.",
  kind: "write",
  input: z.object({ name: z.string().min(1), role: z.enum(["admin", "member"]) }),
  policy: (_args, ctx) =>
    ctx.actor?.role === "admin"
      ? { allow: true }
      : { allow: false, code: "policy_blocked", message: "관리자 권한이 필요합니다." },
  handler: ({ name, role }) => {/* ... */}
});

await nl.req("김민지를 admin으로 바꿔줘", { ctx: { actor: { id: "a1", role: "admin" } } });
```

## Model & hardware configuration

Everything is configurable per call (`nl.req(text, { llm })`) or via env:

| Env | Default | Purpose |
| --- | --- | --- |
| `NLBACKEND_PARSER` | `ollama` | `ollama` or `openai-compatible` |
| `NLBACKEND_OLLAMA_MODEL` | `qwen2.5:3b` | Base model (use `qwen2.5:1.5b` on a Raspberry Pi, `qwen2.5:7b` for max accuracy) |
| `NLBACKEND_OLLAMA_WRITE_MODEL` | — | Stronger model used **only** for write actions' argument extraction |
| `NLBACKEND_PARSE_TWO_STAGE` | `1` | Select action, then fill args (best for small models) |
| `NLBACKEND_CONSTRAIN_OUTPUT` | `1` | JSON-schema constrained decoding |
| `NLBACKEND_OLLAMA_KEEP_ALIVE` | `10m` | Keep the model warm |

```ts
// reads on a small fast model, writes routed to a stronger one
const nl = createNLBackend({
  registry,
  llm: { hardware: "gpu", writeModel: "qwen2.5:7b" }
});
```

Use a hosted/OpenAI-compatible endpoint instead of local Ollama:

```ts
const nl = createNLBackend({
  parser: "openai-compatible",
  llm: { baseUrl: "https://your-host/v1", model: "your-model", apiKey: process.env.LLM_API_KEY }
});
```

## How it stays reliable on tiny models

1. **Two-stage parsing** — stage 1 picks exactly one action (a simple classification); stage 2 fills only that action's arguments. Each step is easy for a small model.
2. **Constrained decoding** — the action name is constrained to your registered names and the args to your schema shape, so malformed/hallucinated output is structurally impossible.
3. **Schema-driven repair** — if args still fail zod validation, the model is re-prompted once with the exact validation issues (never with regex fix-ups).

These are output constraints, not heuristics — the model still makes every decision.

## Examples

This repo ships two runnable examples:

- [`examples/nestjs-sqlite-api`](./examples/nestjs-sqlite-api) — a NestJS `/req` API backed by TypeORM + SQLite, with CRUD search/update/delete and a `projectContext` **derived automatically from entity metadata**.
- [`examples/react-client`](./examples/react-client) — a React UI to try prompts and switch model/hardware/write-model.

```bash
pnpm example:api   # NestJS API on :3100
pnpm example:web   # React UI on :5173
```

## API surface

```ts
import {
  ActionRegistry,
  createNLBackend, NLBackend,
  createApp,                 // a ready-made Fastify /req server
  parseRequestWithLlm,       // low-level parser
  parserProviderFromEnv,
  // structured CRUD schema builders
  createCrudSearchSchema, createCrudUpdateSchema, createCrudDeleteSchema,
  createCrudCreateSchema, createCrudGetSchema,
} from "nlbackend";
```

A response is always one of:

```ts
{ ok: true,  data: <handler result>, trace?: {...} }
{ ok: false, error: { code: "needs_clarification" | "unknown_action" | "validation_failed"
                            | "policy_blocked" | "not_found" | "model_unavailable", ... } }
```

## License

[MIT](./LICENSE) © 3xhaust
