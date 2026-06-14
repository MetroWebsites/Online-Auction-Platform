// BB Realty & Auctions - Bidder PWA JavaScript

const API_BASE = '/api'
let authToken = localStorage.getItem('bb_auth_token')
let currentUser = null

// API utility
const api = {
  async request(method, endpoint, data = null) {
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    }
    
    if (authToken) {
      options.headers['Authorization'] = `Bearer ${authToken}`
    }
    
    if (data) {
      options.body = JSON.stringify(data)
    }
    
    const response = await fetch(`${API_BASE}${endpoint}`, options)
    return response.json()
  },
  
  get(endpoint) {
    return this.request('GET', endpoint)
  },
  
  post(endpoint, data) {
    return this.request('POST', endpoint, data)
  },
  
  put(endpoint, data) {
    return this.request('PUT', endpoint, data)
  },
  
  delete(endpoint) {
    return this.request('DELETE', endpoint)
  }
}

// Auth functions
function isAuthenticated() {
  return !!authToken
}

async function login(email, password) {
  const result = await api.post('/auth/bidder/login', { email, password })
  
  if (result.success) {
    authToken = result.token
    localStorage.setItem('bb_auth_token', authToken)
    currentUser = result.bidder
    return true
  }
  
  return false
}

async function register(email, password, fullName, phone) {
  const result = await api.post('/auth/bidder/register', { email, password, fullName, phone })
  
  if (result.success) {
    authToken = result.token
    localStorage.setItem('bb_auth_token', authToken)
    currentUser = result.bidder
    return true
  }
  
  return false
}

function logout() {
  authToken = null
  currentUser = null
  localStorage.removeItem('bb_auth_token')
  showPage('login')
}

// Routing
function showPage(page) {
  const app = document.getElementById('app')
  
  if (!isAuthenticated() && page !== 'login' && page !== 'register') {
    page = 'login'
  }
  
  switch(page) {
    case 'login':
      renderLoginPage()
      break
    case 'register':
      renderRegisterPage()
      break
    case 'dashboard':
      renderDashboard()
      break
    case 'add-card':
      renderAddCardPage()
      break
    default:
      renderLoginPage()
  }
}

// Render login page
function renderLoginPage() {
  const app = document.getElementById('app')
  app.innerHTML = `
    <div class="min-h-screen flex items-center justify-center bg-black">
      <div class="max-w-md w-full mx-4">
        <div class="text-center mb-8">
          <img src="/static/bb-logo.png" alt="BB Realty & Auctions" class="h-24 mx-auto mb-4">
          <h2 class="text-3xl font-bold text-white">Bidder Login</h2>
        </div>
        
        <div class="bg-gray-900 p-8 rounded-lg shadow-xl">
          <div id="error-message" class="hidden bg-red-900 text-white p-3 rounded mb-4"></div>
          
          <form id="login-form">
            <div class="mb-4">
              <label class="block text-gray-300 mb-2">Email</label>
              <input type="email" id="email" required class="w-full px-4 py-2 rounded bg-gray-800 text-white border border-gray-700">
            </div>
            
            <div class="mb-6">
              <label class="block text-gray-300 mb-2">Password</label>
              <input type="password" id="password" required class="w-full px-4 py-2 rounded bg-gray-800 text-white border border-gray-700">
            </div>
            
            <button type="submit" class="w-full py-3 rounded font-semibold" style="background: linear-gradient(135deg, #DAA520 0%, #B8860B 100%);">
              <i class="fas fa-sign-in-alt mr-2"></i> Login
            </button>
          </form>
          
          <div class="mt-6 text-center">
            <p class="text-gray-400">Don't have an account?</p>
            <button onclick="showPage('register')" class="text-amber-500 hover:underline mt-2">
              Register Now
            </button>
          </div>
        </div>
      </div>
    </div>
  `
  
  document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const email = document.getElementById('email').value
    const password = document.getElementById('password').value
    
    const success = await login(email, password)
    
    if (success) {
      if (!currentUser.hasCardOnFile) {
        showPage('add-card')
      } else {
        showPage('dashboard')
      }
    } else {
      const errorDiv = document.getElementById('error-message')
      errorDiv.textContent = 'Invalid email or password'
      errorDiv.classList.remove('hidden')
    }
  })
}

