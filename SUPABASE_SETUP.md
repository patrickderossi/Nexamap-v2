# Supabase Database Setup

Since the automatic migration failed due to permissions, please manually set up the database schema in your Supabase dashboard.

## 1. Create the Profiles Table

Go to your Supabase dashboard → SQL Editor and run this query:

```sql
-- Create profiles table to store additional user information
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT,
  email TEXT NOT NULL,
  role TEXT,
  company_name TEXT,
  company_size TEXT,
  years_experience TEXT,
  project_types TEXT,
  data_frequency TEXT,
  biggest_challenge TEXT,
  provide_feedback BOOLEAN DEFAULT false,
  hear_about_us TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create a policy that allows users to view and update their own profile
CREATE POLICY "Users can view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- Create a function to automatically create a profile when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create a trigger to call the function when a new user is created
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- Create a function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger to automatically update the updated_at column
CREATE TRIGGER on_profiles_updated
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE PROCEDURE public.handle_updated_at();
```

## 2. Configure Email Authentication (Optional)

In your Supabase dashboard:

1. Go to **Authentication** → **Settings**
2. Enable **Email confirmations** if you want users to verify their email
3. Configure **Email templates** as needed
4. Set up **SMTP settings** if you want custom email sending (otherwise Supabase handles it)

## 3. Test the Setup

After running the SQL:

1. Try signing up a new user in your app
2. Check the `auth.users` table to see if the user was created
3. Check the `public.profiles` table to see if the profile was automatically created
4. Try signing in with the new user

## 4. Environment Variables

Make sure these are set in your environment:

- `VITE_SUPABASE_URL`: Your Supabase project URL
- `VITE_SUPABASE_ANON_KEY`: Your Supabase anon/public key

## Troubleshooting

- If signup fails, check the browser console for errors
- If profiles aren't being created automatically, check the trigger function
- If RLS policies aren't working, verify the policies are correctly set up
- For email issues, check Supabase Auth logs in the dashboard
