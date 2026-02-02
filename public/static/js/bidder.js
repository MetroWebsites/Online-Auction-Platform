/**
 * Bidder App - Main JavaScript
 * Mobile-first public bidding interface
 */

// Global state
const state = {
  user: null,
  token: localStorage.getItem('token'),
  currentAuction: null,
  currentLot: null,
  watchlist: new Set(),
  sseConnections: new Map(),
  notifications: []
};

// API utilities
const api = {
  baseUrl: '/api',
  
  async request(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };
    
    if (state.token) {
      headers.Authorization = `Bearer ${state.token}`;
    }
    
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      ...options,
      headers
    });
    
    if (response.status === 401) {
      logout();
      throw new Error('Unauthorized');
    }
    
    const data = await response.json();
    
    if (!data.success) {
      throw new Error(data.error || 'Request failed');
    }
    
    return data;
  },
  
  get(endpoint) {
    return this.request(endpoint);
  },
  
  post(endpoint, body) {
    return this.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(body)
    });
  },
  
  put(endpoint, body) {
    return this.request(endpoint, {
      method: 'PUT',
      body: JSON.stringify(body)
    });
  },
  
  delete(endpoint) {
    return this.request(endpoint, { method: 'DELETE' });
  }
};

// Authentication
function isAuthenticated() {
  return !!state.token;
}

function requireAuth() {
  if (!isAuthenticated()) {
    showPage('login');
    return false;
  }
  return true;
}

function logout() {
  state.token = null;
  state.user = null;
  localStorage.removeItem('token');
  closeAllSSE();
  showPage('login');
}

async function login(email, password) {
  try {
    const data = await api.post('/auth/login', { email, password });
    state.token = data.token;
    state.user = data.user;
    localStorage.setItem('token', data.token);
    await loadUserProfile();
    showPage('auctions');
    showSuccess('Login successful!');
  } catch (error) {
    showError(error.message);
  }
}

async function register(email, password, name, phone) {
  try {
    await api.post('/auth/register', { email, password, name, phone });
    showSuccess('Registration successful! Please check your email to verify your account.');
    showPage('login');
  } catch (error) {
    showError(error.message);
  }
}

async function loadUserProfile() {
  try {
    const data = await api.get('/auth/profile');
    state.user = data.data;
    updateUserDisplay();
  } catch (error) {
    console.error('Failed to load profile:', error);
  }
}

// Navigation
function showPage(pageId) {
  document.querySelectorAll('.page').forEach(page => {
    page.classList.add('hidden');
  });
  
  const page = document.getElementById(`${pageId}-page`);
  if (page) {
    page.classList.remove('hidden');
  }
  
  // Update nav
  document.querySelectorAll('.nav-link').forEach(link => {
    link.classList.remove('active');
  });
  
  const navLink = document.querySelector(`[data-page="${pageId}"]`);
  if (navLink) {
    navLink.classList.add('active');
  }
  
  // Load page data
  loadPageData(pageId);
}

async function loadPageData(pageId) {
  switch (pageId) {
    case 'auctions':
      await loadAuctions();
      break;
    case 'watchlist':
      await loadWatchlist();
      break;
    case 'my-bids':
      await loadMyBids();
      break;
    case 'my-wins':
      await loadMyWins();
      break;
    case 'invoices':
      await loadInvoices();
      break;
    case 'profile':
      await loadProfile();
      break;
  }
}

// Auctions
async function loadAuctions() {
  try {
    showLoading('auctions-grid');
    const data = await api.get('/auctions?status=active');
    renderAuctions(data.data);
  } catch (error) {
    showError('Failed to load auctions');
  }
}

function renderAuctions(auctions) {
  const grid = document.getElementById('auctions-grid');
  
  if (!auctions || auctions.length === 0) {
    grid.innerHTML = '<div class="col-span-full text-center py-12 text-gray-500">No active auctions found</div>';
    return;
  }
  
  grid.innerHTML = auctions.map(auction => `
    <div class="bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow cursor-pointer" 
         onclick="viewAuction(${auction.id})">
      <div class="p-6">
        <h3 class="text-xl font-semibold text-gray-900 mb-2">${escapeHtml(auction.title)}</h3>
        <p class="text-gray-600 mb-4 line-clamp-2">${escapeHtml(auction.description || '')}</p>
        
        <div class="space-y-2 text-sm">
          <div class="flex items-center text-gray-700">
            <i class="fas fa-calendar-alt w-5"></i>
            <span>Starts: ${formatDateTime(auction.start_date)}</span>
          </div>
          <div class="flex items-center text-gray-700">
            <i class="fas fa-calendar-times w-5"></i>
            <span>Ends: ${formatDateTime(auction.end_date)}</span>
          </div>
          ${auction.shipping_available ? `
            <div class="flex items-center text-green-600">
              <i class="fas fa-shipping-fast w-5"></i>
              <span>Shipping Available</span>
            </div>
          ` : ''}
        </div>
        
        <div class="mt-4 pt-4 border-t border-gray-200">
          <button class="w-full bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors">
            View Lots
          </button>
        </div>
      </div>
    </div>
  `).join('');
}

