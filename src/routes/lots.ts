// Lots routes - placeholder
import { Hono } from 'hono'

type Bindings = { DB: D1Database; R2: R2Bucket }
const lots = new Hono<{ Bindings: Bindings }>()

// Get lots by auction
lots.get('/auction/:auctionId', async (c) => {
  const db = c.env.DB
  const auctionId = c.req.param('auctionId')
  const result = await db.prepare('SELECT * FROM lots WHERE auction_id = ? ORDER BY lot_number').bind(auctionId).all()
  return c.json({ success: true, data: result.results })
})

export default lots
