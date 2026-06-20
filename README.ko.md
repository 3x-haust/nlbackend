# NLBackend

[English](./README.md) · **한국어**

> **자연어로 백엔드를 호출하세요.** 로컬 LLM이 *당신이 등록한* action 중 하나를 고르고 인자를 뽑아내면, 실제 검증(zod)·인가·실행은 당신의 코드가 합니다. 하드코딩된 키워드 라우팅도, 클라우드도 필요 없습니다.

[![npm](https://img.shields.io/npm/v/nlbackend.svg)](https://www.npmjs.com/package/nlbackend) [![license](https://img.shields.io/npm/l/nlbackend.svg)](./LICENSE) ![node](https://img.shields.io/node/v/nlbackend.svg) ![types](https://img.shields.io/badge/types-TypeScript-blue.svg)

```ts
await nl.req("이름이 유성윤인 유저 찾아줘");
// -> users.findByName({ name: "유성윤" })  ->  당신의 handler 실행  ->  DB에서 실제 row
```

사용자도, 개발자도 그 변환 과정을 볼 필요가 없습니다. NLBackend는 요청을 **등록된** action 호출 하나로 바꾸고, zod 스키마로 검증하고, 정책(policy)을 적용한 뒤 handler를 실행합니다. 등록되지 않았거나 애매한 요청은 거부하거나 되묻습니다 — 절대 추측해서 side effect를 일으키지 않습니다.

---

## 왜 NLBackend인가

LLM은 *의도 이해*는 잘하지만 *진실의 원천(source of truth)* 으로 두기엔 위험합니다. NLBackend는 그 경계를 분명히 긋습니다.

- **LLM은 action 선택과 인자 추출만 합니다.** 데이터를 지어내거나, 인가를 판단하거나, DB를 건드리지 않습니다.
- **실제 일은 전부 당신의 코드가 합니다.** 등록된 handler가 데이터를 조회/변경하고, zod가 모든 인자를 검증하고, policy가 모든 write를 통제합니다.
- **등록되지 않은 건 실행되지 않습니다.** 맞는 action이 없으면 `unknown_action`, 애매하면 `needs_clarification`.

라이브러리에 **키워드→action 매핑 테이블 같은 건 없습니다.** 선택과 추출은 모델이 하고, 당신이 등록한 스키마가 그걸 제약합니다.

## 흐름

```text
자연어 요청
  → LLM이 등록된 action 중 하나 선택   (당신의 action 이름으로 제약)
  → LLM이 인자 추출                    (그 action의 스키마로 제약)
  → zod 검증                           (실패 시 재프롬프트로 교정)
  → policy / 인가 게이트
  → 당신의 handler 실행
  → JSON 응답
```

## 특징

- 🧠 **키워드가 아니라 LLM이 결정** — 모델이 action을 고르고 인자를 채우며, 라이브러리는 project-agnostic 프롬프트 생성·검증·실행만 합니다.
- 🏠 **로컬 우선** — [Ollama](https://ollama.com)에서 동작(기본 `qwen2.5:3b`), CPU/GPU 모두 가능. OpenAI 호환 `/v1/chat/completions` 엔드포인트도 지원.
- 🪶 **저사양에서도 동작** — 2단계 파싱(action 선택 → 인자 채우기)과 JSON 스키마 **제약 디코딩**으로 라즈베리파이급 모델도 신뢰성 있게. `NLBACKEND_OLLAMA_MODEL=qwen2.5:1.5b`로 낮출 수 있음.
- 🛡️ **구조적으로 안전** — zod 인자 검증, action별 policy, 프롬프트 인젝션 가드, 미등록·애매 요청 거부.
- ✍️ **write 모델 티어링** — 정밀도가 중요한 write(update/delete) 액션만 더 강한 모델로: `writeModel: "qwen2.5:7b"`. read는 작은 모델로 빠르게.
- 🔌 **프로젝트 비종속** — 당신의 action과 zod 스키마를 등록. `projectContext`는 **ORM 엔티티 메타데이터에서 자동 도출** 가능(예제 참고)해 alias를 손으로 쓸 필요가 없습니다.
- 🧩 **구조화 CRUD 헬퍼** — `createCrudSearchSchema`, `createCrudUpdateSchema` 등으로 모델이 당신의 필드로 filter/sort/patch를 표현.

## 설치

```bash
npm install nlbackend
# 또는: pnpm add nlbackend  /  yarn add nlbackend
```

모델 제공자도 필요합니다. 가장 간단한 건 로컬 Ollama:

```bash
# https://ollama.com
ollama pull qwen2.5:3b
```

> 개발 중엔 번들된 헬퍼로 받을 수도 있습니다: `npm run model:setup`.

## 퀵스타트

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

const nl = createNLBackend({ registry }); // 기본값: 로컬 Ollama

const res = await nl.req("이름이 유성윤인 유저 찾아줘");
// { ok: true, data: { users: [ { id: "u1", name: "유성윤", ... } ] } }

const ambiguous = await nl.req("유성윤 찾아줘");
// { ok: false, error: { code: "needs_clarification", candidates: [...] } }
```

`debug: true`로 모델이 무엇을 골랐는지 볼 수 있습니다:

```ts
await nl.req("이름이 유성윤인 유저 찾아줘", { debug: true });
// res.trace = { matchedAction: "users.findByName", args: { name: "유성윤" }, parser: "ollama", model: "qwen2.5:3b" }
```

### write, policy, 되묻기

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

## 모델 · 하드웨어 설정

호출마다(`nl.req(text, { llm })`) 또는 env로 설정합니다:

| Env | 기본값 | 용도 |
| --- | --- | --- |
| `NLBACKEND_PARSER` | `ollama` | `ollama` 또는 `openai-compatible` |
| `NLBACKEND_OLLAMA_MODEL` | `qwen2.5:3b` | 기본 모델 (라즈베리파이는 `qwen2.5:1.5b`, 최고 정확도는 `qwen2.5:7b`) |
| `NLBACKEND_OLLAMA_WRITE_MODEL` | — | **write 액션의 인자 추출에만** 쓰는 더 강한 모델 |
| `NLBACKEND_PARSE_TWO_STAGE` | `1` | action 선택 → 인자 채우기 (작은 모델에 유리) |
| `NLBACKEND_CONSTRAIN_OUTPUT` | `1` | JSON 스키마 제약 디코딩 |
| `NLBACKEND_OLLAMA_KEEP_ALIVE` | `10m` | 모델을 warm 상태로 유지 |

```ts
// read는 작고 빠른 모델, write는 더 강한 모델로 라우팅
const nl = createNLBackend({
  registry,
  llm: { hardware: "gpu", writeModel: "qwen2.5:7b" }
});
```

로컬 Ollama 대신 호스티드/OpenAI 호환 엔드포인트 사용:

```ts
const nl = createNLBackend({
  parser: "openai-compatible",
  llm: { baseUrl: "https://your-host/v1", model: "your-model", apiKey: process.env.LLM_API_KEY }
});
```

## 작은 모델에서도 신뢰성을 유지하는 법

1. **2단계 파싱** — 1단계는 action 하나를 고르고(단순 분류), 2단계는 그 action의 인자만 채웁니다. 각 단계가 작은 모델에 쉽습니다.
2. **제약 디코딩** — action 이름은 당신의 등록된 이름으로, 인자는 스키마 형태로 제약돼서 깨지거나 환각된 출력이 구조적으로 불가능해집니다.
3. **스키마 기반 교정** — 인자가 zod 검증에 실패하면 정확한 검증 이슈를 담아 모델에 한 번 더 재프롬프트합니다(정규식 땜질이 아니라).

이건 휴리스틱이 아니라 **출력 제약**입니다 — 결정은 여전히 모델이 합니다.

## 예제

이 저장소에는 실행 가능한 예제 두 개가 있습니다:

- [`examples/nestjs-sqlite-api`](./examples/nestjs-sqlite-api) — TypeORM + SQLite 기반 NestJS `/req` API. CRUD 검색/수정/삭제와, **엔티티 메타데이터에서 자동 도출되는** `projectContext`.
- [`examples/react-client`](./examples/react-client) — 프롬프트를 시험하고 모델/하드웨어/write 모델을 바꿔보는 React UI.

```bash
pnpm example:api   # NestJS API on :3100
pnpm example:web   # React UI on :5173
```

## API 표면

```ts
import {
  ActionRegistry,
  createNLBackend, NLBackend,
  createApp,                 // 바로 쓰는 Fastify /req 서버
  parseRequestWithLlm,       // 저수준 파서
  parserProviderFromEnv,
  // 구조화 CRUD 스키마 빌더
  createCrudSearchSchema, createCrudUpdateSchema, createCrudDeleteSchema,
  createCrudCreateSchema, createCrudGetSchema,
} from "nlbackend";
```

응답은 항상 다음 중 하나입니다:

```ts
{ ok: true,  data: <handler 결과>, trace?: {...} }
{ ok: false, error: { code: "needs_clarification" | "unknown_action" | "validation_failed"
                            | "policy_blocked" | "not_found" | "model_unavailable", ... } }
```

## 라이선스

[MIT](./LICENSE) © 3xhaust
