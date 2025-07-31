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
    buy_price REAL NOT NULL,
    leverage INTEGER CHECK(leverage BETWEEN 1 AND 10) NOT NULL,
    start_date TEXT NOT NULL,  -- YYYY-MM-DD
    end_date TEXT NOT NULL,    -- YYYY-MM-DD
    summary TEXT,
    confidence REAL CHECK(confidence BETWEEN 0 AND 1) NOT NULL,
    stop_loss REAL NOT NULL,   -- Stop loss percentage
    take_profit REAL NOT NULL, -- Take profit percentage
    is_closed BOOLEAN DEFAULT FALSE,
    close_reason TEXT,         -- 'stop_loss', 'take_profit', 'manual', 'expired'
    close_price REAL,
    close_date TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`).run();

// Prices table for caching current and historical prices
db.prepare(`
  CREATE TABLE IF NOT EXISTS prices (
    ticker TEXT PRIMARY KEY,
    current_price REAL NOT NULL,
    yesterday_price REAL,
    last_updated TEXT NOT NULL  -- ISO timestamp
  )
`).run();

// Money table - only store available money, invested is computed
db.prepare(`
  CREATE TABLE IF NOT EXISTS money (
    id INTEGER PRIMARY KEY CHECK(id = 1),
    available REAL NOT NULL
  )
`).run();

// AI Analysis cache table - store AI-generated analyses for 10-K sections
db.prepare(`
  CREATE TABLE IF NOT EXISTS ai_analysis_cache (
    ticker TEXT PRIMARY KEY,
    business_overview TEXT,
    risk_factors_overview TEXT,
    strengths_weaknesses TEXT,
    last_updated TEXT NOT NULL,  -- ISO timestamp
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`).run();

// Company overview cache table - store financial data from AlphaVantage
db.prepare(`
  CREATE TABLE IF NOT EXISTS company_overview_cache (
    ticker TEXT PRIMARY KEY,
    symbol TEXT,
    name TEXT,
    sector TEXT,
    industry TEXT,
    description TEXT,
    market_capitalization REAL,
    revenue_ttm REAL,
    pe_ratio REAL,
    forward_pe REAL,
    dividend_yield REAL,
    dividend_per_share REAL,
    eps REAL,
    profit_margin REAL,
    operating_margin_ttm REAL,
    week_52_high REAL,
    week_52_low REAL,
    moving_average_50_day REAL,
    moving_average_200_day REAL,
    beta REAL,
    last_updated TEXT NOT NULL,  -- ISO timestamp
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`).run();

// User information table - store information about users
db.prepare(`
  CREATE TABLE IF NOT EXISTS user_info (
    user_id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    real_name TEXT,
    information TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT DEFAULT CURRENT_TIMESTAMP
  )
`).run();

// Add real_name column if it doesn't exist (for existing tables)
try {
  db.prepare(`ALTER TABLE user_info ADD COLUMN real_name TEXT`).run();
} catch (error: any) {
  // Column already exists, ignore the error
  if (!error.message?.includes('duplicate column name')) {
    console.error('Error adding real_name column:', error);
  }
}

// Insert initial money row if missing
const row = db.prepare('SELECT id FROM money WHERE id = 1').get();
if (!row) {
  db.prepare('INSERT INTO money (id, available) VALUES (1, 10000)').run();
}

export default db;