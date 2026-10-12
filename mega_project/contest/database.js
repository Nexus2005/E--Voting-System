require('dotenv').config();
const { Pool } = require('pg');
const { createClient } = require('@supabase/supabase-js');

// 1. Supabase Client setup
const supabaseUrl = process.env.SUPABASE_URL || 'https://your-project.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'your-service-role-key';
const supabase = createClient(supabaseUrl, supabaseKey);

// 2. PostgreSQL Connection Pool setup (using Supabase IPv4 Pooler)
const pool = new Pool({
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || '',
  database: process.env.PG_DATABASE || 'postgres',
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

pool.on('error', (err, client) => {
  console.warn('PostgreSQL idle client notice (auto-reconnecting):', err.message);
});

pool.connect((err, client, release) => {
  if (err) {
    console.error('Error connecting to Supabase PostgreSQL database:', err.message);
  } else {
    console.log('Database (Supabase PostgreSQL) is connected successfully !');
    if (release) release();
  }
});

/**
 * Normalizes DB rows so they support both lowercase and capitalized keys
 * (e.g. row.dob and row.Dob, row.Account_address and row.account_address)
 */
function normalizeRow(row) {
  if (!row || typeof row !== 'object') return row;
  const result = { ...row };
  for (const [key, value] of Object.entries(row)) {
    // lowercase version
    result[key.toLowerCase()] = value;

    // Capitalized version (e.g., Dob, Email)
    const capitalized = key.charAt(0).toUpperCase() + key.slice(1);
    result[capitalized] = value;

    // Exact key mappings used in the app templates & routes
    if (key.toLowerCase() === 'is_registered') {
      result['Is_registered'] = value;
      result['is_registered'] = value;
    }
    if (key.toLowerCase() === 'account_address') {
      result['Account_address'] = value;
      result['account_address'] = value;
    }
    if (key.toLowerCase() === 'aadharno') {
      result['Aadharno'] = value;
      result['aadharno'] = value;
    }
  }
  return result;
}

/**
 * Compatibility wrapper mimicking MySQL's conn.query(sql, values, callback)
 * translating MySQL specific queries to PostgreSQL.
 */
function query(sql, values, callback) {
  // Normalize arguments
  let actualValues = values;
  let actualCallback = callback;
  if (typeof values === 'function') {
    actualCallback = values;
    actualValues = [];
  }
  if (!actualValues) {
    actualValues = [];
  } else if (!Array.isArray(actualValues) && typeof actualValues !== 'object') {
    actualValues = [actualValues];
  }

  let finalSql = sql.trim();
  let finalParams = [];

  // Check if query is MySQL's "INSERT INTO <table> SET ?"
  const insertSetMatch = finalSql.match(/INSERT\s+INTO\s+([a-zA-Z0-9_]+)\s+SET\s+\?/i);
  if (insertSetMatch && typeof actualValues === 'object' && !Array.isArray(actualValues)) {
    const tableName = insertSetMatch[1];
    const columns = [];
    finalParams = [];
    const placeholders = [];

    let paramIndex = 1;
    for (const [col, val] of Object.entries(actualValues)) {
      columns.push(`"${col.toLowerCase()}"`);
      placeholders.push(`$${paramIndex++}`);
      finalParams.push(val);
    }

    finalSql = `INSERT INTO ${tableName} (${columns.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`;
  } else {
    // Array of parameters: replace MySQL '?' with Postgres '$1', '$2', ...
    if (Array.isArray(actualValues)) {
      let paramIndex = 1;
      finalSql = finalSql.replace(/\?/g, () => `$${paramIndex++}`);
      finalParams = actualValues;
    } else {
      finalParams = [];
    }
  }

  pool.query(finalSql, finalParams, (err, res) => {
    if (err) {
      if (actualCallback) return actualCallback(err, null, null);
      throw err;
    }

    let results;
    if (res.command === 'SELECT') {
      results = res.rows.map(normalizeRow);
    } else if (res.command === 'INSERT') {
      results = {
        affectedRows: res.rowCount,
        rowCount: res.rowCount,
        rows: res.rows.map(normalizeRow),
        insertId: res.rows && res.rows[0] ? res.rows[0].id : null
      };
    } else {
      results = {
        affectedRows: res.rowCount,
        rowCount: res.rowCount,
        rows: res.rows ? res.rows.map(normalizeRow) : []
      };
    }

    if (actualCallback) {
      actualCallback(null, results, res.fields);
    }
  });
}

module.exports = {
  query,
  pool,
  supabase,
  connect: function(cb) {
    if (cb) cb(null);
  }
};