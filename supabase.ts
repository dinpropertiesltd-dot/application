
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://guboreqbnparrhhcrqbp.supabase.co';
// Using the provided anon public key (JWT)
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd1Ym9yZXFibnBhcnJoaGNycWJwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY5OTUzMDEsImV4cCI6MjA4MjU3MTMwMX0.Ppo_g_n8pp0r9jsUSp9xBaRRn0XeyTDvUNkM6MNnHxM';

export const supabase = (supabaseUrl && supabaseAnonKey) 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null;

export const isCloudEnabled = !!supabase;
