// Earlier play-chip guesses must never become dollar obligations automatically.
export function initializeDatabase(db) {
 db.exec('BEGIN IMMEDIATE');
 try {
  const columns=db.prepare('PRAGMA table_info(bets)').all();
  if(columns.some(column=>column.name==='amount')) {
   db.exec('ALTER TABLE bets RENAME TO legacy_chip_bets');
   if(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='game'").get())db.exec('ALTER TABLE game RENAME TO legacy_chip_game');
  }
  db.exec(`CREATE TABLE IF NOT EXISTS bets(id TEXT PRIMARY KEY,name TEXT NOT NULL,name_key TEXT NOT NULL,date TEXT NOT NULL,amount_cents INTEGER NOT NULL CHECK(typeof(amount_cents)='integer' AND amount_cents BETWEEN 100 AND 100000),created_at INTEGER NOT NULL,venmo_username TEXT,request_id TEXT UNIQUE);
   CREATE TABLE IF NOT EXISTS game(id INTEGER PRIMARY KEY CHECK(id=1),status TEXT NOT NULL,actual_date TEXT,updated_at INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,expires_at INTEGER NOT NULL);
   CREATE TABLE IF NOT EXISTS metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL);`);
  if(!db.prepare('PRAGMA table_info(bets)').all().some(column=>column.name==='venmo_username')) {
   db.exec('ALTER TABLE bets ADD COLUMN venmo_username TEXT');
  }
  if(!db.prepare('PRAGMA table_info(bets)').all().some(column=>column.name==='request_id')) {
   // Remove the old one-bet-per-name constraint without changing saved wagers.
   db.exec(`CREATE TABLE bets_multiple(id TEXT PRIMARY KEY,name TEXT NOT NULL,name_key TEXT NOT NULL,date TEXT NOT NULL,amount_cents INTEGER NOT NULL CHECK(typeof(amount_cents)='integer' AND amount_cents BETWEEN 100 AND 100000),created_at INTEGER NOT NULL,venmo_username TEXT,request_id TEXT UNIQUE);
    INSERT INTO bets_multiple(id,name,name_key,date,amount_cents,created_at,venmo_username) SELECT id,name,name_key,date,amount_cents,created_at,venmo_username FROM bets;
    DROP TABLE bets;
    ALTER TABLE bets_multiple RENAME TO bets;`);
  }
  db.prepare("INSERT OR REPLACE INTO metadata VALUES('currency','USD')").run();
  db.exec('COMMIT');
 }catch(error){db.exec('ROLLBACK');throw error;}
}
