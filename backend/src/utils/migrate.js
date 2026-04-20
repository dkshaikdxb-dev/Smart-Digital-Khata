#!/usr/bin/env node
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');

async function run() {
  const dir = path.join(__dirname, '..', '..', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();

  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      run_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  for (const f of files) {
    const done = await pool.query('SELECT 1 FROM _migrations WHERE name = $1', [f]);
    if (done.rowCount) {
      console.log(`-- skip ${f}`);
      continue;
    }
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    console.log(`-> running ${f}`);
    await pool.query('BEGIN');
    try {
      await pool.query(sql);
      await pool.query('INSERT INTO _migrations(name) VALUES ($1)', [f]);
      await pool.query('COMMIT');
    } catch (err) {
      await pool.query('ROLLBACK');
      console.error(`x failed ${f}:`, err.message);
      process.exit(1);
    }
  }
  console.log('migrations complete');
  await pool.end();
}

run();
