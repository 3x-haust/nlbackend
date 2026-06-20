import { createApp } from "./app.js";
import { parserProviderFromEnv } from "./llm-parser.js";

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";
const parser = parserProviderFromEnv("ollama");
const app = createApp({ parser });

try {
  await app.listen({ port, host });
  console.log(`NLBackend listening on http://${host}:${port} with parser=${parser}`);
} catch (error) {
  app.log.error(error);
  process.exit(1);
}
