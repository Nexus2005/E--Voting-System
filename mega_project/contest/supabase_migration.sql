-- Supabase PostgreSQL Schema Migration for E-Voting Project
-- Run this in the Supabase SQL Editor if you ever need to reset or recreate the schema.

-- 1. Web Portal User Registration
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

-- 2. Mock Aadhaar Database (used for age verification & identity lookup)
CREATE TABLE IF NOT EXISTS aadhar_info (
  aadharno VARCHAR(50) PRIMARY KEY,
  dob VARCHAR(50),
  email VARCHAR(100),
  is_registered VARCHAR(10) DEFAULT 'NO',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Whitelisted Voter Blockchain Addresses
CREATE TABLE IF NOT EXISTS registered_users (
  id SERIAL PRIMARY KEY,
  account_address VARCHAR(100),
  is_registered VARCHAR(20) DEFAULT 'Yes',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Initial Mock Aadhaar Records (Eligible voters with age >= 18)
INSERT INTO aadhar_info (aadharno, dob, email, is_registered)
VALUES 
  ('123412341234', '1998-05-15', 'voter1@example.com', 'NO'),
  ('987698769876', '2000-01-01', 'voter2@example.com', 'NO'),
  ('111122223333', '1995-10-20', 'election.blockchain@gmail.com', 'NO')
ON CONFLICT (aadharno) DO NOTHING;
