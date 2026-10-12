require('dotenv').config();
const { Client } = require('pg');

const config = {
  host: process.env.PG_HOST || 'localhost',
  port: parseInt(process.env.PG_PORT || '5432', 10),
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || '',
  database: process.env.PG_DATABASE || 'postgres',
  ssl: { rejectUnauthorized: false }
};

async function runMigration() {
  const client = new Client(config);
  try {
    console.log('Connecting to Supabase PostgreSQL at aws-0-ap-southeast-2.pooler.supabase.com:5432...');
    await client.connect();
    console.log('Connected successfully!');

    console.log('Running migrations...');

    // 1. registration table
    await client.query(`
      CREATE TABLE IF NOT EXISTS registration (
        id SERIAL PRIMARY KEY,
        first_name VARCHAR(100),
        last_name VARCHAR(100),
        email_address VARCHAR(100) UNIQUE,
        gender VARCHAR(20),
        password VARCHAR(100),
        confirm_password VARCHAR(100),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Table "registration" ready.');

    // 2. aadhar_info table
    await client.query(`
      CREATE TABLE IF NOT EXISTS aadhar_info (
        aadharno VARCHAR(50) PRIMARY KEY,
        dob VARCHAR(50),
        email VARCHAR(100),
        is_registered VARCHAR(10) DEFAULT 'NO',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Table "aadhar_info" ready.');

    // 3. registered_users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS registered_users (
        id SERIAL PRIMARY KEY,
        account_address VARCHAR(100),
        is_registered VARCHAR(20) DEFAULT 'Yes',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);
    console.log('Table "registered_users" ready.');

    // Insert dummy sample Aadhaar records
    await client.query(`
      INSERT INTO aadhar_info (aadharno, dob, email, is_registered)
      VALUES 
        ('123412341234', '1998-05-15', 'voter1@example.com', 'NO'),
        ('987698769876', '2000-01-01', 'voter2@example.com', 'NO'),
        ('111122223333', '1995-10-20', 'election.blockchain@gmail.com', 'NO')
      ON CONFLICT (aadharno) DO NOTHING;
    `);
    console.log('Sample Aadhaar records inserted.');

    // Verify tables
    const regCheck = await client.query('SELECT count(*) FROM registration');
    const aadharCheck = await client.query('SELECT count(*) FROM aadhar_info');
    const usersCheck = await client.query('SELECT count(*) FROM registered_users');

    console.log('\nMigration complete! Verification:');
    console.log('- registration count:', regCheck.rows[0].count);
    console.log('- aadhar_info count:', aadharCheck.rows[0].count);
    console.log('- registered_users count:', usersCheck.rows[0].count);

    await client.end();
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}

runMigration();
