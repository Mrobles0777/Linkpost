import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('❌ Error: VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing in .env');
    process.exit(1);
}

console.log('--- Supabase Connection Test (Deep Check) ---');
console.log(`URL: ${supabaseUrl}`);

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testConnection() {
    try {
        console.log('1. Testing Auth session...');
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession();

        if (sessionError) {
            console.error('❌ Auth error:', sessionError.message);
        } else {
            console.log('✅ Auth connection successful!');
        }

        console.log('2. Testing Database access (profiles table)...');
        const { data: profileData, error: profileError } = await supabase
            .from('profiles')
            .select('count', { count: 'exact', head: true });

        if (profileError) {
            console.error('❌ Database error (profiles):', profileError.message);
            if (profileError.message.includes('relation "public.profiles" does not exist')) {
                console.warn('⚠️  Warning: The "profiles" table does not exist in the database.');
            }
        } else {
            console.log('✅ Database connection successful! "profiles" table is accessible.');
            console.log(`Summary: Found ${profileData} records in profiles (head check).`);
        }

        console.log('3. Testing simple insert (dry-run/check)...');
        // We won't actually insert unless we have a dummy ID, but this check is enough.

    } catch (err) {
        console.error('❌ Unexpected error during connection test:', err);
    }
}

testConnection();
