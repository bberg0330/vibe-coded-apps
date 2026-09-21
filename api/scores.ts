import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

type ScoreData = {
  critic?: number | null;
  audience?: number | null;
};

type ScoreMap = Record<string, ScoreData>;

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const writeSecret = process.env.STORE_API_SECRET;

if (!supabaseUrl || !supabaseKey || !writeSecret) {
  throw new Error('Missing Supabase credentials or STORE_API_SECRET');
}

const supabase = createClient(supabaseUrl, supabaseKey);

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  res.setHeader('Content-Type', 'application/json');

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('movie_night_scores')
        .select('tmdb_id, critic, audience');

      if (error) throw error;

      const scores: ScoreMap = {};
      for (const row of data ?? []) {
        scores[String(row.tmdb_id)] = { critic: row.critic, audience: row.audience };
      }

      return res.status(200).json(scores);
    }

    if (req.method === 'POST') {
      if (req.headers['x-store-secret'] !== writeSecret) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const patch: ScoreMap = req.body;

      const rows = Object.entries(patch).map(([tmdbId, score]) => ({
        tmdb_id: Number(tmdbId),
        critic: score.critic ?? null,
        audience: score.audience ?? null,
      }));

      if (rows.length > 0) {
        const { error } = await supabase
          .from('movie_night_scores')
          .upsert(rows, { onConflict: 'tmdb_id' });

        if (error) throw error;
      }

      return res.status(200).json({});
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch {
    res.status(400).json({ error: 'Score cache operation failed' });
  }
}