async function viewAuction(auctionId) {
  try {
    const data = await api.get(`/auctions/${auctionId}`);
    state.currentAuction = data.data;
    await loadAuctionLots(auctionId);
    showPage('auction-lots');
  } catch (error) {
    showError('Failed to load auction');
  }
}

async function loadAuctionLots(auctionId) {
  try {
    showLoading('lots-grid');
    const data = await api.get(`/lots?auction_id=${auctionId}&status=active`);
    renderLots(data.data);
  } catch (error) {
    showError('Failed to load lots');
  }
}

function renderLots(lots) {
  const grid = document.getElementById('lots-grid');
  
  if (!lots || lots.length === 0) {
    grid.innerHTML = '<div class="col-span-full text-center py-12 text-gray-500">No lots available</div>';
    return;
  }
  
  grid.innerHTML = lots.map(lot => `
    <div class="bg-white rounded-lg shadow-sm hover:shadow-md transition-shadow cursor-pointer" 
         onclick="viewLot(${lot.id})">
      <div class="aspect-w-16 aspect-h-9 bg-gray-200">
        <img src="${lot.image_urls?.[0] || '/static/img/placeholder.jpg'}" 
             alt="${escapeHtml(lot.title)}"
             class="w-full h-48 object-cover rounded-t-lg">
      </div>
      
      <div class="p-4">
        <div class="flex items-start justify-between mb-2">
          <h3 class="text-lg font-semibold text-gray-900 flex-1">${escapeHtml(lot.title)}</h3>
          <button onclick="toggleWatchlist(${lot.id}); event.stopPropagation();" 
                  class="text-gray-400 hover:text-red-500 transition-colors ml-2">
            <i class="${state.watchlist.has(lot.id) ? 'fas' : 'far'} fa-heart"></i>
          </button>
        </div>
        
        <p class="text-sm text-gray-600 mb-3 line-clamp-2">${escapeHtml(lot.description || '')}</p>
        
        <div class="space-y-2 text-sm mb-3">
          <div class="flex justify-between">
            <span class="text-gray-600">Current Bid:</span>
            <span class="font-semibold text-green-600">${formatCurrency(lot.current_bid || lot.starting_bid)}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-gray-600">Bids:</span>
            <span class="font-semibold">${lot.bid_count || 0}</span>
          </div>
        </div>
        
        ${renderLotStatus(lot)}
        
        <button class="w-full mt-3 bg-blue-600 text-white py-2 rounded-lg hover:bg-blue-700 transition-colors">
          View & Bid
        </button>
      </div>
    </div>
  `).join('');
}

function renderLotStatus(lot) {
  const now = Date.now() / 1000;
  const endTime = lot.end_time;
  
  if (endTime < now) {
    return '<div class="text-sm text-gray-500">Auction Ended</div>';
  }
  
  const timeLeft = endTime - now;
  return `
    <div class="text-sm">
      <span class="text-gray-600">Time Left:</span>
      <span class="font-semibold text-orange-600">${formatTimeLeft(timeLeft)}</span>
    </div>
  `;
}

// Lot Detail
async function viewLot(lotId) {
  if (!requireAuth()) return;
  
  try {
    const data = await api.get(`/lots/${lotId}`);
    state.currentLot = data.data;
    renderLotDetail(data.data);
    showPage('lot-detail');
    
    // Connect to real-time updates
    connectSSE(lotId);
    
    // Load bid history
    loadBidHistory(lotId);
  } catch (error) {
    showError('Failed to load lot details');
  }
}

