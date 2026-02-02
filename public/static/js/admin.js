/**
 * Admin Portal JavaScript
 * Complete admin interface for managing auctions, lots, imports, and bidders
 */

const API_BASE = '/api';
let authToken = localStorage.getItem('token');
let currentUser = null;

// ============================================================================
// AUTHENTICATION & API UTILITIES
// ============================================================================

async function apiCall(endpoint, options = {}) {
  const defaultOptions = {
    headers: {
      'Content-Type': 'application/json',
      ...(authToken && { 'Authorization': `Bearer ${authToken}` }),
    },
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...defaultOptions,
    ...options,
    headers: { ...defaultOptions.headers, ...options.headers },
  });

  const data = await response.json();
  
  if (!response.ok) {
    if (response.status === 401) {
      logout();
      throw new Error('Authentication required');
    }
    throw new Error(data.error || 'Request failed');
  }

  return data;
}

async function checkAuth() {
  if (!authToken) {
    window.location.href = '/admin/login.html';
    return false;
  }

  try {
    const data = await apiCall('/auth/me');
    currentUser = data.data;
    
    if (currentUser.role !== 'admin' && currentUser.role !== 'staff') {
      alert('Access denied. Admin or staff role required.');
      logout();
      return false;
    }

    document.getElementById('admin-user').textContent = currentUser.email;
    return true;
  } catch (error) {
    logout();
    return false;
  }
}

function logout() {
  localStorage.removeItem('token');
  authToken = null;
  window.location.href = '/admin/login.html';
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function formatDate(timestamp) {
  return new Date(timestamp * 1000).toLocaleString();
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `fixed top-4 right-4 p-4 rounded-lg shadow-lg z-50 ${
    type === 'success' ? 'bg-green-500' : 'bg-red-500'
  } text-white`;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => toast.remove(), 3000);
}

function showLoading(element) {
  element.innerHTML = '<div class="flex justify-center p-8"><div class="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div></div>';
}

// ============================================================================
// AUCTION MANAGEMENT
// ============================================================================

async function loadAuctions() {
  const container = document.getElementById('auctions-list');
  showLoading(container);

  try {
    const data = await apiCall('/auctions');
    const auctions = data.data;

    if (auctions.length === 0) {
      container.innerHTML = '<p class="text-gray-500 text-center py-8">No auctions found. Create your first auction!</p>';
      return;
    }

    container.innerHTML = auctions.map(auction => `
      <div class="bg-white rounded-lg shadow p-6 hover:shadow-lg transition">
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-xl font-bold text-gray-900">${auction.title}</h3>
          <span class="px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(auction.status)}">
            ${auction.status}
          </span>
        </div>
        
        <p class="text-gray-600 mb-4">${auction.description || 'No description'}</p>
        
        <div class="grid grid-cols-2 gap-4 mb-4 text-sm">
          <div>
            <span class="text-gray-500">Start:</span>
            <span class="font-medium">${formatDate(auction.start_date)}</span>
          </div>
          <div>
            <span class="text-gray-500">End:</span>
            <span class="font-medium">${formatDate(auction.end_date)}</span>
          </div>
        </div>
        
        <div class="flex gap-2">
          <button onclick="viewAuction(${auction.id})" class="flex-1 px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">
            View Details
          </button>
          <button onclick="editAuction(${auction.id})" class="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300">
            Edit
          </button>
          ${auction.status === 'draft' ? `
            <button onclick="publishAuction(${auction.id})" class="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600">
              Publish
            </button>
          ` : ''}
          ${auction.status === 'active' || auction.status === 'published' ? `
            <button onclick="closeAuction(${auction.id})" class="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600">
              Close
            </button>
          ` : ''}
        </div>
      </div>
    `).join('');
  } catch (error) {
    container.innerHTML = `<p class="text-red-500 text-center py-8">Error loading auctions: ${error.message}</p>`;
  }
}

