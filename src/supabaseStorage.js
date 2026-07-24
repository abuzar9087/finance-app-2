import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    "Supabase URL or key is missing. Add VITE_SUPABASE_URL and " +
    "VITE_SUPABASE_ANON_KEY in your Vercel project settings."
  );
}

export const supabase = createClient(url, anonKey);

export const storage = {
  async get(key) {
    const { data, error } = await supabase
      .from("records")
      .select("data")
      .eq("id", key)
      .maybeSingle();

    if (error) throw new Error("Could not read " + key + ": " + error.message);
    if (!data) throw new Error("not found: " + key);
    return { key, value: data.data };
  },

  async set(key, value) {
    const { error } = await supabase
      .from("records")
      .upsert(
        { id: key, kind: key.split(":")[1] || key, data: value, updated_at: new Date().toISOString() },
        { onConflict: "id" }
      );

    if (error) throw new Error("Could not save " + key + ": " + error.message);
    return { key, value };
  },

  async list(prefix) {
    const { data, error } = await supabase
      .from("records")
      .select("id")
      .like("id", (prefix || "") + "%");

    if (error) throw new Error("Could not list records: " + error.message);
    return { keys: (data || []).map((r) => r.id) };
  },
};

export async function signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function currentSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}
