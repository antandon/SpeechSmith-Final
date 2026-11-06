// Daily usage caps, counted in the database (see the usage_counts migration),
// so the paid OpenAI/Azure calls behind these functions can't be run without limit.
// Signed-out visitors are counted per IP and all together; signed-in users per account.
// ponytail: the per-IP cap is loose because mobile networks share IPs; the
// all-signed-out cap is what really bounds the cost. Raise either if real users hit them.
export const LIMITS = {
  analyze: { user: 30, ip: 20, allSignedOut: 200 },
  tts: { user: 200, ip: 60, allSignedOut: 1000 },
} as const;

type Kind = keyof typeof LIMITS;

const MESSAGES: Record<Kind, { user: string; signedOut: string }> = {
  analyze: {
    user: `You've reached today's limit of ${LIMITS.analyze.user} analyses. Please come back tomorrow.`,
    signedOut: "You've reached today's limit of free analyses. Sign up for free to keep practising.",
  },
  tts: {
    user: "You've reached today's limit for playing generated speech. Please come back tomorrow.",
    signedOut: "You've reached today's limit for playing generated speech. Sign up for free to keep practising.",
  },
};

// The signed-in user's id, or null for a signed-out visitor (their token is just the public app key).
async function userId(req: Request, url: string, key: string): Promise<string | null> {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const r = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` } });
  return r.ok ? (await r.json())?.id ?? null : null;
}

async function take(url: string, key: string, counter: string, limit: number): Promise<boolean> {
  const r = await fetch(`${url}/rest/v1/rpc/take_usage`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_key: counter, p_limit: limit }),
  });
  if (!r.ok) throw new Error(`take_usage ${r.status}: ${await r.text()}`);
  return (await r.json()) === true;
}

// Counts this request; returns the message to send back with a 429 when over a cap, else null.
// Fails open (logs and allows) if the database can't be reached, so an outage doesn't stop the app.
export async function overLimit(req: Request, kind: Kind): Promise<string | null> {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return null; // local run without Supabase
  try {
    const limits = LIMITS[kind];
    const user = await userId(req, url, key);
    if (user) return (await take(url, key, `${kind}:user:${user}`, limits.user)) ? null : MESSAGES[kind].user;
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
    const ok = (await take(url, key, `${kind}:ip:${ip}`, limits.ip))
      && (await take(url, key, `${kind}:signed-out`, limits.allSignedOut));
    return ok ? null : MESSAGES[kind].signedOut;
  } catch (error) {
    console.error('⚠️ Usage limit check failed, allowing request:', error);
    return null;
  }
}
