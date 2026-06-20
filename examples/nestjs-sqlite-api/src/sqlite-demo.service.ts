import { InjectRepository } from "@nestjs/typeorm";
import { Injectable, OnModuleInit } from "@nestjs/common";
import { Brackets, LessThanOrEqual, Repository } from "typeorm";
import type { ObjectLiteral, SelectQueryBuilder } from "typeorm";
import type {
  ActionRegistry,
  CrudDeleteArgs,
  CrudFilter,
  CrudSearchArgs,
  CrudWhereArgs,
  ProjectContext,
  ProjectResourceContext,
  ProjectResourceEvidence,
  ProjectResourceFieldContext
} from "nlbackend";
import { ProductEntity, SessionEntity, StudentEntity, TodoDue, TodoEntity, UserEntity } from "./demo.entities.js";
import { getSqlitePath } from "./sqlite.config.js";

export type UserRow = UserEntity;
export type StudentRow = StudentEntity;
export type TodoRow = TodoEntity;
export type ProductRow = ProductEntity;

type FieldMap = Record<string, string>;

const userFields: FieldMap = {
  id: "id",
  name: "name",
  email: "email",
  role: "role",
  status: "status"
};

const studentFields: FieldMap = {
  id: "id",
  name: "name",
  grade: "grade",
  major: "major",
  status: "status"
};

const todoFields: FieldMap = {
  id: "id",
  title: "title",
  assigneeName: "assigneeName",
  due: "due",
  status: "status"
};

const productFields: FieldMap = {
  id: "id",
  name: "name",
  stock: "stock",
  price: "price"
};

