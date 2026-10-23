import type { Project } from './model';
import type { Issue } from './design/schema';
export type NamespaceId = 'local' | (string & {});
export type ProjectKey = { namespaceId: NamespaceId; projectId: string };
export type ConcurrencyToken = { localGeneration: number };
export type ProjectSummary = Pick<Project, 'id' | 'name' | 'updatedAt'> & { localGeneration: number; schemaVersion: number; issueCount: number };
export type RecoveryIssue = Issue & { recoveryId: string; sourceProjectId?: string };
export type ReadResult<T> = { ok: true; value: T; token: ConcurrencyToken } | { ok: false; kind: 'not-found' | 'unsupported-version' | 'validation' | 'storage-failure'; issue?: Issue; recoveryId?: string };
export type WriteResult = { ok: true; value: Project; token: ConcurrencyToken } | { ok: false; kind: 'not-found' | 'conflict' | 'validation' | 'unsupported-version' | 'quota' | 'storage-failure'; issue?: Issue; recoveryId?: string };
export type DeleteResult = { ok: true } | { ok: false; kind: 'not-found' | 'conflict' | 'storage-failure'; issue?: Issue };
export type ListResult = { ok: true; summaries: ProjectSummary[]; issues: RecoveryIssue[] } | { ok: false; kind: 'storage-failure'; issues: RecoveryIssue[] };
export interface ProjectRepository {
  list(namespaceId: NamespaceId): Promise<ListResult>;
  get(key: ProjectKey): Promise<ReadResult<Project>>;
  create(namespaceId: NamespaceId, document: Project): Promise<WriteResult>;
  save(key: ProjectKey, document: Project, expected: ConcurrencyToken): Promise<WriteResult>;
  delete(key: ProjectKey, expected: ConcurrencyToken): Promise<DeleteResult>;
  subscribe(namespaceId: NamespaceId, listener: (changed: ProjectKey[]) => void): () => void;
}