function renderLotDetail(lot) {
  const container = document.getElementById('lot-detail-content');
  
  container.innerHTML = `
    <div class="bg-white rounded-lg shadow-lg overflow-hidden">
      <!-- Image Gallery -->
      <div class="relative">
        <div id="lot-gallery" class="swiper">
          <div class="swiper-wrapper">
            ${(lot.image_urls || ['/static/img/placeholder.jpg']).map(url => `
              <div class="swiper-slide">
                <img src="${url}" alt="${escapeHtml(lot.title)}" 
                     class="w-full h-96 object-cover cursor-zoom-in"
                     onclick="openImageModal('${url}')">
              </div>
            `).join('')}
          </div>
          <div class="swiper-pagination"></div>
          <div class="swiper-button-prev"></div>
          <div class="swiper-button-next"></div>
        </div>
        
        <button onclick="toggleWatchlist(${lot.id})" 
                class="absolute top-4 right-4 bg-white rounded-full p-3 shadow-lg hover:shadow-xl transition-shadow z-10">
          <i class="${state.watchlist.has(lot.id) ? 'fas' : 'far'} fa-heart text-2xl ${state.watchlist.has(lot.id) ? 'text-red-500' : 'text-gray-400'}"></i>
        </button>
      </div>
      
      <!-- Lot Info -->
      <div class="p-6">
        <div class="flex items-start justify-between mb-4">
          <div>
            <div class="text-sm text-gray-500 mb-1">Lot #${lot.lot_number}</div>
            <h1 class="text-3xl font-bold text-gray-900">${escapeHtml(lot.title)}</h1>
          </div>
        </div>
        
        <div class="prose max-w-none mb-6">
          <p class="text-gray-700">${escapeHtml(lot.description || '')}</p>
        </div>
        
        <!-- Key Details -->
        <div class="grid grid-cols-2 gap-4 mb-6 p-4 bg-gray-50 rounded-lg">
          ${lot.category ? `
            <div>
              <div class="text-sm text-gray-600">Category</div>
              <div class="font-semibold">${escapeHtml(lot.category)}</div>
            </div>
          ` : ''}
          ${lot.condition ? `
            <div>
              <div class="text-sm text-gray-600">Condition</div>
              <div class="font-semibold">${escapeHtml(lot.condition)}</div>
            </div>
          ` : ''}
          ${lot.location ? `
            <div>
              <div class="text-sm text-gray-600">Location</div>
              <div class="font-semibold">${escapeHtml(lot.location)}</div>
            </div>
          ` : ''}
          ${lot.shipping_available ? `
            <div>
              <div class="text-sm text-gray-600">Shipping</div>
              <div class="font-semibold text-green-600">Available</div>
            </div>
          ` : ''}
        </div>
        
        <!-- Bidding Section -->
        <div id="bidding-section" class="border-t border-gray-200 pt-6">
          ${renderBiddingSection(lot)}
        </div>
        
        <!-- Bid History -->
        <div class="border-t border-gray-200 pt-6 mt-6">
          <h3 class="text-xl font-semibold mb-4">Bid History</h3>
          <div id="bid-history-list" class="space-y-2">
            <div class="text-center py-4 text-gray-500">Loading bid history...</div>
          </div>
        </div>
      </div>
    </div>
  `;
  
  // Initialize swiper if images exist
  if (lot.image_urls && lot.image_urls.length > 1) {
    setTimeout(() => initSwiper(), 100);
  }
}

function renderBiddingSection(lot) {
  const now = Date.now() / 1000;
  const endTime = lot.end_time;
  
  if (endTime < now) {
    return `
      <div class="text-center py-8">
        <div class="text-2xl font-bold text-gray-900 mb-2">Auction Ended</div>
        ${lot.winning_bid_id ? `
          <div class="text-lg text-gray-600">
            Winning Bid: <span class="font-semibold text-green-600">${formatCurrency(lot.current_bid)}</span>
          </div>
        ` : `
          <div class="text-lg text-gray-600">No bids received</div>
        `}
      </div>
    `;
  }
  
  const currentBid = lot.current_bid || lot.starting_bid;
  const nextBid = calculateNextBid(currentBid, lot.increment_rules);
  const timeLeft = endTime - now;
  
  return `
    <!-- Current Status -->
    <div class="grid grid-cols-2 gap-4 mb-6">
      <div class="text-center p-4 bg-blue-50 rounded-lg">
        <div class="text-sm text-gray-600 mb-1">Current Bid</div>
        <div id="current-bid-display" class="text-3xl font-bold text-blue-600">${formatCurrency(currentBid)}</div>
        <div id="bid-count-display" class="text-sm text-gray-600 mt-1">${lot.bid_count || 0} bids</div>
      </div>
      
      <div class="text-center p-4 bg-orange-50 rounded-lg">
        <div class="text-sm text-gray-600 mb-1">Time Remaining</div>
        <div id="time-left-display" class="text-3xl font-bold text-orange-600">${formatTimeLeft(timeLeft)}</div>
        ${lot.reserve_price && !lot.reserve_met ? `
          <div class="text-sm text-red-600 mt-1">Reserve not met</div>
        ` : lot.reserve_met ? `
          <div class="text-sm text-green-600 mt-1">Reserve met</div>
        ` : ''}
      </div>
    </div>
    
    <!-- Quick Bid Buttons -->
    <div class="grid grid-cols-3 gap-3 mb-4">
      <button onclick="quickBid(${nextBid})" 
              class="bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 transition-colors font-semibold">
        Bid ${formatCurrency(nextBid)}
      </button>
      <button onclick="quickBid(${nextBid + (nextBid * 0.1)})" 
              class="bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 transition-colors font-semibold">
        Bid ${formatCurrency(nextBid + (nextBid * 0.1))}
      </button>
      <button onclick="showMaxBidModal()" 
              class="bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition-colors font-semibold">
        Max Bid
      </button>
    </div>
    
    <!-- Custom Bid -->
    <div class="flex gap-3">
      <input type="number" 
             id="custom-bid-amount" 
             placeholder="Enter your bid"
             min="${nextBid}"
             step="0.01"
             class="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
      <button onclick="placeBid()" 
              class="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold whitespace-nowrap">
        Place Bid
      </button>
    </div>
    
    ${lot.buy_now_price ? `
      <button onclick="buyNow()" 
              class="w-full mt-4 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition-colors font-semibold">
        Buy Now for ${formatCurrency(lot.buy_now_price)}
      </button>
    ` : ''}
  `;
}

