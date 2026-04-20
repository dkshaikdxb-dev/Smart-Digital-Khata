#!/usr/bin/env node
require('dotenv').config();
const bcrypt = require('bcrypt');
const { pool } = require('../config/db');

async function seed() {
  const email = process.env.ADMIN_EMAIL || 'admin@example.com';
  const password = process.env.ADMIN_PASSWORD || 'admin1234';
  const existing = await pool.query('SELECT id FROM users WHERE email=$1', [email]);
  if (existing.rowCount) {
    console.log('Admin user already exists. Skipping.');
    await pool.end();
    return;
  }
  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    `INSERT INTO users (name, email, phone, password_hash, role)
     VALUES ('Super Admin', $1, '+919999999999', $2, 'admin')`,
    [email, hash]
  );
  console.log(`Seeded admin user: ${email} / ${password}`);
  await pool.end();
}
seed();
