import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Next.js patches the global fetch with its own caching layer; force every
// Supabase request to bypass it so reports/lists never show stale data
// after a delete/update elsewhere in the app.
export const supabase = createClient(url, anonKey, {
  global: {
    fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }),
  },
});
