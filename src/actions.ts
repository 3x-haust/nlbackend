import { z } from "zod";
import { createCrudSearchSchema, type CrudFilter, type CrudSearchArgs } from "./crud.js";
import { deployments, logs, products, sessions, students, todos, users } from "./demo-data.js";
import { ActionRegistry } from "./registry.js";
import type { PolicyDecision, RequestContext } from "./types.js";

const userFields = ["id", "name", "email", "role", "status"] as const;
const studentFields = ["id", "name", "grade", "major", "status"] as const;

const adminOnly = (_args: unknown, ctx: RequestContext): PolicyDecision => {
  if (ctx.actor?.role === "admin") {
    return { allow: true };
  }

  return {
    allow: false,
    code: "policy_blocked",
    message: "관리자 권한이 필요한 action입니다."
  };
};

export function createDemoRegistry(): ActionRegistry {
  const registry = new ActionRegistry();

  registry
    .register({
      name: "users.list",
      description: "모든 유저를 조회한다. 전체/모든/다/all users 요청에 사용하고, 특정 이름 검색에는 사용하지 않는다.",
      examples: ["전체 유저 보여줘", "유저 다 찾아줘", "모든 사용자 목록 보여줘"],
      input: z.object({}),
      handler: () => ({
        users
      })
    })
    .register({
      name: "todos.list",
      description: "모든 할 일을 조회한다. 전체/모든/다/all todos 요청에 사용하고, 담당자나 마감일 조건이 있으면 더 구체적인 action을 사용한다.",
      examples: ["전체 할 일 보여줘", "todo 다 보여줘"],
      input: z.object({}),
      handler: () => ({
        todos
      })
    })
    .register({
      name: "products.list",
      description: "모든 상품을 조회한다. 전체/모든/다/all products 요청에 사용하고, 특정 상품명이나 재고 조건이 있으면 더 구체적인 action을 사용한다.",
      examples: ["전체 상품 보여줘", "상품 다 찾아줘"],
      input: z.object({}),
      handler: () => ({
        products
      })
    })
    .register({
      name: "students.list",
      description: "모든 학생을 조회한다. 조건이 있으면 students.search를 사용한다.",
      examples: ["전체 학생 보여줘", "학생 다 찾아줘"],
      input: z.object({}),
      handler: () => ({
        students
      })
    })
    .register({
      name: "users.search",
      description:
        "유저를 구조화된 검색 조건으로 조회한다. exact 이름뿐 아니라 부분 이름, 성을 제외한 이름 의도, email/role/status 조건, 정렬/limit을 filters로 표현한다. full name만 있고 givenName 필드가 없으면 given-name 의도는 name endsWith filter로 표현한다.",
      input: createCrudSearchSchema(userFields),
      handler: (args) => ({
        users: searchRows(users, args)
      })
    })
    .register({
      name: "students.search",
      description:
        "학생을 구조화된 검색 조건으로 조회한다. partial/given-name/range/status/major 조건을 filters로 표현한다. full name만 있고 givenName 필드가 없으면 given-name 의도는 name endsWith filter로 표현한다.",
      input: createCrudSearchSchema(studentFields),
      handler: (args) => ({
        students: searchRows(students, args)
      })
    })
    .register({
      name: "users.findByName",
      description: "명시적인 정확한 전체 이름으로 유저를 검색한다. 부분 이름, 성을 제외한 이름, 복합 조건 검색은 users.search를 사용한다.",
      examples: ["이름이 유성윤인 유저 찾아줘", "유성윤이라는 사용자 검색해줘"],
      input: z.object({
        name: z.string().min(1)
      }),
      handler: ({ name }) => ({
        users: users.filter((user) => user.name === name)
      })
    })
    .register({
      name: "users.findByEmail",
      description: "이메일로 유저를 검색한다.",
      examples: ["sungyoon@example.com 이메일 쓰는 유저 찾아줘"],
      input: z.object({
        email: z.string().email()
      }),
      handler: ({ email }) => ({
        user: users.find((user) => user.email === email) ?? null
      })
    })
    .register({
      name: "users.getById",
      description: "ID로 유저 정보를 조회한다.",
      examples: ["user_1 유저 정보 보여줘"],
      input: z.object({
        id: z.string().min(1)
      }),
      handler: ({ id }) => ({
        user: users.find((user) => user.id === id) ?? null
      })
    })
    .register({
      name: "users.updateRole",
      description: "유저 role을 변경한다.",
      examples: ["김민지를 admin으로 바꿔줘"],
      kind: "write",
      input: z.object({
        name: z.string().min(1),
        role: z.enum(["admin", "member"])
      }),
      policy: adminOnly,
      handler: ({ name, role }) => {
        const user = users.find((candidate) => candidate.name === name);
        if (!user) {
          return { user: null };
        }

        user.role = role;
        return { user };
      }
    })
    .register({
      name: "auth.verifySessionToken",
      description: "sessionId와 token 조합이 유효한지 검증한다. 'A 세션 토큰 B' 형태에서는 A를 sessionId, B를 token으로 사용한다.",
      examples: [
        "48ysfat 세션 토큰 24435 맞는지 확인해줘",
        "\"48ysfat\" 세션의 토큰 \"24435\" 검증해줘",
        "세션 guest-1 토큰 guest-token 검증"
      ],
      input: z.object({
        sessionId: z.string().min(1),
        token: z.string().min(1)
      }),
      handler: ({ sessionId, token }) => {
        const session = sessions.find(
          (candidate) => candidate.sessionId === sessionId && candidate.token === token
        );

        return {
          success: Boolean(session),
          userId: session?.userId ?? null
        };
      }
    })
    .register({
      name: "todos.listByAssignee",
      description: "명시적인 담당자/사람 이름으로 할 일을 조회한다. 담당/담당자/에게 배정/assigned 표현의 사람 이름이 있으면 broad todos.list보다 이 action을 우선한다.",
      examples: ["유성윤에게 배정된 할 일 보여줘", "김민지 담당 todo 찾아줘", "김민지에게 배정된 작업 목록"],
      input: z.object({
        assigneeName: z.string().min(1)
      }),
      handler: ({ assigneeName }) => ({
        todos: todos.filter((todo) => todo.assigneeName === assigneeName)
      })
    })
    .register({
      name: "todos.listDueToday",
      description: "오늘/오늘까지/마감 today 조건이 명시된 할 일을 조회한다. 담당자 이름만 있는 요청에는 사용하지 않는다.",
      examples: ["오늘 마감인 작업만 보여줘"],
      input: z.object({}),
      handler: () => ({
        todos: todos.filter((todo) => todo.due === "today")
      })
    })
    .register({
      name: "todos.create",
      description: "할 일을 생성한다.",
      examples: ["유성윤에게 내일까지 액션 레지스트리 만들기 할 일 추가해줘"],
      kind: "write",
      input: z.object({
        assigneeName: z.string().min(1),
        title: z.string().min(1),
        due: z.enum(["today", "tomorrow", "later"])
      }),
      policy: (_args, ctx) =>
        ctx.actor ? { allow: true } : { allow: false, code: "policy_blocked", message: "로그인이 필요한 action입니다." },
      handler: ({ assigneeName, title, due }) => {
        const todo = {
          id: `todo_${todos.length + 1}`,
          title,
          assigneeName,
          due,
          status: "open" as const
        };
        todos.push(todo);
        return { todo };
      }
    })
    .register({
      name: "products.findLowStock",
      description: "재고가 threshold 이하인 상품을 찾는다. 'stock 7 이하'나 '재고 10개 이하'에서는 숫자만 threshold number로 사용한다.",
      examples: ["재고 10개 이하인 상품 찾아줘", "stock 7 이하 상품 보여줘", "재고 부족 상품 10개 기준으로 찾아줘"],
      input: z.object({
        threshold: z.number().int().nonnegative()
      }),
      handler: ({ threshold }) => ({
        products: products.filter((product) => product.stock <= threshold)
      })
    })
    .register({
      name: "products.findByName",
      description: "명시적인 상품 이름으로 상품 정보나 가격을 찾는다. 가격/상세/정보 질문에 상품명이 있으면 이 action을 사용하고, 브랜드/접두어/모델명을 포함한 전체 상품명을 name으로 보존한다.",
      examples: ["NLBackend 티셔츠 가격 얼마야?", "NLBackend 스티커 정보 보여줘"],
      input: z.object({
        name: z.string().min(1)
      }),
      handler: ({ name }) => ({
        product: products.find((product) => product.name === name) ?? null
      })
    })
    .register({
      name: "deployments.listRecentFailures",
      description: "최근 실패한 배포를 조회한다. 별도 인자가 필요 없다.",
      examples: ["최근 실패한 배포 보여줘"],
      input: z.object({}),
      handler: () => ({
        deployments: deployments.filter((deployment) => deployment.status === "failed")
      })
    })
    .register({
      name: "logs.search",
      description: "서비스 로그를 검색한다. 사용자가 로그/에러 로그/log search를 명시적으로 요청할 때만 사용한다. service arg는 'auth service'가 아니라 'auth'처럼 서비스 식별자만 넣고, 오늘/ today 요청은 range=today로 둔다.",
      examples: ["오늘 auth service에서 token mismatch 에러 난 로그 찾아줘", "auth 로그에서 token mismatch 찾아줘"],
      input: z.object({
        service: z.string().min(1),
        query: z.string().min(1),
        range: z.enum(["today", "recent"])
      }),
      handler: ({ service, query, range }) => ({
        logs: logs.filter(
          (log) =>
            log.service === service &&
            log.range === range &&
            log.message.toLowerCase().includes(query.toLowerCase())
        )
      })
    });

  return registry;
}