@Injectable()
export class SqliteDemoService implements OnModuleInit {
  readonly dbPath = getSqlitePath();

  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(StudentEntity)
    private readonly students: Repository<StudentEntity>,
    @InjectRepository(SessionEntity)
    private readonly sessions: Repository<SessionEntity>,
    @InjectRepository(TodoEntity)
    private readonly todos: Repository<TodoEntity>,
    @InjectRepository(ProductEntity)
    private readonly products: Repository<ProductEntity>
  ) {}

  async onModuleInit() {
    await this.seed();
  }

  async listUsers(): Promise<UserRow[]> {
    return this.users.find({
      order: {
        id: "ASC"
      }
    });
  }

  // projectContext is derived entirely from TypeORM entity metadata + the action
  // registry. Developers register entities and actions as usual; there are no
  // aliases, field lists, or roles to hand-write here.
  async buildProjectContext(text: string, registry: ActionRegistry): Promise<ProjectContext> {
    const terms = extractEvidenceTerms(text);
    const repositories: Repository<ObjectLiteral>[] = [this.students, this.users, this.todos, this.products];

    const derived = await Promise.all(repositories.map((repository) => this.deriveResource(repository, registry, terms)));
    const resources = derived.filter((resource): resource is ProjectResourceContext => resource !== undefined);

    return {
      notes: [
        "This context is derived from TypeORM entity metadata (resource and field names) and bounded SQLite evidence (matched rows), before LLM parsing.",
        "Use evidence to choose an action and shape args only; selected actions still fetch real rows."
      ],
      resources
    };
  }

  private async deriveResource<T extends ObjectLiteral>(
    repository: Repository<T>,
    registry: ActionRegistry,
    terms: string[]
  ): Promise<ProjectResourceContext | undefined> {
    const name = repository.metadata.tableName;
    const actions = registry.names().filter((action) => action.startsWith(`${name}.`));
    if (actions.length === 0) {
      return undefined;
    }

    const fields: ProjectResourceFieldContext[] = repository.metadata.columns.map((column) => ({
      name: column.propertyName,
      type: columnType(column),
      identity: column.isPrimary,
      searchable: columnType(column) === "string"
    }));

    const primarySearchAction =
      actions.find((action) => /\.search$/i.test(action)) ??
      actions.find((action) => /\.(find|get|list)/i.test(action)) ??
      actions[0];

    return {
      name,
      actions,
      fields,
      evidence: await this.findResourceEvidence(repository, primarySearchAction, terms)
    };
  }

  async searchUsers(args: CrudSearchArgs): Promise<UserRow[]> {
    return this.searchRepository(this.users, "user", userFields, args, ["id", "name", "email", "role", "status"]);
  }

  async createUser(data: Pick<UserEntity, "id" | "name" | "email" | "role" | "status">): Promise<UserRow> {
    return this.users.save(this.users.create(data));
  }

  async updateUsers(args: { where: CrudWhereArgs; patch: Partial<Pick<UserEntity, "name" | "email" | "role" | "status">>; limit: number }) {
    return {
      users: await this.updateRepository(this.users, "user", userFields, args.where, args.patch, args.limit)
    };
  }

  async deleteUsers(args: CrudDeleteArgs) {
    return {
      users: await this.deleteRepository(this.users, "user", userFields, args)
    };
  }

  async findUsersByName(name: string): Promise<UserRow[]> {
    return this.users.find({
      where: { name },
      order: {
        id: "ASC"
      }
    });
  }

  async findUserByEmail(email: string): Promise<UserRow | null> {
    return this.users.findOne({
      where: { email }
    });
  }

  async listStudents(): Promise<StudentRow[]> {
    return this.students.find({
      order: {
        id: "ASC"
      }
    });
  }

  async searchStudents(args: CrudSearchArgs): Promise<StudentRow[]> {
    return this.searchRepository(this.students, "student", studentFields, args, ["id", "name", "major", "status"]);
  }

  async getStudentById(id: string): Promise<StudentRow | null> {
    return this.students.findOne({
      where: { id }
    });
  }

  async createStudent(data: Pick<StudentEntity, "id" | "name" | "grade" | "major" | "status">): Promise<StudentRow> {
    return this.students.save(this.students.create(data));
  }

  async updateStudents(args: { where: CrudWhereArgs; patch: Partial<Pick<StudentEntity, "name" | "grade" | "major" | "status">>; limit: number }) {
    return {
      students: await this.updateRepository(this.students, "student", studentFields, args.where, args.patch, args.limit)
    };
  }

  async deleteStudents(args: CrudDeleteArgs) {
    return {
      students: await this.deleteRepository(this.students, "student", studentFields, args)
    };
  }

  async getUserById(id: string): Promise<UserRow | null> {
    return this.users.findOne({
      where: { id }
    });
  }

  async verifySessionToken(sessionId: string, token: string) {
    const row = await this.sessions.findOne({
      where: {
        sessionId,
        token
      }
    });

    return {
      success: Boolean(row),
      userId: row?.userId ?? null
    };
  }

  async listTodos(): Promise<TodoRow[]> {
    return this.todos
      .createQueryBuilder("todo")
      .orderBy("CASE todo.due WHEN 'today' THEN 0 WHEN 'tomorrow' THEN 1 ELSE 2 END", "ASC")
      .addOrderBy("todo.id", "ASC")
      .getMany();
  }

  async searchTodos(args: CrudSearchArgs): Promise<TodoRow[]> {
    return this.searchRepository(this.todos, "todo", todoFields, args, ["id", "title", "assigneeName", "due", "status"]);
  }

  async listProducts(): Promise<ProductRow[]> {
    return this.products.find({
      order: {
        id: "ASC"
      }
    });
  }

  async searchProducts(args: CrudSearchArgs): Promise<ProductRow[]> {
    return this.searchRepository(this.products, "product", productFields, args, ["id", "name"]);
  }

  async listTodosByAssignee(assigneeName: string): Promise<TodoRow[]> {
    return this.todos.find({
      where: { assigneeName },
      order: {
        id: "ASC"
      }
    });
  }

  async listTodosDueToday(): Promise<TodoRow[]> {
    return this.todos.find({
      where: { due: "today" },
      order: {
        id: "ASC"
      }
    });
  }

  async createTodo(assigneeName: string, title: string, due: TodoDue): Promise<TodoRow> {
    const todo = this.todos.create({
      id: `todo_${Date.now().toString(36)}`,
      title,
      assigneeName,
      due,
      status: "open"
    });

    return this.todos.save(todo);
  }

  async createTodoFromData(data: Pick<TodoEntity, "id" | "title" | "assigneeName" | "due" | "status">): Promise<TodoRow> {
    return this.todos.save(this.todos.create(data));
  }

  async updateTodos(args: { where: CrudWhereArgs; patch: Partial<Pick<TodoEntity, "title" | "assigneeName" | "due" | "status">>; limit: number }) {
    return {
      todos: await this.updateRepository(this.todos, "todo", todoFields, args.where, args.patch, args.limit)
    };
  }

  async deleteTodos(args: CrudDeleteArgs) {
    return {
      todos: await this.deleteRepository(this.todos, "todo", todoFields, args)
    };
  }

  async findLowStockProducts(threshold: number): Promise<ProductRow[]> {
    return this.products.find({
      where: {
        stock: LessThanOrEqual(threshold)
      },
      order: {
        stock: "ASC",
        id: "ASC"
      }
    });
  }

  async findProductByName(name: string): Promise<ProductRow | null> {
    return this.products.findOne({
      where: { name }
    });
  }

  async createProduct(data: Pick<ProductEntity, "id" | "name" | "stock" | "price">): Promise<ProductRow> {
    return this.products.save(this.products.create(data));
  }

  async updateProducts(args: { where: CrudWhereArgs; patch: Partial<Pick<ProductEntity, "name" | "stock" | "price">>; limit: number }) {
    return {
      products: await this.updateRepository(this.products, "product", productFields, args.where, args.patch, args.limit)
    };
  }

  async deleteProducts(args: CrudDeleteArgs) {
    return {
      products: await this.deleteRepository(this.products, "product", productFields, args)
    };
  }

  private async findResourceEvidence<T extends ObjectLiteral>(
    repository: Repository<T>,
    action: string,
    terms: string[]
  ): Promise<ProjectResourceEvidence[]> {
    const alias = repository.metadata.tableName;
    const searchable = repository.metadata.columns.filter((column) => columnType(column) === "string");
    if (terms.length === 0 || searchable.length === 0) {
      return [];
    }

    const qb = repository.createQueryBuilder(alias);
    qb.where(
      new Brackets((inner) => {
        terms.forEach((term, termIndex) => {
          searchable.forEach((column, columnIndex) => {
            const param = `${alias}_evidence_${termIndex}_${columnIndex}`;
            inner.orWhere(`LOWER(CAST(${alias}.${column.databaseName} AS TEXT)) LIKE LOWER(:${param})`, {
              [param]: `%${escapeSqlLike(term)}%`
            });
          });
        });
      })
    );
    qb.take(20);

    const rows = await qb.getMany();
    const evidence: ProjectResourceEvidence[] = [];

    for (const term of terms) {
      for (const column of searchable) {
        const matchedValues = uniqueValues(
          rows
            .map((row) => (row as Record<string, unknown>)[column.propertyName])
            .filter((value) => valueMatchesTerm(value, term))
            .map((value) => normalizeEvidenceValue(value))
        );

        if (matchedValues.length === 0) {
          continue;
        }

        const operator = inferEvidenceOperator(matchedValues, term);
        evidence.push({
          action,
          field: column.propertyName,
          operator,
          value: term,
          matchedValues: matchedValues.slice(0, 5),
          rowCount: matchedValues.length,
          confidence: evidenceConfidence({ name: column.propertyName, identity: column.isPrimary }, operator),
          note: column.isPrimary
            ? "Matched an identity/search field for this resource."
            : "Matched a searchable supporting field for this resource."
        });
      }
    }

    return evidence.slice(0, 12);
  }

  private async searchRepository<T extends ObjectLiteral>(
    repository: Repository<T>,
    alias: string,
    fields: FieldMap,
    args: CrudSearchArgs,
    keywordFields: string[]
  ): Promise<T[]> {
    const qb = repository.createQueryBuilder(alias);
    this.applyFilters(qb, alias, fields, args.filters ?? []);
    this.applyKeyword(qb, alias, fields, keywordFields, args.keyword);

    for (const sort of args.sort ?? []) {
      qb.addOrderBy(this.fieldExpression(alias, fields, sort.field), sort.direction.toUpperCase() as "ASC" | "DESC");
    }

    qb.take(args.limit ?? 20).skip(args.offset ?? 0);
    if ((args.sort ?? []).length === 0 && fields.id) {
      qb.addOrderBy(this.fieldExpression(alias, fields, "id"), "ASC");
    }

    return qb.getMany();
  }

  private async updateRepository<T extends ObjectLiteral>(
    repository: Repository<T>,
    alias: string,
    fields: FieldMap,
    where: CrudWhereArgs,
    patch: Record<string, unknown>,
    limit: number
  ): Promise<T[]> {
    const rows = await this.searchRepository(repository, alias, fields, { filters: where.filters, limit, offset: 0, sort: [] }, []);
    if (rows.length === 0) {
      return [];
    }

    return repository.save(rows.map((row) => Object.assign(row, patch)));
  }

  private async deleteRepository<T extends ObjectLiteral>(
    repository: Repository<T>,
    alias: string,
    fields: FieldMap,
    args: CrudDeleteArgs
  ): Promise<T[]> {
    const rows = await this.searchRepository(repository, alias, fields, { filters: args.where.filters, limit: args.limit, offset: 0, sort: [] }, []);
    if (rows.length === 0) {
      return [];
    }

    if (args.mode === "soft" && rows.every((row) => "status" in row)) {
      const softDeleted = rows.map((row) => Object.assign(row, { status: this.softDeletedStatus(row.status) }));
      return repository.save(softDeleted);
    }

    await repository.remove(rows);
    return rows;
  }

  private applyFilters<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    alias: string,
    fields: FieldMap,
    filters: CrudFilter[]
  ) {
    filters.forEach((filter, index) => {
      const expression = this.fieldExpression(alias, fields, filter.field);
      const param = `${alias}_${filter.field}_${index}`;
      const value = filter.value;

      switch (filter.operator) {
        case "eq":
          qb.andWhere(`${expression} = :${param}`, { [param]: value });
          break;
        case "neq":
          qb.andWhere(`${expression} != :${param}`, { [param]: value });
          break;
        case "lt":
          qb.andWhere(`${expression} < :${param}`, { [param]: value });
          break;
        case "lte":
          qb.andWhere(`${expression} <= :${param}`, { [param]: value });
          break;
        case "gt":
          qb.andWhere(`${expression} > :${param}`, { [param]: value });
          break;
        case "gte":
          qb.andWhere(`${expression} >= :${param}`, { [param]: value });
          break;
        case "in":
          qb.andWhere(`${expression} IN (:...${param})`, { [param]: Array.isArray(value) ? value : [value] });
          break;
        case "contains":
          this.applyLike(qb, expression, param, `%${String(value)}%`, filter.caseSensitive);
          break;
        case "startsWith":
          this.applyLike(qb, expression, param, `${String(value)}%`, filter.caseSensitive);
          break;
        case "endsWith":
          this.applyLike(qb, expression, param, `%${String(value)}`, filter.caseSensitive);
          break;
      }
    });
  }

  private applyKeyword<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    alias: string,
    fields: FieldMap,
    keywordFields: string[],
    keyword?: string
  ) {
    if (!keyword) {
      return;
    }

    qb.andWhere(
      new Brackets((inner) => {
        keywordFields.forEach((field, index) => {
          const expression = this.fieldExpression(alias, fields, field);
          const param = `${alias}_keyword_${index}`;
          inner.orWhere(`LOWER(${expression}) LIKE LOWER(:${param})`, { [param]: `%${keyword}%` });
        });
      })
    );
  }

  private applyLike<T extends ObjectLiteral>(
    qb: SelectQueryBuilder<T>,
    expression: string,
    param: string,
    value: string,
    caseSensitive?: boolean
  ) {
    if (caseSensitive) {
      qb.andWhere(`${expression} LIKE :${param}`, { [param]: value });
      return;
    }

    qb.andWhere(`LOWER(${expression}) LIKE LOWER(:${param})`, { [param]: value });
  }

  private fieldExpression(alias: string, fields: FieldMap, field: string): string {
    const column = fields[field];
    if (!column) {
      throw new Error(`Unsupported CRUD field: ${field}`);
    }

    return `${alias}.${column}`;
  }

  private softDeletedStatus(current: unknown): string {
    if (current === "active") {
      return "inactive";
    }
    if (current === "open") {
      return "done";
    }
    return "inactive";
  }

  private async seed() {
    if ((await this.users.count()) === 0) {
      await this.users.save([
        { id: "user_1", name: "유성윤", email: "sungyoon@example.com", role: "admin", status: "active" },
        { id: "user_2", name: "김민지", email: "minji@example.com", role: "member", status: "active" },
        { id: "user_3", name: "유성윤", email: "other-yoo@example.com", role: "member", status: "blocked" },
        { id: "user_4", name: "이민지", email: "lee.minji@example.com", role: "member", status: "active" }
      ]);
    }

    if ((await this.students.count()) === 0) {
      await this.students.save([
        { id: "student_1", name: "김민지", grade: 2, major: "computer-science", status: "active" },
        { id: "student_2", name: "이민지", grade: 3, major: "design", status: "active" },
        { id: "student_3", name: "박민수", grade: 1, major: "business", status: "active" }
      ]);
    }

    if ((await this.sessions.count()) === 0) {
      await this.sessions.save([
        { sessionId: "48ysfat", token: "24435", userId: "user_1" },
        { sessionId: "guest-1", token: "guest-token", userId: "user_2" }
      ]);
    }

    if ((await this.todos.count()) === 0) {
      await this.todos.save([
        { id: "todo_1", title: "액션 레지스트리 만들기", assigneeName: "유성윤", due: "tomorrow", status: "open" },
        { id: "todo_2", title: "demo parser 테스트 작성", assigneeName: "유성윤", due: "today", status: "open" },
        { id: "todo_3", title: "문서 정리", assigneeName: "김민지", due: "later", status: "done" }
      ]);
    }

    if ((await this.products.count()) === 0) {
      await this.products.save([
        { id: "product_1", name: "NLBackend 티셔츠", stock: 7, price: 29000 },
        { id: "product_2", name: "NLBackend 스티커", stock: 48, price: 3000 }
      ]);
    }
  }
}

