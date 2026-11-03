import { randomUUID } from 'node:crypto';

// Internal persistence boundary. Callers must supply an identity verified by an
// authentication provider; this module is deliberately not exposed over HTTP.
export class WorkspaceStore {
  constructor(db) {
    this.db = db;
    db.exec(`PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS workspaces (id TEXT PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS workspace_members (workspace_id TEXT NOT NULL REFERENCES workspaces(id), user_id TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('owner','editor','viewer')), PRIMARY KEY(workspace_id,user_id));
      CREATE TABLE IF NOT EXISTS workspace_records (workspace_id TEXT NOT NULL REFERENCES workspaces(id), id TEXT NOT NULL, payload TEXT NOT NULL, version INTEGER NOT NULL, PRIMARY KEY(workspace_id,id));`);
  }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  requireRole(workspace, user, roles) {
    if (typeof user !== 'string' || !user.trim()) throw new Error('Authentication required');
    const member = this.db.prepare('SELECT role FROM workspace_members WHERE workspace_id=? AND user_id=?').get(workspace, user);
    if (!member || !roles.includes(member.role)) throw new Error('Workspace access denied');
    return member.role;
  }
  create(user, name) {
    if (typeof user !== 'string' || !user.trim()) throw new Error('Authentication required');
    if (typeof name !== 'string' || !name.trim() || name.length > 120) throw new Error('Invalid workspace name');
    const id = randomUUID();
    this.transaction(() => {
      this.db.prepare('INSERT INTO workspaces VALUES (?,?)').run(id, name.trim());
      this.db.prepare('INSERT INTO workspace_members VALUES (?,?,?)').run(id, user, 'owner');
    });
    return {id, name:name.trim()};
  }
  listForUser(user) {
    if (typeof user !== 'string' || !user.trim()) throw new Error('Authentication required');
    return this.db.prepare('SELECT w.id,w.name,m.role FROM workspaces w JOIN workspace_members m ON m.workspace_id=w.id WHERE m.user_id=? ORDER BY w.name').all(user);
  }
  addMember(workspace, actor, user, role) {
    if (typeof user !== 'string' || !user.trim() || !['editor','viewer'].includes(role)) throw new Error('Invalid membership');
    this.transaction(() => {
      this.requireRole(workspace, actor, ['owner']);
      this.db.prepare('INSERT INTO workspace_members VALUES (?,?,?)').run(workspace, user, role);
    });
  }
  list(workspace, user) {
    this.requireRole(workspace, user, ['owner','editor','viewer']);
    return this.db.prepare('SELECT id,payload,version FROM workspace_records WHERE workspace_id=? ORDER BY id').all(workspace).map(r=>({...r,payload:JSON.parse(r.payload)}));
  }
  put(workspace, user, id, payload, expectedVersion) {
    if (typeof id !== 'string' || !id.trim() || id.length > 128 || !Number.isInteger(expectedVersion) || expectedVersion < 0) throw new Error('Invalid record');
    // JSON cannot preserve the browser's Blob values. Reject attachments until
    // an authenticated binary store is wired in, rather than silently lose them.
    if (payload && typeof payload === 'object' && Array.isArray(payload.sources) && payload.sources.length) throw new Error('Attachments are not supported in shared records yet');
    const encoded = JSON.stringify(payload);
    if (typeof encoded !== 'string' || Buffer.byteLength(encoded) > 1024*1024) throw new Error('Invalid record payload');
    return this.transaction(() => {
      this.requireRole(workspace, user, ['owner','editor']);
      const current = this.db.prepare('SELECT version FROM workspace_records WHERE workspace_id=? AND id=?').get(workspace,id);
      if ((current?.version ?? 0) !== expectedVersion) throw new Error('Record version conflict');
      const version = expectedVersion + 1;
      this.db.prepare('INSERT INTO workspace_records VALUES (?,?,?,?) ON CONFLICT(workspace_id,id) DO UPDATE SET payload=excluded.payload, version=excluded.version').run(workspace,id,encoded,version);
      return version;
    });
  }
}
