# NLBackend Examples

## NestJS + SQLite API

The NestJS example exposes the same natural-language `/req` surface, but action handlers read and write a TypeORM-backed SQLite database instead of in-memory arrays.

```bash
pnpm example:api
```

Default API URL:

```text
http://127.0.0.1:3100
```

Useful endpoints:

- `GET /health`
- `GET /demo/users`
- `GET /demo/students`
- `GET /demo/todos`
- `POST /req`

Example request:

```bash
curl -X POST http://127.0.0.1:3100/req \
  -H 'content-type: application/json' \
  -d '{"text":"이름이 유성윤인 유저 찾아줘","debug":true}'
```

CRUD/query examples:

```bash
# LLM maps the natural-language given-name intent to a structured filter:
# { filters: [{ field: "name", operator: "endsWith", value: "민지" }] }
curl -X POST http://127.0.0.1:3100/req \
  -H 'content-type: application/json' \
  -d '{"text":"성이 무엇이든 이름이 민지인 학생 찾아줘","debug":true}'

curl -X POST http://127.0.0.1:3100/req \
  -H 'content-type: application/json' \
  -d '{"text":"재고 10개 이하이고 가격 3만원 미만인 상품 보여줘","debug":true}'

curl -X POST http://127.0.0.1:3100/req \
  -H 'content-type: application/json' \
  -d '{"text":"id student_4, 이름 최민지, 1학년, design 전공 active 학생 추가해줘","debug":true,"actor":{"id":"demo-admin","role":"admin"}}'

curl -X POST http://127.0.0.1:3100/req \
  -H 'content-type: application/json' \
  -d '{"text":"이름이 민지로 끝나는 학생들의 status를 inactive로 바꿔줘","debug":true,"actor":{"id":"demo-admin","role":"admin"}}'
```

When an action runs successfully but the database has no matching row, `/req` returns HTTP `404` with `error.code: "not_found"`.

The SQLite file is created at `examples/nestjs-sqlite-api/data/nlbackend-demo.sqlite` by default. Set `NLBACKEND_SQLITE_PATH=:memory:` for an in-memory database.

By default the API uses the local Ollama parser with `qwen2.5:3b` and CPU-only inference (`num_gpu: 0`). On low-end hosts (e.g. a Raspberry Pi) set `NLBACKEND_OLLAMA_MODEL=qwen2.5:1.5b`; on bigger machines `qwen2.5:7b` is more accurate. `npm install`/`pnpm install` runs `scripts/setup-local-model.mjs --optional`, which installs Ollama on macOS through Homebrew when possible, starts the local Ollama server, and pulls the model. You can run it explicitly:

```bash
pnpm model:setup
```

Install-time setup controls:

```bash
# do not install/start/pull local model during npm/pnpm install
NLBACKEND_SKIP_LOCAL_MODEL_SETUP=1 pnpm install

# require an existing Ollama install; do not use Homebrew
NLBACKEND_SKIP_OLLAMA_INSTALL=1 pnpm model:setup
```

Provider options:

```bash
# Direct local Ollama, CPU-only by default
NLBACKEND_PARSER=ollama pnpm example:api

# Any OpenAI-compatible /v1/chat/completions API
NLBACKEND_PARSER=openai-compatible \
NLBACKEND_API_BASE_URL=http://127.0.0.1:11434/v1 \
NLBACKEND_API_MODEL=qwen2.5:3b \
pnpm example:api
```

CPU behavior:

```bash
# default, forces Ollama request option num_gpu: 0
NLBACKEND_OLLAMA_NUM_GPU=0

# let Ollama decide hardware acceleration
NLBACKEND_OLLAMA_NUM_GPU=auto

# request GPU offload for the local demo. Defaults to 999 layers when GPU mode is selected.
NLBACKEND_OLLAMA_GPU_LAYERS=999
```

Per-request local hardware selection is also supported:

```bash
curl -X POST http://127.0.0.1:3100/req \
  -H 'content-type: application/json' \
  -d '{"text":"유저 다 찾아줘","parser":"ollama","llm":{"hardware":"cpu"},"debug":true}'

curl -X POST http://127.0.0.1:3100/req \
  -H 'content-type: application/json' \
  -d '{"text":"유저 다 찾아줘","parser":"ollama","llm":{"hardware":"gpu"},"debug":true}'

curl -X POST http://127.0.0.1:3100/req \
  -H 'content-type: application/json' \
  -d '{"text":"유저 다 찾아줘","parser":"ollama","llm":{"hardware":"auto"},"debug":true}'
```

## React Client

The React client calls the NestJS API through Vite's `/api` proxy.

```bash
pnpm example:web
```

Default web URL:

```text
http://127.0.0.1:5173
```

Run both commands in separate terminals, then open the React URL and type a natural-language backend request.
The Local provider exposes `CPU`, `GPU`, and `Auto` hardware buttons. `CPU` sends Ollama `num_gpu: 0`; `GPU` requests GPU offload; `Auto` omits `num_gpu` so Ollama decides.

## Verification

```bash
pnpm example:test
pnpm example:build
```

Parser eval:

```bash
# Runs the local Ollama parser against the broader benchmark prompts.
pnpm eval:parser -- --provider ollama

# Or evaluate an OpenAI-compatible endpoint against the same fixture.
pnpm eval:parser -- --provider openai-compatible --allow-failures
```
