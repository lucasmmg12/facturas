import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './constants';

const supabaseUrl = SUPABASE_URL;
const supabaseAnonKey = SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);