const evidenceStopwords = new Set([
  "find",
  "search",
  "show",
  "list",
  "all",
  "every",
  "name",
  "user",
  "users",
  "account",
  "student",
  "students",
  "product",
  "products",
  "todo",
  "todos",
  "task",
  "tasks",
  "찾아줘",
  "찾아봐",
  "찾아",
  "검색해줘",
  "검색해봐",
  "검색",
  "보여줘",
  "보여봐",
  "보여",
  "조회해줘",
  "조회해봐",
  "조회",
  "좀",
  "이름",
  "유저",
  "사용자",
  "계정",
  "학생",
  "상품",
  "제품",
  "할일",
  "작업",
  "정보",
  "가격",
  "상태",
  "전체",
  "모든",
  "다"
]);

function extractEvidenceTerms(text: string): string[] {
  const quotedTerms = [...text.matchAll(/["'“”‘’]([^"'“”‘’]{2,})["'“”‘’]/g)].map((match) => match[1]?.trim()).filter(Boolean) as string[];
  const tokenTerms = (text.match(/[\p{L}\p{N}_.@+-]+/gu) ?? []).map(cleanEvidenceToken).filter((token) => token.length > 0);

  return uniqueValues([...quotedTerms, ...tokenTerms])
    .filter((term) => term.includes("@") || /\d/.test(term) || term.length >= 2)
    .slice(0, 8);
}