function searchRows<T extends Record<string, unknown>>(rows: T[], args: CrudSearchArgs): T[] {
  const filtered = rows.filter((row) => {
    const matchesFilters = (args.filters ?? []).every((filter: CrudFilter) => matchesFilter(row, filter));
    const matchesKeyword = args.keyword
      ? Object.values(row).some((value) => String(value).toLowerCase().includes(String(args.keyword).toLowerCase()))
      : true;

    return matchesFilters && matchesKeyword;
  });

  const sorted = [...filtered];
  for (const sort of [...(args.sort ?? [])].reverse()) {
    sorted.sort((left, right) => {
      const leftValue = left[sort.field];
      const rightValue = right[sort.field];
      if (leftValue === rightValue) {
        return 0;
      }
      const direction = sort.direction === "asc" ? 1 : -1;
      return String(leftValue) > String(rightValue) ? direction : -direction;
    });
  }

  const offset = args.offset ?? 0;
  const limit = args.limit ?? 20;
  return sorted.slice(offset, offset + limit);
}

function matchesFilter(row: Record<string, unknown>, filter: CrudFilter): boolean {
  const actual = row[filter.field];
  const expected = filter.value;

  switch (filter.operator) {
    case "eq":
      return actual === expected;
    case "neq":
      return actual !== expected;
    case "lt":
      return Number(actual) < Number(expected);
    case "lte":
      return Number(actual) <= Number(expected);
    case "gt":
      return Number(actual) > Number(expected);
    case "gte":
      return Number(actual) >= Number(expected);
    case "in":
      return Array.isArray(expected) ? (expected as unknown[]).includes(actual) : actual === expected;
    case "contains":
      return normalizeText(actual, filter.caseSensitive).includes(normalizeText(expected, filter.caseSensitive));
    case "startsWith":
      return normalizeText(actual, filter.caseSensitive).startsWith(normalizeText(expected, filter.caseSensitive));
    case "endsWith":
      return normalizeText(actual, filter.caseSensitive).endsWith(normalizeText(expected, filter.caseSensitive));
    default:
      return false;
  }
}

function normalizeText(value: unknown, caseSensitive?: boolean): string {
  const text = String(value);
  return caseSensitive ? text : text.toLowerCase();
}
