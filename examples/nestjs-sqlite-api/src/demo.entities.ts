import { Column, Entity, PrimaryColumn } from "typeorm";

export type UserRole = "admin" | "member";
export type UserStatus = "active" | "blocked" | "inactive";
export type TodoDue = "today" | "tomorrow" | "later";
export type TodoStatus = "open" | "done";
export type StudentStatus = "active" | "graduated" | "inactive";

@Entity({ name: "users" })
export class UserEntity {
  @PrimaryColumn({ type: "text" })
  id!: string;

  @Column({ type: "text" })
  name!: string;

  @Column({ type: "text", unique: true })
  email!: string;

  @Column({ type: "text" })
  role!: UserRole;

  @Column({ type: "text" })
  status!: UserStatus;
}

@Entity({ name: "students" })
export class StudentEntity {
  @PrimaryColumn({ type: "text" })
  id!: string;

  @Column({ type: "text" })
  name!: string;

  @Column({ type: "integer" })
  grade!: number;

  @Column({ type: "text" })
  major!: string;

  @Column({ type: "text" })
  status!: StudentStatus;
}

@Entity({ name: "sessions" })
export class SessionEntity {
  @PrimaryColumn({ name: "session_id", type: "text" })
  sessionId!: string;

  @Column({ type: "text" })
  token!: string;

  @Column({ name: "user_id", type: "text" })
  userId!: string;
}

@Entity({ name: "todos" })
export class TodoEntity {
  @PrimaryColumn({ type: "text" })
  id!: string;

  @Column({ type: "text" })
  title!: string;

  @Column({ name: "assignee_name", type: "text" })
  assigneeName!: string;

  @Column({ type: "text" })
  due!: TodoDue;

  @Column({ type: "text" })
  status!: TodoStatus;
}

@Entity({ name: "products" })
export class ProductEntity {
  @PrimaryColumn({ type: "text" })
  id!: string;

  @Column({ type: "text", unique: true })
  name!: string;

  @Column({ type: "integer" })
  stock!: number;

  @Column({ type: "integer" })
  price!: number;
}