// Render register page
function renderRegisterPage() {
  const app = document.getElementById('app')
  app.innerHTML = `
    <div class="min-h-screen flex items-center justify-center bg-black">
      <div class="max-w-md w-full mx-4">
        <div class="text-center mb-8">
          <img src="/static/bb-logo.png" alt="BB Realty & Auctions" class="h-24 mx-auto mb-4">
          <h2 class="text-3xl font-bold text-white">Create Account</h2>
        </div>
        
        <div class="bg-gray-900 p-8 rounded-lg shadow-xl">
          <div id="error-message" class="hidden bg-red-900 text-white p-3 rounded mb-4"></div>
          
          <form id="register-form">
            <div class="mb-4">
              <label class="block text-gray-300 mb-2">Full Name</label>
              <input type="text" id="fullName" required class="w-full px-4 py-2 rounded bg-gray-800 text-white border border-gray-700">
            </div>
            
            <div class="mb-4">
              <label class="block text-gray-300 mb-2">Email</label>
              <input type="email" id="email" required class="w-full px-4 py-2 rounded bg-gray-800 text-white border border-gray-700">
            </div>
            
            <div class="mb-4">
              <label class="block text-gray-300 mb-2">Phone (Optional)</label>
              <input type="tel" id="phone" class="w-full px-4 py-2 rounded bg-gray-800 text-white border border-gray-700">
            </div>
            
            <div class="mb-6">
              <label class="block text-gray-300 mb-2">Password (min 8 characters)</label>
              <input type="password" id="password" required minlength="8" class="w-full px-4 py-2 rounded bg-gray-800 text-white border border-gray-700">
            </div>
            
            <button type="submit" class="w-full py-3 rounded font-semibold" style="background: linear-gradient(135deg, #DAA520 0%, #B8860B 100%);">
              <i class="fas fa-user-plus mr-2"></i> Create Account
            </button>
          </form>
          
          <div class="mt-6 text-center">
            <p class="text-gray-400">Already have an account?</p>
            <button onclick="showPage('login')" class="text-amber-500 hover:underline mt-2">
              Login Here
            </button>
          </div>
        </div>
      </div>
    </div>
  `
  
  document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    const fullName = document.getElementById('fullName').value
    const email = document.getElementById('email').value
    const phone = document.getElementById('phone').value
    const password = document.getElementById('password').value
    
    const success = await register(email, password, fullName, phone)
    
    if (success) {
      showPage('add-card')
    } else {
      const errorDiv = document.getElementById('error-message')
      errorDiv.textContent = 'Registration failed. Email may already be in use.'
      errorDiv.classList.remove('hidden')
    }
  })
}

// Render add card page (credit card requirement)
function renderAddCardPage() {
  const app = document.getElementById('app')
  app.innerHTML = `
    <div class="min-h-screen flex items-center justify-center bg-black">
      <div class="max-w-2xl w-full mx-4">
        <div class="text-center mb-8">
          <i class="fas fa-credit-card text-6xl text-amber-500 mb-4"></i>
          <h2 class="text-3xl font-bold text-white mb-2">Add Payment Method</h2>
          <p class="text-gray-400">A credit card is required before you can place bids</p>
        </div>
        
        <div class="bg-gray-900 p-8 rounded-lg shadow-xl">
          <div class="bg-amber-900 border-l-4 border-amber-500 p-4 mb-6">
            <p class="text-amber-200">
              <i class="fas fa-shield-alt mr-2"></i>
              Your payment information is securely stored and encrypted. You won't be charged until you win an auction.
            </p>
          </div>
          
          <form id="card-form">
            <div class="mb-4">
              <label class="block text-gray-300 mb-2">Card Number</label>
              <input type="text" id="cardNumber" placeholder="1234 5678 9012 3456" required class="w-full px-4 py-2 rounded bg-gray-800 text-white border border-gray-700">
            </div>
            
            <div class="grid grid-cols-2 gap-4 mb-6">
              <div>
                <label class="block text-gray-300 mb-2">Expiry (MM/YY)</label>
                <input type="text" id="expiry" placeholder="12/25" required class="w-full px-4 py-2 rounded bg-gray-800 text-white border border-gray-700">
              </div>
              <div>
                <label class="block text-gray-300 mb-2">CVV</label>
                <input type="text" id="cvv" placeholder="123" required class="w-full px-4 py-2 rounded bg-gray-800 text-white border border-gray-700">
              </div>
            </div>
            
            <button type="submit" class="w-full py-3 rounded font-semibold" style="background: linear-gradient(135deg, #DAA520 0%, #B8860B 100%);">
              <i class="fas fa-lock mr-2"></i> Save Payment Method
            </button>
            
            <button type="button" onclick="logout()" class="w-full mt-3 py-3 rounded font-semibold bg-gray-700 text-white hover:bg-gray-600">
              Skip for Now (You won't be able to bid)
            </button>
          </form>
        </div>
      </div>
    </div>
  `
  
  document.getElementById('card-form').addEventListener('submit', async (e) => {
    e.preventDefault()
    // TODO: Implement Stripe/payment processor integration
    alert('Payment method added! (Demo mode)')
    showPage('dashboard')
  })
}