async function quickBid(amount) {
  await placeBid(amount);
}

async function placeBid(amount) {
  if (!state.currentLot) return;
  
  const bidAmount = amount || parseFloat(document.getElementById('custom-bid-amount').value);
  
  if (!bidAmount || isNaN(bidAmount)) {
    showError('Please enter a valid bid amount');
    return;
  }
  
  try {
    const data = await api.post('/bidding/bid', {
      lot_id: state.currentLot.id,
      amount: bidAmount
    });
    
    showSuccess(`Bid placed successfully! Your bid: ${formatCurrency(bidAmount)}`);
    
    // Clear custom input
    const input = document.getElementById('custom-bid-amount');
    if (input) input.value = '';
    
  } catch (error) {
    showError(error.message);
  }
}

async function buyNow() {
  if (!state.currentLot || !state.currentLot.buy_now_price) return;
  
  if (!confirm(`Buy this item now for ${formatCurrency(state.currentLot.buy_now_price)}?`)) {
    return;
  }
  
  try {
    await api.post('/bidding/buy-now', {
      lot_id: state.currentLot.id
    });
    
    showSuccess('Purchase successful! Check your invoices.');
    viewLot(state.currentLot.id); // Reload
  } catch (error) {
    showError(error.message);
  }
}

function showMaxBidModal() {
  const modal = document.getElementById('max-bid-modal');
  if (modal) {
    modal.classList.remove('hidden');
    document.getElementById('max-bid-amount').value = '';
    document.getElementById('max-bid-amount').focus();
  }
}

function closeMaxBidModal() {
  const modal = document.getElementById('max-bid-modal');
  if (modal) {
    modal.classList.add('hidden');
  }
}

async function placeMaxBid() {
  const amount = parseFloat(document.getElementById('max-bid-amount').value);
  
  if (!amount || isNaN(amount)) {
    showError('Please enter a valid maximum bid amount');
    return;
  }
  
  try {
    await api.post('/bidding/max-bid', {
      lot_id: state.currentLot.id,
      max_amount: amount
    });
    
    showSuccess(`Maximum bid set to ${formatCurrency(amount)}`);
    closeMaxBidModal();
    
  } catch (error) {
    showError(error.message);
  }
}

// Bid History
async function loadBidHistory(lotId) {
  try {
    const data = await api.get(`/bidding/history/${lotId}`);
    renderBidHistory(data.data);
  } catch (error) {
    console.error('Failed to load bid history:', error);
  }
}

function renderBidHistory(bids) {
  const container = document.getElementById('bid-history-list');
  
  if (!bids || bids.length === 0) {
    container.innerHTML = '<div class="text-center py-4 text-gray-500">No bids yet. Be the first to bid!</div>';
    return;
  }
  
  container.innerHTML = bids.map((bid, index) => `
    <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
      <div class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
          <span class="text-sm font-semibold text-blue-600">${index + 1}</span>
        </div>
        <div>
          <div class="font-semibold text-gray-900">${formatCurrency(bid.amount)}</div>
          <div class="text-xs text-gray-500">${formatDateTime(bid.created_at)}</div>
        </div>
      </div>
      ${bid.is_proxy ? `
        <span class="px-2 py-1 bg-purple-100 text-purple-700 text-xs rounded">Proxy</span>
      ` : ''}
      ${bid.is_winning ? `
        <span class="px-2 py-1 bg-green-100 text-green-700 text-xs rounded">Winning</span>
      ` : ''}
    </div>
  `).join('');
}

