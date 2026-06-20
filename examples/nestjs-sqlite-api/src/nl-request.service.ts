import { Inject, Injectable, type OnModuleInit } from "@nestjs/common";
import {
  ActionRegistry,
  createCrudCreateSchema,
  createCrudDeleteSchema,
  createCrudGetSchema,
  createCrudSearchSchema,
  createCrudUpdateSchema,
  createNLBackend,
  parserProviderFromEnv,
  type LlmParserOptions,
  type ParserProvider,
  type PolicyDecision,
  type ReqResponse,
  type RequestContext
} from "nlbackend";
import { z } from "zod";
import { SqliteDemoService } from "./sqlite-demo.service.js";

type ReqOptions = {
  debug?: boolean;
  ctx?: RequestContext;
  parser?: ParserProvider;
  llm?: LlmParserOptions;
};

const userFields = ["id", "name", "email", "role", "status"] as const;
const studentFields = ["id", "name", "grade", "major", "status"] as const;
const todoFields = ["id", "title", "assigneeName", "due", "status"] as const;
const productFields = ["id", "name", "stock", "price"] as const;

const actorRequired = (_args: unknown, ctx: RequestContext): PolicyDecision =>
  ctx.actor ? { allow: true } : { allow: false, code: "policy_blocked", message: "로그인이 필요한 action입니다." };

const adminOnly = (_args: unknown, ctx: RequestContext): PolicyDecision =>
  ctx.actor?.role === "admin"
    ? { allow: true }
    : { allow: false, code: "policy_blocked", message: "관리자 권한이 필요한 action입니다." };

@Injectable()
export class NlRequestService implements OnModuleInit {
  private readonly registry: ActionRegistry;
  private readonly nl: ReturnType<typeof createNLBackend>;

  constructor(@Inject(SqliteDemoService) private readonly sqlite: SqliteDemoService) {
    this.registry = this.createRegistry();
    this.nl = createNLBackend({
      registry: this.registry,
      parser: parserProviderFromEnv("ollama"),
      projectContextProvider: ({ text, registry }) => this.sqlite.buildProjectContext(text, registry)
    });
  }

  onModuleInit(): void {
    // Preload the local model so the first user request is not a cold start.
    // Best-effort and skippable (NLBACKEND_WARMUP=0) so tests/offline runs stay fast.
    if (process.env.NLBACKEND_WARMUP === "0") {
      return;
    }
    void this.warmUp();
  }

  private async warmUp(): Promise<void> {
    try {
      await this.nl.ensureReady();
      // A throwaway parse loads the model weights; the result is intentionally discarded.
      await this.nl.req("warmup");
    } catch {
      // Warmup is best-effort; real requests still trigger provider readiness.
    }
  }

  async req(text: string, options: ReqOptions = {}): Promise<ReqResponse> {
    return this.nl.req(text, {
      debug: options.debug,
      ctx: options.ctx,
      parser: options.parser,
      llm: options.llm
    });
  }