function cleanEvidenceToken(value: string): string {
  let token = value.trim().replace(/^[^@\p{L}\p{N}]+|[^@\p{L}\p{N}]+$/gu, "");
  if (!token) {
    return "";
  }

  token = token
    .replace(/(찾아줘|찾아봐|찾아|검색해줘|검색해봐|검색|보여줘|보여봐|보여|조회해줘|조회해봐|조회)$/u, "")
    .replace(/^(학생|유저|사용자|계정|상품|제품|할일|작업|todo|todos|task|tasks|user|users|product|products|student|students)/iu, "")
    .replace(/(학생|유저|사용자|계정|상품|제품|할일|작업|todo|todos|task|tasks|user|users|product|products|student|students)$/iu, "")
    .replace(/(입니다|이에요|예요|이고|이고요)$/u, "")
    .replace(/(이라는|라는|인)$/u, "")
    .replace(/(님|씨|좀|야|아)$/u, "")
    .replace(/(에서|으로|에게|한테|부터|까지|으로|로|을|를|이|가|은|는|의|와|과|만)$/u, "");

  const normalized = token.toLowerCase();
  return evidenceStopwords.has(normalized) || evidenceStopwords.has(token) ? "" : token;
}

function columnType(column: { type: unknown }): "string" | "number" | "boolean" {
  if (column.type === Number) {
    return "number";
  }
  if (column.type === Boolean) {
    return "boolean";
  }
  const type = String(column.type).toLowerCase();
  if (/int|float|double|decimal|numeric|real/.test(type)) {
    return "number";
  }
  if (/bool/.test(type)) {
    return "boolean";
  }
  return "string";
}

