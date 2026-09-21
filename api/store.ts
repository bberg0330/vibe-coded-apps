import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import type { Store, StoreOp } from '../src/types';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const writeSecret = process.env.STORE_API_SECRET;

if (!supabaseUrl || !supabaseKey || !writeSecret) {
  throw new Error('Missing Supabase credentials or STORE_API_SECRET');
}

const supabase = createClient(supabaseUrl, supabaseKey);

function applyOp(store: Store, op: StoreOp): Store {
  switch (op.type) {
    case 'logWatch': {
      const isDuplicate = store.history.some(
        (e) =>
          e.tmdbId === op.entry.tmdbId &&
          e.watchedAt === op.entry.watchedAt &&
          e.rating === op.entry.rating
      );
      if (isDuplicate) return store;
      return {
        ...store,
        history: [...store.history, op.entry],
      };
    }
    case 'undoLastWatch': {
      const idx = store.history.findLastIndex((e) => e.tmdbId === op.tmdbId);
      if (idx < 0) return store;
      return {
        ...store,
        history: store.history.toSpliced(idx, 1),
      };
    }
    case 'setService': {
      const services = [...store.enabledServices];
      const idx = services.indexOf(op.key);
      if (op.enabled && idx < 0) services.push(op.key);
      if (!op.enabled && idx >= 0) services.splice(idx, 1);
      return { ...store, enabledServices: services };
    }
    case 'replaceHistory': {
      return { ...store, history: op.entries };
    }
    case 'seed': {
      return {
        ...store,
        history: op.history,
        enabledServices: op.enabledServices,
      };
    }
  }
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  res.setHeader('Content-Type', 'application/json');

  try {
    if (req.method === 'GET') {
      const { data: rows, error } = await supabase
        .from('movie_night_store')
        .select('version, history, enabled_services')
        .order('id', { ascending: true })
        .limit(1);

      if (error) throw error;
      const data = rows?.[0];
      if (!data) throw new Error('No store data found');

      const store: Store = {
        version: data.version,
        history: data.history || [],
        enabledServices: data.enabled_services || [],
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
        .select('id, version, history, enabled_services')
        .order('id', { ascending: true })
        .limit(1)
        .single();

      if (fetchError) throw fetchError;
      if (!current) throw new Error('No store data found');

      const currentStore: Store = {
        version: current.version,
        history: current.history || [],
        enabledServices: current.enabled_services || [],
      };

      const nextStore = applyOp(currentStore, op);

      const { data: updated, error: updateError } = await supabase
        .from('movie_night_store')
        .update({
          history: nextStore.history,
          enabled_services: nextStore.enabledServices,
        })
        .eq('id', current.id)
        .select('version, history, enabled_services')
        .single();

      if (updateError) throw updateError;

      const resultStore: Store = {
        version: updated!.version,
        history: updated!.history || [],
        enabledServices: updated!.enabled_services || [],
      };

      return res.status(200).json(resultStore);
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch {
    res.status(400).json({ error: 'Store operation failed' });
  }
}
