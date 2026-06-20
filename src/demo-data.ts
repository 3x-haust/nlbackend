export type DemoUser = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "member";
  status: "active" | "blocked" | "inactive";
};

export type DemoStudent = {
  id: string;
  name: string;
  grade: number;
  major: string;
  status: "active" | "graduated" | "inactive";
};

export type DemoTodo = {
  id: string;
  title: string;
  assigneeName: string;
  due: "today" | "tomorrow" | "later";
  status: "open" | "done";
};

export const users: DemoUser[] = [
  {
    id: "user_1",
    name: "유성윤",
    email: "sungyoon@example.com",
    role: "admin",
    status: "active"
  },
  {
    id: "user_2",
    name: "김민지",
    email: "minji@example.com",
    role: "member",
    status: "active"
  },
  {
    id: "user_3",
    name: "유성윤",
    email: "other-yoo@example.com",
    role: "member",
    status: "blocked"
  },
  {
    id: "user_4",
    name: "이민지",
    email: "lee.minji@example.com",
    role: "member",
    status: "active"
  }
];

export const students: DemoStudent[] = [
  {
    id: "student_1",
    name: "김민지",
    grade: 2,
    major: "computer-science",
    status: "active"
  },
  {
    id: "student_2",
    name: "이민지",
    grade: 3,
    major: "design",
    status: "active"
  },
  {
    id: "student_3",
    name: "박민수",
    grade: 1,
    major: "business",
    status: "active"
  }
];

export const sessions = [
  {
    sessionId: "48ysfat",
    token: "24435",
    userId: "user_1"
  },
  {
    sessionId: "guest-1",
    token: "guest-token",
    userId: "user_2"
  }
];

export const todos: DemoTodo[] = [
  {
    id: "todo_1",
    title: "액션 레지스트리 만들기",
    assigneeName: "유성윤",
    due: "tomorrow",
    status: "open"
  },
  {
    id: "todo_2",
    title: "demo parser 테스트 작성",
    assigneeName: "유성윤",
    due: "today",
    status: "open"
  },
  {
    id: "todo_3",
    title: "문서 정리",
    assigneeName: "김민지",
    due: "later",
    status: "done"
  }
];

export const products = [
  {
    id: "product_1",
    name: "NLBackend 티셔츠",
    stock: 7,
    price: 29000
  },
  {
    id: "product_2",
    name: "NLBackend 스티커",
    stock: 48,
    price: 3000
  }
];

export const deployments = [
  {
    id: "deploy_1",
    service: "api",
    status: "failed",
    reason: "health check timeout"
  },
  {
    id: "deploy_2",
    service: "web",
    status: "success",
    reason: null
  }
];

export const logs = [
  {
    id: "log_1",
    service: "auth",
    level: "error",
    message: "token mismatch for session 48ysfat",
    range: "today"
  },
  {
    id: "log_2",
    service: "api",
    level: "info",
    message: "request completed",
    range: "today"
  }
];