function valueMatchesTerm(value: unknown, term: string): boolean {
  return normalizeEvidenceText(value).includes(term.toLowerCase());
}

function normalizeEvidenceText(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeEvidenceValue(value: unknown): string | number | boolean | null {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === null) {
    return value;
  }
  if (value === undefined) {
    return null;
  }
  return String(value);
}

function inferEvidenceOperator(values: Array<string | number | boolean | null>, term: string): ProjectResourceEvidence["operator"] {
  const normalizedValues = values.map((value) => normalizeEvidenceText(value));
  const normalizedTerm = term.toLowerCase();

  if (normalizedValues.every((value) => value === normalizedTerm)) {
    return "eq";
  }
  if (normalizedValues.every((value) => value.startsWith(normalizedTerm))) {
    return "startsWith";
  }
  if (normalizedValues.every((value) => value.endsWith(normalizedTerm))) {
    return "endsWith";
  }
  return "contains";
}

function evidenceConfidence(
  field: ProjectResourceFieldContext,
  operator: ProjectResourceEvidence["operator"]
): ProjectResourceEvidence["confidence"] {
  if (field.identity && (operator === "eq" || operator === "endsWith")) {
    return "high";
  }
  if (field.identity || operator === "eq") {
    return "medium";
  }
  return "low";
}

function uniqueValues<T>(values: T[]): T[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const key = JSON.stringify(value);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function escapeSqlLike(value: string): string {
  return value.replace(/[%_]/g, "");
}
