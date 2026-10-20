"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const defaultPath = path.join(__dirname, "data", "profiles.db");
const databasePath = process.env.DB_PATH
  ? path.resolve(process.env.DB_PATH)
  : defaultPath;

fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const raw = new DatabaseSync(databasePath);
raw.exec("PRAGMA journal_mode = WAL;");
raw.exec("PRAGMA foreign_keys = ON;");

raw.exec(`
  CREATE TABLE IF NOT EXISTS people (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    gender TEXT,
    birth_date TEXT,
    phone TEXT,
    email TEXT,
    id_card TEXT,
    note TEXT,
    contacts TEXT NOT NULL DEFAULT '[]',
    avatar TEXT,
    socials TEXT NOT NULL DEFAULT '[]',
    addresses TEXT NOT NULL DEFAULT '[]',
    interests TEXT NOT NULL DEFAULT '[]',
    custom_fields TEXT NOT NULL DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS relations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL CHECK (type IN ('peer', 'role')),
    person_a_id INTEGER NOT NULL,
    person_b_id INTEGER NOT NULL,
    label TEXT,
    forward_label TEXT,
    reverse_label TEXT,
    FOREIGN KEY (person_a_id) REFERENCES people(id) ON DELETE CASCADE,
    FOREIGN KEY (person_b_id) REFERENCES people(id) ON DELETE CASCADE,
    CHECK (person_a_id <> person_b_id)
  );

  CREATE INDEX IF NOT EXISTS idx_relations_person_a
    ON relations(person_a_id);
  CREATE INDEX IF NOT EXISTS idx_relations_person_b
    ON relations(person_b_id);

  CREATE UNIQUE INDEX IF NOT EXISTS idx_relations_unique_pair
    ON relations (
      CASE WHEN person_a_id < person_b_id THEN person_a_id ELSE person_b_id END,
      CASE WHEN person_a_id < person_b_id THEN person_b_id ELSE person_a_id END
    );
`);

const db = {
  prepare: (sql) => raw.prepare(sql),
  exec: (sql) => raw.exec(sql),
  transaction: (fn) => (...args) => {
    raw.exec("BEGIN");
    try {
      const result = fn(...args);
      raw.exec("COMMIT");
      return result;
    } catch (error) {
      try {
        raw.exec("ROLLBACK");
      } catch {}
      throw error;
    }
  },
  close: () => raw.close()
};

module.exports = db;
