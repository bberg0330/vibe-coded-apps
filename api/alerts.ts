import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authorized, respond } from './_lib/respond.js'
import { handleAlerts } from './_lib/alerts.js'
import { supabaseAlertStore } from './_lib/scoreCache.js'

/** Watchlist alerts for one profile (GET), and clearing them (POST). */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!authorized(req, res)) return
  respond(res, await handleAlerts(req.method, req.query, req.body, supabaseAlertStore()))
}
