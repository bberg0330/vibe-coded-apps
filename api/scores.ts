import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { requireSession, sessionConfig } from './_lib/session.js';

type ScoreData = {
  critic?: number | null;
  audience?: number | null;
};

type ScoreMap = Record<string, ScoreData>;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase credentials');
}

const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  res.setHeader('Content-Type', 'application/json');

  // Every read and write needs an unlocked household session.
  const session = requireSession(req.headers, sessionConfig());
  if (!session.ok) return res.status(session.status).json(session.body);

  // Read-only: scores are written server-side by /api/omdb, /api/recommendations
  // and the nightly sync, so a browser can never cache a failed lookup.
  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('movie_night_scores')
        .select('tmdb_id, critic, audience')
        // Pending rows have no answer yet; leaving them out keeps the browser
        // from mistaking them for "no rating".
        .not('fetched_at', 'is', null);

      if (error) throw error;

      const scores: ScoreMap = {};
      for (const row of data ?? []) {
        scores[String(row.tmdb_id)] = { critic: row.critic, audience: row.audience };
      }

      return res.status(200).json(scores);
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch {
    res.status(400).json({ error: 'Score cache operation failed' });
  }
}
