// Placeholder pages
import { Context } from 'hono'

export async function renderLotPage(c: Context) {
  return c.html('<h1>Lot Page</h1>')
}
