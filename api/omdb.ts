import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleOmdb } from './_lib/lookups.js'
import { authorized, respond, serverKeys } from './_lib/respond.js'

/** OMDb proxy: looks a film up with the server-side key and returns parsed scores. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  if (!authorized(req, res)) return
  respond(res, await handleOmdb(req.query, serverKeys()))
}
