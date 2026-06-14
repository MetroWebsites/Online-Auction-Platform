// Bidder app page
import { Context } from 'hono'

export async function renderBidderApp(c: Context) {
  return c.html(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Bidder Portal - BB Realty & Auctions</title>
    <link rel="manifest" href="/manifest.json">
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    <style>
        .bb-gold { color: #DAA520; }
        .bb-gold-bg { background-color: #DAA520; }
    </style>
</head>
<body class="bg-gray-100">
    <div id="app">
        <p class="text-center py-20">Loading...</p>
    </div>
    <script src="/static/js/bidder.js"></script>
</body>
</html>
  `)
}
