import initSqlJs, { Database } from 'sql.js';
import * as fs from 'fs';
import * as path from 'path';

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../data/gantt.db');
const DB_DIR = path.dirname(DB_PATH);

let db: Database;

async function initDatabase(): Promise<Database> {
  // 确保数据目录存在
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  // 加载 WASM 文件
  const wasmBinary = fs.readFileSync(
    path.join(__dirname, '../node_modules/sql.js/dist/sql-wasm.wasm')
  );
  const SQL = await initSqlJs({ wasmBinary });

  // 尝试加载现有数据库
  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  // 创建表
  db.run(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      color TEXT DEFAULT '#4A90D9',
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      progress INTEGER DEFAULT 0,
      color TEXT DEFAULT '#4A90D9',
      parent_id TEXT,
      dependencies TEXT DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now', 'localtime')),
      updated_at TEXT DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (parent_id) REFERENCES tasks(id) ON DELETE SET NULL
    )
  `);

  saveDatabase();
  console.log('Database initialized successfully');
  
  return db;
}

function saveDatabase() {
  if (db) {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_PATH, buffer);
  }
}

// 封装数据库操作
export const database = {
  init: initDatabase,
  
  run: (sql: string, params: any[] = []): { changes: number; lastInsertRowid: number } => {
    db.run(sql, params);
    saveDatabase();
    return { changes: db.getRowsModified(), lastInsertRowid: 0 };
  },
  
  get: <T>(sql: string, params: any[] = []): T | undefined => {
    const stmt = db.prepare(sql);
    stmt.bind(params);
    if (stmt.step()) {
      const row = stmt.getAsObject() as T;
      stmt.free();
      return row;
    }
    stmt.free();
    return undefined;
  },
  
  all: <T>(sql: string, params: any[] = []): T[] => {
    const results: T[] = [];
    const stmt = db.prepare(sql);
    stmt.bind(params);
    while (stmt.step()) {
      results.push(stmt.getAsObject() as T);
    }
    stmt.free();
    return results;
  }
};

export default database;