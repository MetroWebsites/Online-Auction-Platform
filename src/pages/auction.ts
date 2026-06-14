// Placeholder pages
import { Context } from 'hono'

export async function renderAuctionPage(c: Context) {
  return c.html('<h1>Auction Page</h1>')
}