function getStatusColor(status) {
  const colors = {
    draft: 'bg-gray-200 text-gray-700',
    published: 'bg-blue-200 text-blue-700',
    active: 'bg-green-200 text-green-700',
    closed: 'bg-red-200 text-red-700',
    archived: 'bg-gray-200 text-gray-700',
  };
  return colors[status] || 'bg-gray-200 text-gray-700';
}

async function viewAuction(id) {
  window.location.href = `/admin/auction.html?id=${id}`;
}

async function editAuction(id) {
  window.location.href = `/admin/auction-edit.html?id=${id}`;
}

async function publishAuction(id) {
  if (!confirm('Publish this auction? It will become visible to bidders.')) return;

  try {
    await apiCall(`/auctions/${id}/publish`, { method: 'POST' });
    showToast('Auction published successfully');
    loadAuctions();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function closeAuction(id) {
  if (!confirm('Close this auction? This will finalize all lots and cannot be undone.')) return;

  try {
    await apiCall(`/auctions/${id}/close`, { method: 'POST' });
    showToast('Auction closed successfully');
    loadAuctions();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function createAuction() {
  const title = prompt('Enter auction title:');
  if (!title) return;

  const now = Math.floor(Date.now() / 1000);
  const sevenDaysLater = now + (7 * 24 * 60 * 60);

  try {
    const data = await apiCall('/auctions', {
      method: 'POST',
      body: JSON.stringify({
        title,
        start_date: now,
        end_date: sevenDaysLater,
        soft_close_enabled: true,
        soft_close_trigger_minutes: 5,
        soft_close_extension_minutes: 5,
      }),
    });

    showToast('Auction created successfully');
    window.location.href = `/admin/auction-edit.html?id=${data.data.id}`;
  } catch (error) {
    showToast(error.message, 'error');
  }
}

// ============================================================================
// LOT MANAGEMENT
// ============================================================================

async function loadLots(auctionId) {
  const container = document.getElementById('lots-list');
  showLoading(container);

  try {
    const data = await apiCall(`/lots?auction_id=${auctionId}`);
    const lots = data.data;

    if (lots.length === 0) {
      container.innerHTML = '<p class="text-gray-500 text-center py-8">No lots found. Add lots to this auction!</p>';
      return;
    }

    container.innerHTML = `
      <div class="overflow-x-auto">
        <table class="min-w-full divide-y divide-gray-200">
          <thead class="bg-gray-50">
            <tr>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Lot #</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Title</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Starting Bid</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Current Bid</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Bids</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
              <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
            </tr>
          </thead>
          <tbody class="bg-white divide-y divide-gray-200">
            ${lots.map(lot => `
              <tr>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${lot.lot_number}</td>
                <td class="px-6 py-4 text-sm text-gray-900">${lot.title}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${lot.category || '-'}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${formatCurrency(lot.starting_bid)}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${lot.current_bid > 0 ? formatCurrency(lot.current_bid) : '-'}</td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${lot.bid_count}</td>
                <td class="px-6 py-4 whitespace-nowrap">
                  <span class="px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusColor(lot.status)}">
                    ${lot.status}
                  </span>
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                  <button onclick="viewLot(${lot.id})" class="text-indigo-600 hover:text-indigo-900 mr-3">View</button>
                  <button onclick="editLot(${lot.id})" class="text-blue-600 hover:text-blue-900">Edit</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (error) {
    container.innerHTML = `<p class="text-red-500 text-center py-8">Error loading lots: ${error.message}</p>`;
  }
}

async function viewLot(id) {
  window.location.href = `/admin/lot.html?id=${id}`;
}

async function editLot(id) {
  window.location.href = `/admin/lot-edit.html?id=${id}`;
}

// ============================================================================
// IMPORT MANAGEMENT
// ============================================================================

async function handleCSVImport(event, auctionId) {
  event.preventDefault();
  
  const fileInput = document.getElementById('csv-file');
  const file = fileInput.files[0];
  
  if (!file) {
    showToast('Please select a CSV file', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('file', file);

  try {
    const response = await fetch(`${API_BASE}/imports/lots/${auctionId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
      },
      body: formData,
    });

    const data = await response.json();

    if (data.success) {
      showToast(`Imported ${data.data.successfulItems} lots successfully`);
      if (data.data.errors.length > 0) {
        displayImportErrors(data.data.errors);
      }
    } else {
      showToast(data.message, 'error');
      if (data.data && data.data.errors) {
        displayImportErrors(data.data.errors);
      }
    }
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function displayImportErrors(errors) {
  const container = document.getElementById('import-errors');
  container.innerHTML = `
    <div class="bg-red-50 border border-red-200 rounded-lg p-4 mt-4">
      <h3 class="text-red-800 font-bold mb-2">Import Errors:</h3>
      <ul class="list-disc list-inside text-red-700 text-sm">
        ${errors.map(err => `<li>Row ${err.row}, Field "${err.field}": ${err.message}</li>`).join('')}
      </ul>
    </div>
  `;
}

async function handleBulkImageUpload(event, auctionId) {
  event.preventDefault();
  
  const fileInput = document.getElementById('image-files');
  const files = fileInput.files;
  
  if (files.length === 0) {
    showToast('Please select image files', 'error');
    return;
  }

  const formData = new FormData();
  for (let i = 0; i < files.length; i++) {
    formData.append('files', files[i]);
  }

  try {
    const response = await fetch(`${API_BASE}/imports/images/${auctionId}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
      },
      body: formData,
    });

    const data = await response.json();

    if (data.success) {
      showToast(`Processed ${data.data.totalImages} images: ${data.data.matched} matched, ${data.data.unmatched} unmatched`);
      
      if (data.data.unmatched > 0) {
        displayUnmatchedImages(data.data.results.filter(r => r.status === 'unmatched'));
      }
    } else {
      showToast(data.message, 'error');
    }
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function displayUnmatchedImages(unmatched) {
  const container = document.getElementById('unmatched-images');
  container.innerHTML = `
    <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-4">
      <h3 class="text-yellow-800 font-bold mb-2">Unmatched Images (${unmatched.length}):</h3>
      <ul class="list-disc list-inside text-yellow-700 text-sm">
        ${unmatched.map(img => `<li>${img.filename} - ${img.reason || 'No lot found'}</li>`).join('')}
      </ul>
    </div>
  `;
}

// ============================================================================
// DASHBOARD STATS
// ============================================================================

async function loadDashboardStats() {
  try {
    const auctionsData = await apiCall('/auctions');
    const auctions = auctionsData.data;
    
    const activeAuctions = auctions.filter(a => a.status === 'active').length;
    
    document.getElementById('active-auctions').textContent = activeAuctions;
    
    // Load more stats if needed
    // This is a basic implementation - expand as needed
  } catch (error) {
    console.error('Error loading stats:', error);
  }
}

// ============================================================================
// INITIALIZE
// ============================================================================

window.addEventListener('DOMContentLoaded', async () => {
  const isAuthenticated = await checkAuth();
  if (!isAuthenticated) return;

  // Load page-specific content
  const path = window.location.pathname;
  
  if (path.includes('index.html') || path === '/admin/' || path === '/admin') {
    loadDashboardStats();
  } else if (path.includes('auctions.html')) {
    loadAuctions();
  } else if (path.includes('auction.html')) {
    const params = new URLSearchParams(window.location.search);
    const auctionId = params.get('id');
    if (auctionId) {
      loadLots(auctionId);
    }
  }
});

// Make functions globally available
window.apiCall = apiCall;
window.logout = logout;
window.loadAuctions = loadAuctions;
window.loadLots = loadLots;
window.viewAuction = viewAuction;
window.editAuction = editAuction;
window.publishAuction = publishAuction;
window.closeAuction = closeAuction;
window.createAuction = createAuction;
window.viewLot = viewLot;
window.editLot = editLot;
window.handleCSVImport = handleCSVImport;
window.handleBulkImageUpload = handleBulkImageUpload;
