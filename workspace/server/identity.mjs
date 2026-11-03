import { createClient } from '@supabase/supabase-js';

// Verify every supplied token with Supabase; never treat decoded client claims
// or an unverified user identifier as an authenticated identity.
export function createIdentityVerifier({ url, publishableKey, client } = {}) {
  if (!client && (!url || !publishableKey)) throw new Error('Supabase identity is not configured');
  const auth = client ?? createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return async function verify(authorization) {
    const match = typeof authorization === 'string' && /^Bearer ([^\s]+)$/.exec(authorization);
    if (!match) throw new Error('Authentication required');
    let result;
    try { result = await auth.auth.getUser(match[1]); }
    catch { throw new Error('Identity verification unavailable'); }
    if (result.error || !result.data?.user?.id) throw new Error('Invalid session');
    return { userId: result.data.user.id };
  };
}
