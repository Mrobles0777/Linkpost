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

console.log('--- Supabase Connection Test ---');
console.log(`URL: ${supabaseUrl}`);

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testConnection() {
    try {
        console.log('Connecting to Supabase...');

        // Attempt a simple query to check connection
        // We'll try to get the server time or a simple health check if possible, 
        // but a query to a generic table (or even a non-existent one to see the error type) works.
        // auth.getSession() is often a good check that doesn't require a specific table.
        const { data, error } = await supabase.auth.getSession();

        if (error) {
            console.error('❌ Connection error:', error.message);
        } else {
            console.log('✅ Successfully connected to Supabase!');
            console.log('Session data retrieved successfully.');
        }
    } catch (err) {
        console.error('❌ Unexpected error during connection test:', err);
    }
}

testConnection();
