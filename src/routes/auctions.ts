// Auctions routes - placeholder
import { Hono } from 'hono'

type Bindings = { DB: D1Database; R2: R2Bucket }
const auctions = new Hono<{ Bindings: Bindings }>()

// Get all auctions
auctions.get('/', async (c) => {
  const db = c.env.DB
  const result = await db.prepare('SELECT * FROM auctions ORDER BY start_time DESC').all()
  return c.json({ success: true, data: result.results })
})

// Get auction by ID
auctions.get('/:id', async (c) => {
  const db = c.env.DB
  const id = c.req.param('id')
  const auction = await db.prepare('SELECT * FROM auctions WHERE id = ? OR slug = ?').bind(id, id).first()
  
  if (!auction) {
    return c.json({ success: false, error: 'Auction not found' }, 404)
  }
  
  return c.json({ success: true, data: auction })
})

export default auctions
