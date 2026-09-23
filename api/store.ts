import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import type { Store, StoreOp } from '../src/types';
import { applyOp } from '../src/data/storeReducer.ts';

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
      const { data: rows, error } = await supabase
        .from('movie_night_store')
        .select('version, history, enabled_services, now_watching')
        .order('id', { ascending: true })
        .limit(1);

      if (error) throw error;
      const data = rows?.[0];
      if (!data) throw new Error('No store data found');

      const store: Store = {
        version: data.version,
        history: data.history || [],
        enabledServices: data.enabled_services || [],
        nowWatching: data.now_watching || [],
      };

      return res.status(200).json(store);
    }

    if (req.method === 'POST') {
      if (req.headers['x-store-secret'] !== writeSecret) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const op: StoreOp = req.body;

      const { data: current, error: fetchError } = await supabase
        .from('movie_night_store')
        .select('id, version, history, enabled_services, now_watching')
        .order('id', { ascending: true })
        .limit(1)
        .single();

      if (fetchError) throw fetchError;
      if (!current) throw new Error('No store data found');

      const currentStore: Store = {
        version: current.version,
        history: current.history || [],
        enabledServices: current.enabled_services || [],
        nowWatching: current.now_watching || [],
      };

      const nextStore = applyOp(currentStore, op);

      const { data: updated, error: updateError } = await supabase
        .from('movie_night_store')
        .update({
          history: nextStore.history,
          enabled_services: nextStore.enabledServices,
          now_watching: nextStore.nowWatching,
        })
        .eq('id', current.id)
        .select('version, history, enabled_services, now_watching')
        .single();

      if (updateError) throw updateError;

      const resultStore: Store = {
        version: updated!.version,
        history: updated!.history || [],
        enabledServices: updated!.enabled_services || [],
        nowWatching: updated!.now_watching || [],
      };

      return res.status(200).json(resultStore);
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch {
    res.status(400).json({ error: 'Store operation failed' });
  }
}