// Real-time Updates (SSE)
function connectSSE(lotId) {
  // Close existing connection for this lot
  const existing = state.sseConnections.get(lotId);
  if (existing) {
    existing.close();
  }
  
  const eventSource = new EventSource(`/api/bidding/stream/${lotId}`);
  
  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    handleLotUpdate(lotId, data);
  };
  
  eventSource.onerror = (error) => {
    console.error('SSE error:', error);
    eventSource.close();
    state.sseConnections.delete(lotId);
    
    // Reconnect after 5 seconds
    setTimeout(() => {
      if (state.currentLot && state.currentLot.id === lotId) {
        connectSSE(lotId);
      }
    }, 5000);
  };
  
  state.sseConnections.set(lotId, eventSource);
}

function handleLotUpdate(lotId, data) {
  if (!state.currentLot || state.currentLot.id !== lotId) return;
  
  // Update current bid
  const currentBidEl = document.getElementById('current-bid-display');
  if (currentBidEl && data.current_bid) {
    currentBidEl.textContent = formatCurrency(data.current_bid);
  }
  
  // Update bid count
  const bidCountEl = document.getElementById('bid-count-display');
  if (bidCountEl && data.bid_count !== undefined) {
    bidCountEl.textContent = `${data.bid_count} bids`;
  }
  
  // Update time left
  const timeLeftEl = document.getElementById('time-left-display');
  if (timeLeftEl && data.time_remaining !== undefined) {
    timeLeftEl.textContent = formatTimeLeft(data.time_remaining);
  }
  
  // Reload bid history if new bid
  if (data.new_bid) {
    loadBidHistory(lotId);
  }
}

function closeAllSSE() {
  state.sseConnections.forEach(conn => conn.close());
  state.sseConnections.clear();
}

// Watchlist
async function toggleWatchlist(lotId) {
  if (!requireAuth()) return;
  
  try {
    if (state.watchlist.has(lotId)) {
      await api.delete(`/bidding/watchlist/${lotId}`);
      state.watchlist.delete(lotId);
      showSuccess('Removed from watchlist');
    } else {
      await api.post(`/bidding/watchlist/${lotId}`);
      state.watchlist.add(lotId);
      showSuccess('Added to watchlist');
    }
    
    // Update UI
    document.querySelectorAll(`[onclick*="toggleWatchlist(${lotId})"]`).forEach(btn => {
      const icon = btn.querySelector('i');
      if (icon) {
        icon.className = state.watchlist.has(lotId) ? 'fas fa-heart text-red-500' : 'far fa-heart';
      }
    });
    
  } catch (error) {
    showError(error.message);
  }
}

async function loadWatchlist() {
  if (!requireAuth()) return;
  
  try {
    showLoading('watchlist-grid');
    const data = await api.get('/bidding/watchlist');
    
    // Update state
    state.watchlist.clear();
    data.data.forEach(item => state.watchlist.add(item.lot_id));
    
    // Render
    const grid = document.getElementById('watchlist-grid');
    if (!data.data || data.data.length === 0) {
      grid.innerHTML = '<div class="col-span-full text-center py-12 text-gray-500">Your watchlist is empty</div>';
      return;
    }
    
    renderLots(data.data.map(item => item.lot));
  } catch (error) {
    showError('Failed to load watchlist');
  }
}

// My Bids
async function loadMyBids() {
  if (!requireAuth()) return;
  
  try {
    showLoading('my-bids-list');
    const data = await api.get('/bidding/my-bids');
    renderMyBids(data.data);
  } catch (error) {
    showError('Failed to load bids');
  }
}

