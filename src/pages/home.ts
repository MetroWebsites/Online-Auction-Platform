// Home page rendering
import { Context } from 'hono'

export async function renderHomePage(c: Context) {
  return c.html(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>BB Realty & Auctions - Premier Real Estate & Asset Auctions</title>
    <meta name="description" content="BB Realty & Auctions offers premier online real estate and asset auctions. Register to bid on exclusive properties and assets.">
    
    <!-- Open Graph -->
    <meta property="og:title" content="BB Realty & Auctions">
    <meta property="og:description" content="Premier Real Estate & Asset Auctions">
    <meta property="og:image" content="/static/bb-logo.png">
    <meta property="og:type" content="website">
    
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    <style>
        .bb-gold { color: #DAA520; }
        .bb-gold-bg { background-color: #DAA520; }
        .bb-btn-gold {
            background: linear-gradient(135deg, #DAA520 0%, #B8860B 100%);
            transition: all 0.3s ease;
        }
        .bb-btn-gold:hover {
            transform: translateY(-2px);
            box-shadow: 0 10px 20px rgba(218, 165, 32, 0.3);
        }
    </style>
</head>
<body class="bg-black text-white">
    <!-- Header -->
    <header class="bb-gold-bg text-black py-4 shadow-lg">
        <div class="max-w-7xl mx-auto px-4 flex items-center justify-between">
            <div class="flex items-center space-x-4">
                <img src="/static/bb-logo.png" alt="BB Realty & Auctions" class="h-16">
                <div>
                    <h1 class="text-2xl font-bold">BB Realty & Auctions</h1>
                    <p class="text-sm">Premier Real Estate & Asset Auctions</p>
                </div>
            </div>
            <nav class="hidden md:flex space-x-6">
                <a href="/" class="hover:opacity-80">Home</a>
                <a href="/auctions" class="hover:opacity-80">Auctions</a>
                <a href="/bidder/login" class="hover:opacity-80">Login</a>
                <a href="/bidder/register" class="bb-btn-gold px-6 py-2 rounded-lg text-black font-semibold">Register to Bid</a>
            </nav>
        </div>
    </header>

    <!-- Hero Section -->
    <section class="relative h-screen flex items-center justify-center bg-gradient-to-br from-black via-gray-900 to-black">
        <div class="absolute inset-0 bg-cover bg-center opacity-20" style="background-image: url('https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=1920')"></div>
        <div class="relative z-10 text-center max-w-4xl mx-auto px-4">
            <h2 class="text-5xl md:text-7xl font-bold mb-6">
                Discover Premium <span class="bb-gold">Real Estate</span>
            </h2>
            <p class="text-xl md:text-2xl mb-8 text-gray-300">
                Exclusive online auctions for discerning buyers
            </p>
            <div class="flex flex-col md:flex-row gap-4 justify-center">
                <a href="/auctions" class="bb-btn-gold px-8 py-4 rounded-lg text-black font-semibold text-lg">
                    <i class="fas fa-gavel mr-2"></i> View Active Auctions
                </a>
                <a href="/bidder/register" class="border-2 border-amber-500 px-8 py-4 rounded-lg text-amber-500 font-semibold text-lg hover:bg-amber-500 hover:text-black transition">
                    <i class="fas fa-user-plus mr-2"></i> Register to Bid
                </a>
            </div>
        </div>
    </section>

    <!-- Features -->
    <section class="py-20 bg-gray-900">
        <div class="max-w-7xl mx-auto px-4">
            <h3 class="text-4xl font-bold text-center mb-12">Why Choose <span class="bb-gold">BB Realty & Auctions</span>?</h3>
            <div class="grid md:grid-cols-3 gap-8">
                <div class="bg-black p-8 rounded-lg border border-amber-500">
                    <i class="fas fa-shield-alt text-5xl bb-gold mb-4"></i>
                    <h4 class="text-2xl font-bold mb-4">Secure Bidding</h4>
                    <p class="text-gray-400">Credit card verification required for all bidders. Safe and secure platform.</p>
                </div>
                <div class="bg-black p-8 rounded-lg border border-amber-500">
                    <i class="fas fa-bell text-5xl bb-gold mb-4"></i>
                    <h4 class="text-2xl font-bold mb-4">Real-Time Notifications</h4>
                    <p class="text-gray-400">Get instant alerts when outbid. Never miss an opportunity.</p>
                </div>
                <div class="bg-black p-8 rounded-lg border border-amber-500">
                    <i class="fas fa-mobile-alt text-5xl bb-gold mb-4"></i>
                    <h4 class="text-2xl font-bold mb-4">Mobile-First</h4>
                    <p class="text-gray-400">Bid from anywhere, anytime on any device.</p>
                </div>
            </div>
        </div>
    </section>

    <!-- Footer -->
    <footer class="bb-gold-bg text-black py-8">
        <div class="max-w-7xl mx-auto px-4 text-center">
            <p>&copy; 2024 BB Realty & Auctions. All rights reserved.</p>
            <div class="mt-4 space-x-4">
                <a href="/terms" class="hover:opacity-80">Terms</a>
                <a href="/privacy" class="hover:opacity-80">Privacy</a>
                <a href="/contact" class="hover:opacity-80">Contact</a>
            </div>
        </div>
    </footer>
</body>
</html>
  `)
}
