import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { requireSession, sessionConfig } from './_lib/session.js';
import type { Store, StoreOp, WatchEntry } from '../src/types';

/** Same rule as src/data/storeReducer.ts: date only the first undated entry for a film. */
function dateFirstUndated(history: WatchEntry[], tmdbId: number, watchedAt: string): WatchEntry[] {
  const i = history.findIndex((e) => e.movie.tmdbId === tmdbId && e.watchedAt === null);
  return i < 0 ? history : history.map((e, j) => (j === i ? { ...e, watchedAt } : e));
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase credentials');
}

const supabase = createClient(supabaseUrl, supabaseKey);

function applyOp(store: Store, op: StoreOp): Store {
  switch (op.type) {
    case 'logWatch': {
      // A "seen before" mark for a film already in history is a no-op (two devices at once).
      if (op.entry.watchedAt === null && store.history.some((e) => e.movie.tmdbId === op.entry.movie.tmdbId)) return store;
      // Watching a film also takes it off the watchlist, in the same write.
      return {
        ...store,
        history: [...store.history, op.entry],
        watchlist: store.watchlist.filter((e) => e.movie.tmdbId !== op.entry.movie.tmdbId),
      };
    }
    case 'undoLastWatch': {
      const idx = store.history.findLastIndex((e) => e.movie.tmdbId === op.tmdbId);
      if (idx < 0) return store;
      return {
        ...store,
        history: store.history.toSpliced(idx, 1),
      };
    }
    case 'deleteWatch': {
      const idx = store.history.findIndex(
        (e) => e.movie.tmdbId === op.tmdbId && e.watchedAt === op.watchedAt
      );
      if (idx < 0) return store;
      return {
        ...store,
        history: store.history.toSpliced(idx, 1),
      };
    }
    case 'setWatchDate': {
      return {
        ...store,
        history: dateFirstUndated(store.history, op.tmdbId, op.watchedAt),
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
    case 'cancelWatching': {
      return {
        ...store,
        nowWatching: store.nowWatching.filter(
          (e) => !(e.profileId === op.profileId && e.movie.tmdbId === op.tmdbId)
        ),
      };
    }
    case 'addToWatchlist': {
      // Idempotent: keep the first entry (and its "added by") on a repeat add.
      if (store.watchlist.some((e) => e.movie.tmdbId === op.entry.movie.tmdbId)) return store;
      return { ...store, watchlist: [...store.watchlist, op.entry] };
    }
    case 'removeFromWatchlist': {
      return {
        ...store,
        watchlist: store.watchlist.filter((e) => e.movie.tmdbId !== op.tmdbId),
      };
    }
  }
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  res.setHeader('Content-Type', 'application/json');

  // Every read and write needs an unlocked household session.
  const session = requireSession(req.headers, sessionConfig());
  if (!session.ok) return res.status(session.status).json(session.body);

  try {
    if (req.method === 'GET') {
      const { data: rows, error } = await supabase
        .from('movie_night_store')
        .select('version, history, enabled_services, now_watching, watchlist')
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
        watchlist: data.watchlist || [],
      };

      return res.status(200).json(store);
    }

    if (req.method === 'POST') {
      const op: StoreOp = req.body;

      const { data: current, error: fetchError } = await supabase
        .from('movie_night_store')
        .select('id, version, history, enabled_services, now_watching, watchlist')
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
        watchlist: current.watchlist || [],
      };

      const nextStore = applyOp(currentStore, op);

      const { data: updated, error: updateError } = await supabase
        .from('movie_night_store')
        .update({
          history: nextStore.history,
          enabled_services: nextStore.enabledServices,
          now_watching: nextStore.nowWatching,
          watchlist: nextStore.watchlist,
        })
        .eq('id', current.id)
        .select('version, history, enabled_services, now_watching, watchlist')
        .single();

      if (updateError) throw updateError;

      const resultStore: Store = {
        version: updated!.version,
        history: updated!.history || [],
        enabledServices: updated!.enabled_services || [],
        nowWatching: updated!.now_watching || [],
        watchlist: updated!.watchlist || [],
      };

      return res.status(200).json(resultStore);
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch {
    res.status(400).json({ error: 'Store operation failed' });
  }
}
