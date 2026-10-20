import { openDB } from "idb";
import type { Project } from "./engine";
const db = openDB("countertop-studio", 1, {
  upgrade(db) {
    db.createObjectStore("projects", { keyPath: "id" });
  },
});
export async function listProjects(): Promise<Project[]> {
  return (await db).getAll("projects");
}
export async function saveProject(p: Project) {
  await (await db).put("projects", p);
}
export async function deleteProject(id: string) {
  await (await db).delete("projects", id);
}
