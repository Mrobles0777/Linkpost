const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
require('dotenv').config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
    let log = '';
    log += 'Supabase URL: ' + supabaseUrl + '\n';

    try {
        const { data: session, error: sErr } = await supabase.auth.getSession();
        log += 'Auth Session: ' + (sErr ? 'FAIL: ' + sErr.message : 'OK') + '\n';

        const { data: prof, error: pErr } = await supabase.from('profiles').select('id').limit(1);
        log += 'Profiles Table: ' + (pErr ? 'FAIL: ' + pErr.message : 'OK') + '\n';

    } catch (e) {
        log += 'Unexpected Error: ' + e.message + '\n';
    }

    fs.writeFileSync('result.txt', log, 'utf8');
}

run();