  private createRegistry(): ActionRegistry {
    const registry = new ActionRegistry();

    registry
      .register({
        name: "users.list",
        description: "SQLite users table의 모든 유저를 조회한다.",
        input: z.object({}),
        handler: async () => ({
          users: await this.sqlite.listUsers()
        })
      })
      .register({
        name: "todos.list",
        description: "SQLite todos table의 모든 할 일을 조회한다.",
        input: z.object({}),
        handler: async () => ({
          todos: await this.sqlite.listTodos()
        })
      })
      .register({
        name: "products.list",
        description: "SQLite products table의 모든 상품을 조회한다.",
        input: z.object({}),
        handler: async () => ({
          products: await this.sqlite.listProducts()
        })
      })
      .register({
        name: "users.search",
        description:
          "SQLite users table을 구조화된 검색 조건으로 조회한다. exact 이름뿐 아니라 부분 이름, 성을 제외한 이름 의도, email/role/status 조건, 정렬/limit을 filters로 표현한다. full name만 있고 givenName 필드가 없으면 given-name 의도는 name endsWith filter로 표현한다.",
        input: createCrudSearchSchema(userFields),
        handler: async (args) => ({
          users: await this.sqlite.searchUsers(args)
        })
      })
      .register({
        name: "students.search",
        description:
          "SQLite students table을 구조화된 검색 조건으로 조회한다. 자연어의 partial/given-name/range/status/major 조건을 filters로 표현한다. full name만 있고 givenName 필드가 없으면 given-name 의도는 name endsWith filter로 표현한다.",
        input: createCrudSearchSchema(studentFields),
        handler: async (args) => ({
          students: await this.sqlite.searchStudents(args)
        })
      })
      .register({
        name: "students.get",
        description: "SQLite students table에서 id로 학생 하나를 조회한다.",
        input: createCrudGetSchema(),
        handler: async ({ id }) => ({
          student: await this.sqlite.getStudentById(id)
        })
      })
      .register({
        name: "students.create",
        description: "SQLite students table에 학생을 생성한다. data에는 id, name, grade, major, status를 넣는다.",
        kind: "write",
        input: createCrudCreateSchema({
          id: z.string().min(1),
          name: z.string().min(1),
          grade: z.number().int().min(1),
          major: z.string().min(1),
          status: z.enum(["active", "graduated", "inactive"])
        }),
        policy: actorRequired,
        handler: async ({ data }) => ({
          student: await this.sqlite.createStudent(data)
        })
      })
      .register({
        name: "students.update",
        description:
          "SQLite students table에서 where.filters로 좁힌 학생들의 필드를 수정한다. bulk update는 반드시 구체적인 where.filters가 필요하고 patch에는 바꿀 필드만 넣는다.",
        kind: "write",
        input: createCrudUpdateSchema(studentFields, {
          name: z.string().min(1),
          grade: z.number().int().min(1),
          major: z.string().min(1),
          status: z.enum(["active", "graduated", "inactive"])
        }),
        policy: adminOnly,
        handler: async (args) => this.sqlite.updateStudents(args)
      })
      .register({
        name: "students.delete",
        description:
          "SQLite students table에서 where.filters로 좁힌 학생을 삭제한다. 기본 mode는 soft이며 status를 inactive로 바꾼다. 너무 넓은 삭제는 needs_clarification이어야 한다.",
        kind: "write",
        input: createCrudDeleteSchema(studentFields),
        policy: adminOnly,
        handler: async (args) => this.sqlite.deleteStudents(args)
      })
      .register({
        name: "products.search",
        description:
          "SQLite products table을 구조화된 검색 조건으로 조회한다. 상품명 partial, 가격/재고 범위, 정렬/limit을 filters로 표현한다.",
        input: createCrudSearchSchema(productFields),
        handler: async (args) => ({
          products: await this.sqlite.searchProducts(args)
        })
      })
      .register({
        name: "users.findByName",
        description: "SQLite users table에서 정확한 전체 이름으로 유저를 검색한다. 부분 이름, 성을 제외한 이름, 복합 조건 검색은 users.search를 사용한다.",
        input: z.object({
          name: z.string().min(1)
        }),
        handler: async ({ name }) => ({
          users: await this.sqlite.findUsersByName(name)
        })
      })
      .register({
        name: "users.findByEmail",
        description: "SQLite users table에서 이메일로 유저를 검색한다.",
        input: z.object({
          email: z.string().email()
        }),
        handler: async ({ email }) => ({
          user: await this.sqlite.findUserByEmail(email)
        })
      })
      .register({
        name: "users.getById",
        description: "SQLite users table에서 ID로 유저를 조회한다.",
        input: z.object({
          id: z.string().min(1)
        }),
        handler: async ({ id }) => ({
          user: await this.sqlite.getUserById(id)
        })
      })
      .register({
        name: "users.create",
        description: "SQLite users table에 유저를 생성한다. data에는 id, name, email, role, status를 넣는다.",
        kind: "write",
        input: createCrudCreateSchema({
          id: z.string().min(1),
          name: z.string().min(1),
          email: z.string().email(),
          role: z.enum(["admin", "member"]),
          status: z.enum(["active", "blocked", "inactive"])
        }),
        policy: actorRequired,
        handler: async ({ data }) => ({
          user: await this.sqlite.createUser(data)
        })
      })
      .register({
        name: "users.update",
        description:
          "SQLite users table에서 where.filters로 좁힌 유저들의 필드를 수정한다. 이름/이메일/role/status 변경을 patch로 표현한다. bulk update는 구체적인 where.filters가 필요하다.",
        kind: "write",
        input: createCrudUpdateSchema(userFields, {
          name: z.string().min(1),
          email: z.string().email(),
          role: z.enum(["admin", "member"]),
          status: z.enum(["active", "blocked", "inactive"])
        }),
        policy: adminOnly,
        handler: async (args) => this.sqlite.updateUsers(args)
      })
      .register({
        name: "users.delete",
        description:
          "SQLite users table에서 where.filters로 좁힌 유저를 삭제한다. 기본 mode는 soft이며 status를 inactive/blocked 계열로 바꾼다. 너무 넓은 삭제는 needs_clarification이어야 한다.",
        kind: "write",
        input: createCrudDeleteSchema(userFields),
        policy: adminOnly,
        handler: async (args) => this.sqlite.deleteUsers(args)
      })
      .register({
        name: "auth.verifySessionToken",
        description:
          "SQLite sessions table에서 sessionId와 token 조합을 검증한다. 'A 세션 토큰 B' 형태에서는 A를 sessionId, B를 token으로 사용한다.",
        input: z.object({
          sessionId: z.string().min(1),
          token: z.string().min(1)
        }),
        handler: ({ sessionId, token }) => this.sqlite.verifySessionToken(sessionId, token)
      })
      .register({
        name: "todos.listByAssignee",
        description: "SQLite todos table에서 담당자별 할 일을 조회한다. 담당/담당자/에게 배정 표현의 사람 이름을 assigneeName으로 사용한다.",
        input: z.object({
          assigneeName: z.string().min(1)
        }),
        handler: async ({ assigneeName }) => ({
          todos: await this.sqlite.listTodosByAssignee(assigneeName)
        })
      })
      .register({
        name: "todos.search",
        description:
          "SQLite todos table을 구조화된 검색 조건으로 조회한다. title/assigneeName/due/status 조건, partial title, 정렬/limit을 filters로 표현한다.",
        input: createCrudSearchSchema(todoFields),
        handler: async (args) => ({
          todos: await this.sqlite.searchTodos(args)
        })
      })
      .register({
        name: "todos.listDueToday",
        description: "SQLite todos table에서 오늘 마감인 할 일을 조회한다.",
        input: z.object({}),
        handler: async () => ({
          todos: await this.sqlite.listTodosDueToday()
        })
      })
      .register({
        name: "todos.create",
        description: "SQLite todos table에 할 일을 추가한다.",
        kind: "write",
        input: z.object({
          assigneeName: z.string().min(1),
          title: z.string().min(1),
          due: z.enum(["today", "tomorrow", "later"])
        }),
        policy: (_args, ctx) =>
          ctx.actor
            ? { allow: true }
            : { allow: false, code: "policy_blocked", message: "로그인이 필요한 action입니다." },
        handler: async ({ assigneeName, title, due }) => ({
          todo: await this.sqlite.createTodo(assigneeName, title, due)
        })
      })
      .register({
        name: "todos.update",
        description:
          "SQLite todos table에서 where.filters로 좁힌 할 일의 title/assigneeName/due/status를 수정한다. bulk update는 구체적인 where.filters가 필요하다.",
        kind: "write",
        input: createCrudUpdateSchema(todoFields, {
          title: z.string().min(1),
          assigneeName: z.string().min(1),
          due: z.enum(["today", "tomorrow", "later"]),
          status: z.enum(["open", "done"])
        }),
        policy: adminOnly,
        handler: async (args) => this.sqlite.updateTodos(args)
      })
      .register({
        name: "todos.delete",
        description:
          "SQLite todos table에서 where.filters로 좁힌 할 일을 삭제한다. 기본 mode는 soft이며 status를 done으로 바꾼다. 너무 넓은 삭제는 needs_clarification이어야 한다.",
        kind: "write",
        input: createCrudDeleteSchema(todoFields),
        policy: adminOnly,
        handler: async (args) => this.sqlite.deleteTodos(args)
      })
      .register({
        name: "products.findLowStock",
        description:
          "SQLite products table에서 재고 부족 상품을 찾는다. 'stock 7 이하'나 '재고 10개 이하'에서는 숫자만 threshold number로 사용한다.",
        input: z.object({
          threshold: z.number().int().nonnegative()
        }),
        handler: async ({ threshold }) => ({
          products: await this.sqlite.findLowStockProducts(threshold)
        })
      })
      .register({
        name: "products.findByName",
        description: "SQLite products table에서 상품명으로 상품을 찾는다. 브랜드/접두어/모델명을 포함한 전체 상품명을 name으로 보존한다.",
        input: z.object({
          name: z.string().min(1)
        }),
        handler: async ({ name }) => ({
          product: await this.sqlite.findProductByName(name)
        })
      })
      .register({
        name: "products.create",
        description: "SQLite products table에 상품을 생성한다. data에는 id, name, stock, price를 넣는다.",
        kind: "write",
        input: createCrudCreateSchema({
          id: z.string().min(1),
          name: z.string().min(1),
          stock: z.number().int().nonnegative(),
          price: z.number().int().nonnegative()
        }),
        policy: actorRequired,
        handler: async ({ data }) => ({
          product: await this.sqlite.createProduct(data)
        })
      })
      .register({
        name: "products.update",
        description:
          "SQLite products table에서 where.filters로 좁힌 상품의 name/stock/price를 수정한다. 가격 변경, 재고 변경, 조건부 bulk update를 patch로 표현한다.",
        kind: "write",
        input: createCrudUpdateSchema(productFields, {
          name: z.string().min(1),
          stock: z.number().int().nonnegative(),
          price: z.number().int().nonnegative()
        }),
        policy: adminOnly,
        handler: async (args) => this.sqlite.updateProducts(args)
      })
      .register({
        name: "products.delete",
        description:
          "SQLite products table에서 where.filters로 좁힌 상품을 삭제한다. 상품에는 soft status가 없으므로 mode가 soft여도 실제 row를 삭제한다. 너무 넓은 삭제는 needs_clarification이어야 한다.",
        kind: "write",
        input: createCrudDeleteSchema(productFields),
        policy: adminOnly,
        handler: async (args) => this.sqlite.deleteProducts(args)
      });

    return registry;
  }
}