function renderMyBids(bids) {
  const container = document.getElementById('my-bids-list');
  
  if (!bids || bids.length === 0) {
    container.innerHTML = '<div class="text-center py-12 text-gray-500">You haven\'t placed any bids yet</div>';
    return;
  }
  
  container.innerHTML = bids.map(bid => `
    <div class="bg-white rounded-lg shadow-sm p-6 cursor-pointer hover:shadow-md transition-shadow" 
         onclick="viewLot(${bid.lot_id})">
      <div class="flex items-start justify-between mb-4">
        <div class="flex-1">
          <h3 class="text-lg font-semibold text-gray-900 mb-1">${escapeHtml(bid.lot?.title || 'Lot #' + bid.lot_id)}</h3>
          <div class="text-sm text-gray-600">Lot #${bid.lot?.lot_number || bid.lot_id}</div>
        </div>
        ${bid.is_winning ? `
          <span class="px-3 py-1 bg-green-100 text-green-700 text-sm rounded-full font-semibold">
            <i class="fas fa-trophy mr-1"></i>Winning
          </span>
        ` : `
          <span class="px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded-full">
            Outbid
          </span>
        `}
      </div>
      
      <div class="grid grid-cols-2 gap-4">
        <div>
          <div class="text-sm text-gray-600">Your Bid</div>
          <div class="text-lg font-semibold text-blue-600">${formatCurrency(bid.amount)}</div>
        </div>
        <div>
          <div class="text-sm text-gray-600">Current Bid</div>
          <div class="text-lg font-semibold text-green-600">${formatCurrency(bid.lot?.current_bid || 0)}</div>
        </div>
      </div>
      
      <div class="mt-4 pt-4 border-t border-gray-200 text-sm text-gray-600">
        Bid placed: ${formatDateTime(bid.created_at)}
      </div>
    </div>
  `).join('');
}

// My Wins
async function loadMyWins() {
  if (!requireAuth()) return;
  
  try {
    showLoading('my-wins-list');
    const data = await api.get('/bidding/my-wins');
    renderMyWins(data.data);
  } catch (error) {
    showError('Failed to load wins');
  }
}

function renderMyWins(wins) {
  const container = document.getElementById('my-wins-list');
  
  if (!wins || wins.length === 0) {
    container.innerHTML = '<div class="text-center py-12 text-gray-500">You haven\'t won any items yet</div>';
    return;
  }
  
  container.innerHTML = wins.map(win => `
    <div class="bg-white rounded-lg shadow-sm p-6">
      <div class="flex items-start justify-between mb-4">
        <div class="flex-1">
          <h3 class="text-lg font-semibold text-gray-900 mb-1">${escapeHtml(win.lot?.title || 'Lot #' + win.lot_id)}</h3>
          <div class="text-sm text-gray-600">Lot #${win.lot?.lot_number || win.lot_id}</div>
        </div>
        <span class="px-3 py-1 bg-green-100 text-green-700 text-sm rounded-full font-semibold">
          <i class="fas fa-trophy mr-1"></i>Won
        </span>
      </div>
      
      <div class="grid grid-cols-3 gap-4 mb-4">
        <div>
          <div class="text-sm text-gray-600">Winning Bid</div>
          <div class="text-lg font-semibold text-green-600">${formatCurrency(win.amount)}</div>
        </div>
        <div>
          <div class="text-sm text-gray-600">Premium (15%)</div>
          <div class="text-lg font-semibold">${formatCurrency(win.amount * 0.15)}</div>
        </div>
        <div>
          <div class="text-sm text-gray-600">Total</div>
          <div class="text-lg font-semibold text-blue-600">${formatCurrency(win.amount * 1.15)}</div>
        </div>
      </div>
      
      ${win.invoice_id ? `
        <button onclick="viewInvoice(${win.invoice_id}); event.stopPropagation();" 
                class="w-full py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
          View Invoice
        </button>
      ` : `
        <div class="text-sm text-orange-600 text-center py-2">
          Invoice being generated...
        </div>
      `}
      
      <div class="mt-4 pt-4 border-t border-gray-200 text-sm text-gray-600">
        Won on: ${formatDateTime(win.created_at)}
      </div>
    </div>
  `).join('');
}

// Invoices
async function loadInvoices() {
  if (!requireAuth()) return;
  
  try {
    showLoading('invoices-list');
    const data = await api.get('/invoices');
    renderInvoices(data.data);
  } catch (error) {
    showError('Failed to load invoices');
  }
}