// Render dashboard
function renderDashboard() {
  const app = document.getElementById('app')
  app.innerHTML = `
    <div class="min-h-screen bg-gray-100">
      <header class="bg-black text-white py-4 shadow">
        <div class="max-w-7xl mx-auto px-4 flex items-center justify-between">
          <img src="/static/bb-logo.png" alt="BB Realty & Auctions" class="h-12">
          <button onclick="logout()" class="px-4 py-2 bg-red-600 rounded hover:bg-red-700">
            <i class="fas fa-sign-out-alt mr-2"></i> Logout
          </button>
        </div>
      </header>
      
      <div class="max-w-7xl mx-auto px-4 py-8">
        <h1 class="text-3xl font-bold mb-8">Welcome, ${currentUser?.fullName || 'Bidder'}!</h1>
        
        <div class="grid md:grid-cols-3 gap-6">
          <div class="bg-white p-6 rounded-lg shadow">
            <i class="fas fa-gavel text-3xl text-amber-500 mb-4"></i>
            <h3 class="text-xl font-bold mb-2">Active Auctions</h3>
            <p class="text-gray-600">Browse and bid on available items</p>
            <button class="mt-4 px-4 py-2 bg-amber-500 text-black rounded hover:bg-amber-600">
              View Auctions
            </button>
          </div>
          
          <div class="bg-white p-6 rounded-lg shadow">
            <i class="fas fa-heart text-3xl text-red-500 mb-4"></i>
            <h3 class="text-xl font-bold mb-2">Watchlist</h3>
            <p class="text-gray-600">Track items you're interested in</p>
            <button class="mt-4 px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-800">
              View Watchlist
            </button>
          </div>
          
          <div class="bg-white p-6 rounded-lg shadow">
            <i class="fas fa-file-invoice text-3xl text-green-500 mb-4"></i>
            <h3 class="text-xl font-bold mb-2">My Bids</h3>
            <p class="text-gray-600">View your bidding history</p>
            <button class="mt-4 px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-800">
              View Bids
            </button>
          </div>
        </div>
        
        ${!currentUser?.hasCardOnFile ? `
        <div class="mt-8 bg-yellow-100 border-l-4 border-yellow-500 p-4">
          <p class="text-yellow-800">
            <i class="fas fa-exclamation-triangle mr-2"></i>
            <strong>Action Required:</strong> Add a payment method to start bidding.
            <button onclick="showPage('add-card')" class="ml-4 px-4 py-1 bg-yellow-600 text-white rounded hover:bg-yellow-700">
              Add Card
            </button>
          </p>
        </div>
        ` : ''}
      </div>
    </div>
  `
}

// Initialize app
async function init() {
  if (isAuthenticated()) {
    // Verify token and get user info
    const result = await api.get('/auth/me')
    
    if (result.success) {
      currentUser = result.user
      if (!currentUser.hasCardOnFile) {
        showPage('add-card')
      } else {
        showPage('dashboard')
      }
    } else {
      logout()
    }
  } else {
    showPage('login')
  }
}

// Start app
init()
