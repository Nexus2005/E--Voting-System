require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || 'https://your-project.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || 'your-service-role-key';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testSupabase() {
  try {
    console.log('Testing Supabase REST API connection on aadhar_info...');
    const { data, error } = await supabase.from('aadhar_info').select('*');
    if (error) {
      console.error('Supabase error:', error);
    } else {
      console.log('Successfully fetched records via Supabase API:', data);
    }
  } catch (e) {
    console.error('Error:', e);
  }
}

testSupabase();