function renderInvoices(invoices) {
  const container = document.getElementById('invoices-list');
  
  if (!invoices || invoices.length === 0) {
    container.innerHTML = '<div class="text-center py-12 text-gray-500">No invoices found</div>';
    return;
  }
  
  container.innerHTML = invoices.map(invoice => `
    <div class="bg-white rounded-lg shadow-sm p-6">
      <div class="flex items-start justify-between mb-4">
        <div class="flex-1">
          <h3 class="text-lg font-semibold text-gray-900 mb-1">Invoice #${invoice.invoice_number}</h3>
          <div class="text-sm text-gray-600">${invoice.items?.length || 0} items</div>
        </div>
        <span class="px-3 py-1 ${getStatusBadgeClass(invoice.payment_status)} text-sm rounded-full font-semibold">
          ${invoice.payment_status}
        </span>
      </div>
      
      <div class="grid grid-cols-3 gap-4 mb-4 p-4 bg-gray-50 rounded-lg">
        <div>
          <div class="text-sm text-gray-600">Subtotal</div>
          <div class="text-lg font-semibold">${formatCurrency(invoice.subtotal)}</div>
        </div>
        <div>
          <div class="text-sm text-gray-600">Premium</div>
          <div class="text-lg font-semibold">${formatCurrency(invoice.buyers_premium)}</div>
        </div>
        <div>
          <div class="text-sm text-gray-600">Total</div>
          <div class="text-xl font-bold text-blue-600">${formatCurrency(invoice.total)}</div>
        </div>
      </div>
      
      <div class="flex gap-3">
        <button onclick="viewInvoice(${invoice.id})" 
                class="flex-1 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
          View Details
        </button>
        ${invoice.payment_status === 'unpaid' ? `
          <button onclick="payInvoice(${invoice.id})" 
                  class="flex-1 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">
            Pay Now
          </button>
        ` : ''}
      </div>
      
      <div class="mt-4 pt-4 border-t border-gray-200 text-sm text-gray-600">
        Created: ${formatDateTime(invoice.created_at)}
      </div>
    </div>
  `).join('');
}

async function viewInvoice(invoiceId) {
  // Navigate to invoices page if not already there
  showPage('invoices');
  // Could expand invoice details here
}

async function payInvoice(invoiceId) {
  showError('Payment integration not yet implemented. Contact admin for payment options.');
}

// Profile
async function loadProfile() {
  if (!requireAuth()) return;
  
  if (!state.user) {
    await loadUserProfile();
  }
  
  renderProfile();
}

function renderProfile() {
  const container = document.getElementById('profile-content');
  
  if (!state.user) {
    container.innerHTML = '<div class="text-center py-12 text-gray-500">Loading profile...</div>';
    return;
  }
  
  container.innerHTML = `
    <div class="bg-white rounded-lg shadow-sm p-6 mb-6">
      <h2 class="text-2xl font-bold text-gray-900 mb-6">Profile Information</h2>
      
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Name</label>
          <input type="text" id="profile-name" value="${escapeHtml(state.user.name || '')}"
                 class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
        </div>
        
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Email</label>
          <input type="email" value="${escapeHtml(state.user.email || '')}" disabled
                 class="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50">
        </div>
        
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Phone</label>
          <input type="tel" id="profile-phone" value="${escapeHtml(state.user.phone || '')}"
                 class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
        </div>
        
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Address</label>
          <textarea id="profile-address" rows="3"
                    class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">${escapeHtml(state.user.address || '')}</textarea>
        </div>
        
        <button onclick="updateProfile()" 
                class="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold">
          Save Changes
        </button>
      </div>
    </div>
    
    <div class="bg-white rounded-lg shadow-sm p-6">
      <h2 class="text-2xl font-bold text-gray-900 mb-6">Account Status</h2>
      
      <div class="space-y-3">
        <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <span class="text-gray-700">Email Verification</span>
          ${state.user.email_verified ? `
            <span class="px-3 py-1 bg-green-100 text-green-700 text-sm rounded-full">Verified</span>
          ` : `
            <button onclick="resendVerification()" class="px-3 py-1 bg-orange-100 text-orange-700 text-sm rounded-full hover:bg-orange-200">
              Verify Email
            </button>
          `}
        </div>
        
        <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <span class="text-gray-700">Account Status</span>
          <span class="px-3 py-1 ${state.user.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'} text-sm rounded-full">
            ${state.user.status}
          </span>
        </div>
        
        <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <span class="text-gray-700">Member Since</span>
          <span class="text-gray-900 font-semibold">${formatDate(state.user.created_at)}</span>
        </div>
      </div>
    </div>
  `;
}

async function updateProfile() {
  const name = document.getElementById('profile-name').value;
  const phone = document.getElementById('profile-phone').value;
  const address = document.getElementById('profile-address').value;
  
  try {
    const data = await api.put('/auth/profile', { name, phone, address });
    state.user = data.data;
    updateUserDisplay();
    showSuccess('Profile updated successfully');
  } catch (error) {
    showError(error.message);
  }
}

async function resendVerification() {
  try {
    await api.post('/auth/resend-verification');
    showSuccess('Verification email sent! Please check your inbox.');
  } catch (error) {
    showError(error.message);
  }
}

// UI Utilities
function showLoading(elementId) {
  const el = document.getElementById(elementId);
  if (el) {
    el.innerHTML = '<div class="text-center py-12"><i class="fas fa-spinner fa-spin text-4xl text-gray-400"></i></div>';
  }
}

function showSuccess(message) {
  showNotification(message, 'success');
}

function showError(message) {
  showNotification(message, 'error');
}

