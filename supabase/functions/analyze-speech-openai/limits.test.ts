// deno test supabase/functions/analyze-speech-openai/limits.test.ts
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { overLimit } from "./limits.ts";

// Fake Supabase: signed in when the token is "user-token"; counters capped per the limit sent.
function fakeSupabase(failDb = false) {
  const counts: Record<string, number> = {};
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/auth/v1/user')) {
      const auth = new Headers(init?.headers).get('Authorization');
      return auth === 'Bearer user-token' ? Response.json({ id: 'u1' }) : new Response('{}', { status: 401 });
    }
    if (failDb) return new Response('boom', { status: 500 });
    const { p_key, p_limit } = JSON.parse(String(init?.body));
    if ((counts[p_key] ?? 0) >= p_limit) return Response.json(null);
    counts[p_key] = (counts[p_key] ?? 0) + 1;
    return Response.json(true);
  }) as typeof fetch;
  return counts;
}

const req = (token: string, ip = '1.2.3.4') =>
  new Request('http://x', { headers: { authorization: `Bearer ${token}`, 'x-forwarded-for': `${ip}, 10.0.0.1` } });

Deno.test('usage limits', async () => {
  const realFetch = globalThis.fetch;
  Deno.env.set('SUPABASE_URL', 'http://db');
  Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'service');
  try {
    // Signed-in: 30 analyses a day, then refused.
    fakeSupabase();
    for (let i = 0; i < 30; i++) assertEquals(await overLimit(req('user-token'), 'analyze'), null);
    assertEquals((await overLimit(req('user-token'), 'analyze'))?.includes('come back tomorrow'), true);

    // Signed-out: 20 per IP, but another IP still gets in; counted per IP and in total.
    const counts = fakeSupabase();
    for (let i = 0; i < 20; i++) assertEquals(await overLimit(req('anon-key'), 'analyze'), null);
    assertEquals((await overLimit(req('anon-key'), 'analyze'))?.includes('Sign up'), true);
    assertEquals(await overLimit(req('anon-key', '5.6.7.8'), 'analyze'), null);
    assertEquals(counts['analyze:ip:1.2.3.4'], 20);
    assertEquals(counts['analyze:signed-out'], 21);

    // All signed-out visitors together: 200 a day, whatever the IP.
    fakeSupabase();
    for (let i = 0; i < 200; i++) assertEquals(await overLimit(req('anon-key', `ip${i}`), 'analyze'), null);
    assertEquals((await overLimit(req('anon-key', 'fresh-ip'), 'analyze'))?.includes('Sign up'), true);

    // Database down: allow rather than block real users.
    fakeSupabase(true);
    assertEquals(await overLimit(req('anon-key'), 'analyze'), null);

    // Run locally without Supabase: no limits.
    Deno.env.delete('SUPABASE_URL');
    assertEquals(await overLimit(req('anon-key'), 'analyze'), null);
  } finally {
    globalThis.fetch = realFetch;
  }
});
