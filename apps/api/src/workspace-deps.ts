import { SqliteTodoRepository, type TodoRepository } from "@studia/core";
import type { Db } from "./db/connection.js";

export interface WorkspaceDeps {
  repo: TodoRepository;
}

export function buildWorkspaceDeps(db: Db): WorkspaceDeps {
  return { repo: new SqliteTodoRepository(db) };
}
