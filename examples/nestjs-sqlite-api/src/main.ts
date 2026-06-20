import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module.js";

const port = Number(process.env.PORT ?? 3100);
const app = await NestFactory.create(AppModule, {
  logger: ["error", "warn", "log"]
});

app.enableCors({
  origin: process.env.CORS_ORIGIN ?? "http://127.0.0.1:5173"
});

await app.listen(port, "0.0.0.0");
console.log(`NLBackend NestJS SQLite API listening on http://127.0.0.1:${port}`);
