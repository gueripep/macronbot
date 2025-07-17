// dbSetup.ts
import Database from 'better-sqlite3';

const db: any = new Database('mydb.sqlite');

// Transactions table
db.prepare(`
  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    decision TEXT CHECK(decision IN ('Long', 'Short')) NOT NULL,
    ticker TEXT NOT NULL,
    amount_invested REAL NOT NULL,
    leverage INTEGER CHECK(leverage BETWEEN 1 AND 10) NOT NULL,
    start_date TEXT NOT NULL,  -- YYYY-MM-DD
    end_date TEXT NOT NULL,    -- YYYY-MM-DD
    summary TEXT,
    confidence REAL CHECK(confidence BETWEEN 0 AND 1) NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`).run();

// Money table - only one row, update as needed
db.prepare(`
  CREATE TABLE IF NOT EXISTS money (
    id INTEGER PRIMARY KEY CHECK(id = 1),
    available REAL NOT NULL,
    invested REAL NOT NULL
  )
`).run();

// Insert initial money row if missing
const row = db.prepare('SELECT id FROM money WHERE id = 1').get();
if (!row) {
  db.prepare('INSERT INTO money (id, available, invested) VALUES (1, 10000, 0)').run();
}

export default db;