function showNotification(message, type = 'info') {
  const container = document.getElementById('notification-container');
  if (!container) return;
  
  const notification = document.createElement('div');
  notification.className = `notification ${type} transform transition-all duration-300 translate-y-0 opacity-100`;
  
  const icon = type === 'success' ? 'fa-check-circle' : type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle';
  const bgColor = type === 'success' ? 'bg-green-500' : type === 'error' ? 'bg-red-500' : 'bg-blue-500';
  
  notification.innerHTML = `
    <div class="${bgColor} text-white px-6 py-4 rounded-lg shadow-lg flex items-center gap-3">
      <i class="fas ${icon}"></i>
      <span>${escapeHtml(message)}</span>
    </div>
  `;
  
  container.appendChild(notification);
  
  setTimeout(() => {
    notification.classList.add('-translate-y-2', 'opacity-0');
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

function updateUserDisplay() {
  const el = document.getElementById('user-display');
  if (el && state.user) {
    el.textContent = state.user.name || state.user.email;
  }
}

// Utilities
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount || 0);
}

function formatDateTime(timestamp) {
  if (!timestamp) return 'N/A';
  const date = new Date(timestamp * 1000);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function formatDate(timestamp) {
  if (!timestamp) return 'N/A';
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function formatTimeLeft(seconds) {
  if (seconds <= 0) return 'Ended';
  
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

function calculateNextBid(currentBid, incrementRules) {
  if (!incrementRules) return currentBid + 5;
  
  for (const rule of incrementRules) {
    if (currentBid >= rule.min && (rule.max === null || currentBid < rule.max)) {
      return currentBid + rule.increment;
    }
  }
  
  return currentBid + 5;
}

function getStatusBadgeClass(status) {
  const classes = {
    'paid': 'bg-green-100 text-green-700',
    'unpaid': 'bg-orange-100 text-orange-700',
    'partial': 'bg-yellow-100 text-yellow-700',
    'refunded': 'bg-gray-100 text-gray-700'
  };
  return classes[status] || 'bg-gray-100 text-gray-700';
}

function initSwiper() {
  // Initialize Swiper for image gallery (if Swiper library is loaded)
  if (typeof Swiper !== 'undefined') {
    new Swiper('#lot-gallery', {
      pagination: {
        el: '.swiper-pagination',
        clickable: true
      },
      navigation: {
        nextEl: '.swiper-button-next',
        prevEl: '.swiper-button-prev'
      },
      loop: true
    });
  }
}

function openImageModal(imageUrl) {
  // Create modal for zoomed image
  const modal = document.createElement('div');
  modal.className = 'fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center p-4';
  modal.onclick = () => modal.remove();
  
  modal.innerHTML = `
    <img src="${imageUrl}" class="max-w-full max-h-full object-contain" onclick="event.stopPropagation()">
    <button class="absolute top-4 right-4 text-white text-4xl hover:text-gray-300" onclick="this.parentElement.remove()">
      <i class="fas fa-times"></i>
    </button>
  `;
  
  document.body.appendChild(modal);
}

// Initialize app
document.addEventListener('DOMContentLoaded', async () => {
  // Check authentication
  if (isAuthenticated()) {
    await loadUserProfile();
    showPage('auctions');
  } else {
    showPage('login');
  }
  
  // Setup event listeners
  setupEventListeners();
  
  // Start countdown timer
  startCountdownTimer();
});

function setupEventListeners() {
  // Login form
  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.getElementById('login-email').value;
      const password = document.getElementById('login-password').value;
      login(email, password);
    });
  }
  
  // Register form
  const registerForm = document.getElementById('register-form');
  if (registerForm) {
    registerForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const email = document.getElementById('register-email').value;
      const password = document.getElementById('register-password').value;
      const name = document.getElementById('register-name').value;
      const phone = document.getElementById('register-phone').value;
      register(email, password, name, phone);
    });
  }
  
  // Max bid form
  const maxBidForm = document.getElementById('max-bid-form');
  if (maxBidForm) {
    maxBidForm.addEventListener('submit', (e) => {
      e.preventDefault();
      placeMaxBid();
    });
  }
  
  // Logout button
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', logout);
  }
}

function startCountdownTimer() {
  setInterval(() => {
    const timeLeftEl = document.getElementById('time-left-display');
    if (timeLeftEl && state.currentLot) {
      const now = Date.now() / 1000;
      const timeLeft = state.currentLot.end_time - now;
      timeLeftEl.textContent = formatTimeLeft(timeLeft);
      
      if (timeLeft <= 0) {
        timeLeftEl.textContent = 'Ended';
      }
    }
  }, 1000);
}
