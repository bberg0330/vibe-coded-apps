import type { VercelRequest, VercelResponse } from '@vercel/node'
import { handleSession, sessionConfig } from './_lib/session.js'

/** Household passcode unlock; see api/_lib/session.ts. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  const result = await handleSession(req.method, req.headers, req.body, sessionConfig())
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Cache-Control', 'no-store')
  res.status(result.status).json(result.body)
}
