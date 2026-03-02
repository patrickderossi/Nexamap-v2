import { createClient } from "@supabase/supabase-js";

// Get Supabase configuration from environment variables
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Create a mock client if environment variables are missing (for build time)
let supabase: any;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("Missing Supabase environment variables. Using mock client.");

  // Create a mock Supabase client for build time
  supabase = {
    auth: {
      getSession: () =>
        Promise.resolve({ data: { session: null }, error: null }),
      getUser: () => Promise.resolve({ data: { user: null }, error: null }),
      signUp: () =>
        Promise.resolve({
          data: { user: null },
          error: new Error("Supabase not configured"),
        }),
      signInWithPassword: () =>
        Promise.resolve({
          data: { user: null },
          error: new Error("Supabase not configured"),
        }),
      signOut: () => Promise.resolve({ error: null }),
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe: () => {} } },
      }),
      resetPasswordForEmail: () =>
        Promise.resolve({ error: new Error("Supabase not configured") }),
      updateUser: () =>
        Promise.resolve({ error: new Error("Supabase not configured") }),
      setSession: () =>
        Promise.resolve({ data: { session: null }, error: null }),
      resend: () =>
        Promise.resolve({ error: new Error("Supabase not configured") }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () =>
            Promise.resolve({
              data: null,
              error: new Error("Supabase not configured"),
            }),
        }),
      }),
      update: () => ({
        eq: () => ({
          select: () => ({
            single: () =>
              Promise.resolve({
                data: null,
                error: new Error("Supabase not configured"),
              }),
          }),
        }),
      }),
      insert: () =>
        Promise.resolve({
          data: null,
          error: new Error("Supabase not configured"),
        }),
    }),
  };
} else {
  // Create real Supabase client
  supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: true,
    },
  });
}

export { supabase };

// Database types (will be generated/updated as we build the schema)
export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          email: string;
          role: string | null;
          company_name: string | null;
          company_size: string | null;
          years_experience: string | null;
          project_types: string | null;
          data_frequency: string | null;
          biggest_challenge: string | null;
          provide_feedback: boolean;
          hear_about_us: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          email: string;
          role?: string | null;
          company_name?: string | null;
          company_size?: string | null;
          years_experience?: string | null;
          project_types?: string | null;
          data_frequency?: string | null;
          biggest_challenge?: string | null;
          provide_feedback?: boolean;
          hear_about_us?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          full_name?: string | null;
          email?: string;
          role?: string | null;
          company_name?: string | null;
          company_size?: string | null;
          years_experience?: string | null;
          project_types?: string | null;
          data_frequency?: string | null;
          biggest_challenge?: string | null;
          provide_feedback?: boolean;
          hear_about_us?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
  };
}
