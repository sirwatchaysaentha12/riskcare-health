import { createBrowserClient } from '@supabase/ssr';
import { getSupabaseConfig } from './env';

let browserClient: ReturnType<typeof createBrowserClient> | undefined;

export function createClient() {
  if (!browserClient) {
    const { url, anonKey } = getSupabaseConfig();
    browserClient = createBrowserClient(
      url,
      anonKey
    );
  }

  return browserClient;
}
