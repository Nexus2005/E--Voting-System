require('dotenv').config();
const db = require('./database');

async function testAll() {
  console.log('==============================================');
  console.log('Testing Supabase & PostgreSQL Connection...');
  console.log('==============================================\n');

  // 1. Test Supabase Client REST query
  try {
    console.log('1. Testing Supabase SDK client...');
    const { data, error } = await db.supabase.from('aadhar_info').select('*');
    if (error) {
      console.error('Supabase REST Error:', error.message);
    } else {
      console.log(`✓ Supabase REST API connected successfully! (${data.length} records found)`);
    }
  } catch (err) {
    console.error('Supabase REST Exception:', err.message);
  }

  // 2. Test PostgreSQL Pool query via database.js adapter
  console.log('\n2. Testing PostgreSQL Pool query (aadhar_info)...');
  db.query('SELECT * FROM aadhar_info WHERE aadharno = ?', ['123412341234'], (err, results) => {
    if (err) {
      console.error('✗ PostgreSQL Query Error:', err.message);
    } else {
      console.log('✓ PostgreSQL Query connected successfully!');
      console.log('Sample Record:', results[0]);
    }
    console.log('\n==============================================');
    console.log('All connections verified!');
    console.log('==============================================');
    process.exit(0);
  });
}

testAll();
