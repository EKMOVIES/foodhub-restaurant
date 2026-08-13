let foods = [];
let cart = [];
let token = localStorage.getItem("token");
let currentUserId = null;
let allFoods = [];
let selectedCategory = 'all';
let minPriceFilter = 0;
let maxPriceFilter = 1000;
let currentSort = 'default';

function getCartStorageKey() {
  return currentUserId ? `foodhub_cart_user_${currentUserId}` : "foodhub_cart_guest";
}

function normalizeCart(items) {
  return (Array.isArray(items) ? items : []).map(item => ({
    ...item,
    foodId: String(item.foodId),
    quantity: Number(item.quantity) || 0
  })).filter(item => item.quantity > 0);
}

function mergeCarts(base, extra) {
  const merged = normalizeCart(base);
  for (const item of normalizeCart(extra)) {
    const existing = merged.find(x => String(x.foodId) === String(item.foodId));
    if (existing) existing.quantity += item.quantity;
    else merged.push({ ...item });
  }
  return merged;
}

function loadCartForUser(userId) {
  currentUserId = String(userId);
  const userKey = getCartStorageKey();
  const savedUserCart = normalizeCart(JSON.parse(localStorage.getItem(userKey) || "[]"));
  const guestCart = normalizeCart(JSON.parse(localStorage.getItem("foodhub_cart_guest") || "[]"));
  const legacyCart = normalizeCart(JSON.parse(localStorage.getItem("cart") || "[]"));
  cart = mergeCarts(savedUserCart, mergeCarts(guestCart, legacyCart));
  localStorage.setItem(userKey, JSON.stringify(cart));
  localStorage.removeItem("foodhub_cart_guest");
  localStorage.removeItem("cart");
  updateCartCount();
}

function clearCurrentCartFromMemory() {
  cart = [];
  currentUserId = null;
  updateCartCount();
}

const foodGrid = document.getElementById("foodGrid");
const modal = document.getElementById("modal");
const modalContent = document.getElementById("modalContent");
const cartCount = document.getElementById("cartCount");
const loginBtn = document.getElementById("loginBtn");
const logoutBtn = document.getElementById("logoutBtn");
const ordersBtn = document.getElementById("ordersBtn");
const chatBtn = document.getElementById("chatBtn");
const floatingChat = document.getElementById("floatingChat");
const welcome = document.getElementById("welcome");

async function api(url, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(url, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Something went wrong.");
  return data;
}

async function loadFoods() {
  try {
    const response = await fetch('/api/foods');
    if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
    const data = await response.json();
    foods = data;
    allFoods = [...data];
    if (allFoods && allFoods.length > 0) {
      const maxPrice = Math.max(...allFoods.map(f => f.price));
      maxPriceFilter = maxPrice;
      const sliderMax = document.getElementById('priceSliderMax');
      const displayMax = document.getElementById('displayMaxPrice');
      const inputMax = document.getElementById('maxPrice');
      if (sliderMax) { sliderMax.max = maxPrice; sliderMax.value = maxPrice; }
      if (displayMax) displayMax.textContent = Math.round(maxPrice);
      if (inputMax) inputMax.placeholder = Math.round(maxPrice);
    }
    renderFoods();
    await loadCategoriesForFilter();
    console.log('Foods loaded successfully:', foods.length);
    return foods;
  } catch (error) {
    console.error('Error loading foods:', error);
    foodGrid.innerHTML = `<p>Could not load menu: ${error.message}</p>`;
    throw error;
  }
}

function renderFoods() {
  foodGrid.innerHTML = foods.map(food => {
    const foodId = food.id;
    return `
      <article class="food-card" onclick="showProductDetail(${foodId})">
        <img src="${food.image}" alt="${food.name}">
        <div class="food-body">
          <h3>${food.name}</h3>
          ${food.category_name ? `<span style="font-size:12px;color:#0b6b57;">${food.category_icon || '📁'} ${food.category_name}</span>` : ''}
          <div style="margin: 6px 0;">
            <span class="rating">⭐ ${food.rating || 0}</span>
            <span class="popularity">🔥 ${food.popularity || 0} orders</span>
          </div>
          <p>${food.description}</p>
          <div class="price">৳${food.price.toFixed(2)}</div>
          <button onclick="event.stopPropagation(); addToCart(${foodId})">Add to Cart</button>
        </div>
      </article>
    `;
  }).join("");
}

function saveCart() {
  localStorage.setItem(getCartStorageKey(), JSON.stringify(normalizeCart(cart)));
  updateCartCount();
}

function updateCartCount() {
  cartCount.textContent = cart.reduce((sum, item) => sum + item.quantity, 0);
}

function addToCart(foodId) {
  foodId = String(foodId);
  const existing = cart.find(item => String(item.foodId) === foodId);
  if (existing) existing.quantity++;
  else cart.push({ foodId, quantity: 1 });
  saveCart();
  showToast("Added to cart.");
}

function changeQty(foodId, amount) {
  foodId = String(foodId);
  const item = cart.find(x => String(x.foodId) === foodId);
  if (!item) return;
  item.quantity += amount;
  if (item.quantity <= 0) {
    cart = cart.filter(x => String(x.foodId) !== foodId);
  }
  saveCart();
  showCart();
}

function cartDetails() {
  return cart.map(item => {
    const food = foods.find(f => String(f.id) === String(item.foodId));
    return food ? { ...food, quantity: item.quantity } : null;
  }).filter(Boolean);
}

function showCart() {
  const items = cartDetails();
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  modalContent.innerHTML = `
    <h2>Your Cart</h2>
    ${items.length ? items.map(item => `
      <div class="cart-item">
        <div class="item-name" onclick="showProductDetail(${item.id})">
          <strong>${item.name}</strong><br>
          ৳${item.price} × ${item.quantity}
        </div>
        <div class="qty">
          <button onclick="event.stopPropagation(); changeQty(${item.id}, -1)">−</button>
          <span>${item.quantity}</span>
          <button onclick="event.stopPropagation(); changeQty(${item.id}, 1)">+</button>
        </div>
      </div>
    `).join("") : "<p>Your cart is empty.</p>"}
    <div class="total">Total: ৳${total.toFixed(2)}</div>
    ${items.length ? `<button onclick="openCheckout()">Proceed to Checkout</button>` : ""}
  `;
  openModal();
}

function openCheckout() {
  if (!token) {
    showLogin();
    showToast("Please login before ordering.");
    return;
  }
  modalContent.innerHTML = `
    <h2>Checkout</h2>
    <form onsubmit="placeOrder(event)">
      <label>Name</label>
      <input id="customerName" required>
      <label>Phone</label>
      <input id="phone" required placeholder="01XXXXXXXXX">
      <label>Delivery Address</label>
      <textarea id="address" rows="4" required></textarea>
      <button type="submit">Place Order</button>
    </form>
  `;
  openModal();
}

async function placeOrder(event) {
  event.preventDefault();
  try {
    const items = cart.map(item => ({ foodId: item.foodId, quantity: item.quantity }));
    const result = await api("/api/orders", {
      method: "POST",
      body: JSON.stringify({
        items,
        customerName: document.getElementById("customerName").value,
        phone: document.getElementById("phone").value,
        address: document.getElementById("address").value
      })
    });
    cart = [];
    saveCart();
    closeModal();
    showToast(`Order #${result.orderId} placed successfully! Check your email for confirmation.`);
  } catch (error) {
    alert(error.message);
  }
}

function showLogin() {
  modalContent.innerHTML = `
    <h2>Login</h2>
    <form onsubmit="login(event)">
      <input id="loginEmail" type="email" placeholder="Email" required>
      <input id="loginPassword" type="password" placeholder="Password" required>
      <button type="submit">Login</button>
    </form>
    <p style="margin-top:10px;">
      <button class="secondary" onclick="showForgotPassword()" style="background:transparent;color:#0b6b57;padding:5px;font-size:14px;text-decoration:underline;">🔑 Forgot Password?</button>
    </p>
    <p>Don't have an account? <button class="secondary" onclick="showSignup()">Create one</button></p>
  `;
  openModal();
}

function showSignup() {
  modalContent.innerHTML = `
    <h2>Create Account</h2>
    <form onsubmit="signup(event)">
      <input id="signupName" placeholder="Full name" required>
      <input id="signupEmail" type="email" placeholder="Email" required>
      <input id="signupPassword" type="password" placeholder="Password (6+ characters)" minlength="6" required>
      <button type="submit">Sign Up</button>
    </form>
    <p>Already have an account? <button class="secondary" onclick="showLogin()">Login</button></p>
  `;
  openModal();
}

async function signup(event) {
  event.preventDefault();
  try {
    const result = await api("/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({
        name: document.getElementById("signupName").value,
        email: document.getElementById("signupEmail").value,
        password: document.getElementById("signupPassword").value
      })
    });
    token = result.token;
    localStorage.setItem("token", token);
    await updateAuthUI();
    closeModal();
    showToast("Account created! Welcome to FoodHub!");
  } catch (error) {
    alert(error.message);
  }
}

async function login(event) {
  event.preventDefault();
  try {
    const result = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: document.getElementById("loginEmail").value,
        password: document.getElementById("loginPassword").value
      })
    });
    token = result.token;
    localStorage.setItem("token", token);
    await updateAuthUI();
    closeModal();
    showToast("Welcome back!");
  } catch (error) {
    alert(error.message);
  }
}

function logout() {
  if (currentUserId) {
    localStorage.setItem(getCartStorageKey(), JSON.stringify(normalizeCart(cart)));
  }
  token = null;
  localStorage.removeItem("token");
  clearCurrentCartFromMemory();
  updateAuthUI();
  showToast("Logged out.");
}

async function updateAuthUI() {
  if (!token) {
    loginBtn.classList.remove("hidden");
    logoutBtn.classList.add("hidden");
    ordersBtn.classList.add("hidden");
    chatBtn.classList.add("hidden");
    floatingChat.classList.add("hidden");
    welcome.textContent = "";
    return;
  }
  try {
    const user = await api("/api/me");
    const userId = user.id ?? user.userId ?? user.email;
    if (userId == null) throw new Error("Could not identify the logged-in user.");
    loadCartForUser(userId);
    welcome.textContent = `Hi, ${user.name}`;
    loginBtn.classList.add("hidden");
    logoutBtn.classList.remove("hidden");
    ordersBtn.classList.remove("hidden");
    chatBtn.classList.remove("hidden");
    floatingChat.classList.remove("hidden");
  } catch {
    logout();
  }
}

async function showOrders() {
  try {
    const orders = await api("/api/orders");
    modalContent.innerHTML = `
      <h2>My Orders</h2>
      ${orders.length ? orders.map(order => `
        <div class="order-card">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
            <div>
              <strong>Order #${order.id}</strong>
              <p>Status: <span style="font-weight:700;color:${getStatusColor(order.status)};">${order.status}</span></p>
              <p>Total: ৳${order.total.toFixed(2)}</p>
              <p style="font-size:13px;color:#69737d;">${order.items.map(item => `${item.food_name} × ${item.quantity}`).join(", ")}</p>
              <small>${order.created_at}</small>
            </div>
            <button onclick="event.stopPropagation(); openOrderTracking(${order.id})" style="background:#0b6b57;white-space:nowrap;">📦 Track Order</button>
          </div>
        </div>
      `).join("") : "<p>You have no orders yet.</p>"}
    `;
    openModal();
  } catch (error) {
    alert(error.message);
  }
}

function getStatusColor(status) {
  const map = { 'pending': '#f39c12', 'confirmed': '#3498db', 'preparing': '#9b59b6', 'out_for_delivery': '#e67e22', 'delivered': '#27ae60', 'cancelled': '#e74c3c' };
  return map[status.toLowerCase()] || '#17202a';
}

let chatPoller = null;

async function showChat() {
  if (!token) return showLogin();
  try {
    const d = await api('/api/chat');
    renderChat(d, false, true);
    openModal();
    if (chatPoller) clearInterval(chatPoller);
    chatPoller = setInterval(async () => {
      if (!modal.classList.contains('hidden')) {
        try {
          const latest = await api('/api/chat');
          updateChatMessages(latest.messages);
        } catch {}
      }
    }, 2500);
  } catch (e) {
    alert(e.message);
  }
}

function renderChat(d, scrollToBottom = true, buildForm = false) {
  if (buildForm || !document.getElementById('chatMessages')) {
    modalContent.innerHTML = `
      <h2>Chat with FoodHub</h2>
      <div id="chatMessages" class="chat-messages"></div>
      <form class="chat-form" onsubmit="sendChat(event)">
        <input id="chatInput" maxlength="2000" placeholder="Type your message..." autocomplete="off" required>
        <button type="submit">Send</button>
      </form>
    `;
  }
  updateChatMessages(d.messages, scrollToBottom);
}

function updateChatMessages(messages, scrollToBottom = false) {
  const box = document.getElementById('chatMessages');
  if (!box) return;
  const wasNearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  const html = messages.length ? messages.map(m => `<div class="chat-message ${m.sender_role === 'admin' ? 'admin-msg' : 'user-msg'}"><div>${esc(m.message)}</div><small>${m.created_at}</small></div>`).join('') : '<p>No messages yet. How can we help?</p>';
  if (box.innerHTML !== html) box.innerHTML = html;
  if (scrollToBottom || wasNearBottom) box.scrollTop = box.scrollHeight;
}

async function sendChat(e) {
  e.preventDefault();
  const input = document.getElementById('chatInput');
  const message = input.value.trim();
  if (!message) return;
  input.disabled = true;
  try {
    await api('/api/chat/messages', { method: 'POST', body: JSON.stringify({ message }) });
    input.value = '';
    const latest = await api('/api/chat');
    updateChatMessages(latest.messages, true);
    input.focus();
  } catch (e) {
    alert(e.message);
  } finally {
    input.disabled = false;
  }
}

function esc(v) {
  return String(v).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }));
}

function openModal() { modal.classList.remove("hidden"); }
function closeModal() { modal.classList.add("hidden"); if(chatPoller){clearInterval(chatPoller);chatPoller=null;} }

function showToast(message) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 2200);
}

loginBtn.addEventListener("click", showLogin);
logoutBtn.addEventListener("click", logout);
ordersBtn.addEventListener("click", showOrders);
chatBtn.addEventListener("click", showChat);
floatingChat.addEventListener("click", showChat);
document.getElementById("cartBtn").addEventListener("click", showCart);

modal.addEventListener("click", event => { if (event.target === modal) closeModal(); });

cart = normalizeCart(JSON.parse(localStorage.getItem("foodhub_cart_guest") || localStorage.getItem("cart") || "[]"));
updateCartCount();
updateAuthUI();
loadFoods().catch(error => { foodGrid.innerHTML = `<p>Could not load menu: ${error.message}</p>`; });

// ===== HERO SLIDESHOW =====
let slideIndex = 0;
let slideTimer = null;
const slides = document.querySelectorAll('.slide');
const dots = document.querySelectorAll('.dot');

function showSlide(index) {
  if (index < 0) index = slides.length - 1;
  if (index >= slides.length) index = 0;
  slideIndex = index;
  slides.forEach(slide => slide.classList.remove('active'));
  dots.forEach(dot => dot.classList.remove('active'));
  slides[index].classList.add('active');
  if (dots[index]) dots[index].classList.add('active');
}

function changeSlide(direction) {
  if (slideTimer) clearInterval(slideTimer);
  showSlide(slideIndex + direction);
  startSlideTimer();
}

function currentSlide(index) {
  if (slideTimer) clearInterval(slideTimer);
  showSlide(index);
  startSlideTimer();
}

function startSlideTimer() {
  slideTimer = setInterval(() => { showSlide(slideIndex + 1); }, 4000);
}

function initSlideshow() {
  if (slides.length > 0 && dots.length > 0) { showSlide(0); startSlideTimer(); }
}

document.addEventListener('DOMContentLoaded', function() { initSlideshow(); });
if (document.readyState === 'complete' || document.readyState === 'interactive') { setTimeout(initSlideshow, 100); }

// ===== SEARCH FUNCTIONALITY =====
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');
const clearSearchBtn = document.getElementById('clearSearchBtn');
const searchBtn = document.getElementById('searchBtn');
let searchDebounceTimer = null;

document.addEventListener('keydown', function(e) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); searchInput.focus(); searchInput.select(); }
  if (e.key === 'Escape') { hideSearchResults(); searchInput.blur(); }
});

searchInput.addEventListener('focus', function() { this.parentElement.style.borderColor = '#f39c12'; });
searchInput.addEventListener('blur', function() { if (!this.value) this.parentElement.style.borderColor = 'transparent'; });

function performSearch(query) {
  try {
    if (!query || query.trim().length === 0) { hideSearchResults(); return; }
    const searchTerm = query.trim().toLowerCase();
    if (!foods || foods.length === 0) {
      searchResults.innerHTML = `<div class="search-loading"><div class="spinner"></div><p style="margin-top:10px;color:#69737d;font-size:14px;">Loading menu...</p></div>`;
      searchResults.classList.add('visible');
      loadFoods().then(() => { performSearch(query); }).catch(err => { console.error('Failed to reload foods:', err); hideSearchResults(); });
      return;
    }
    const results = foods.map(food => {
      const nameMatch = food.name.toLowerCase().includes(searchTerm);
      const descMatch = food.description.toLowerCase().includes(searchTerm);
      const nameScore = food.name.toLowerCase().indexOf(searchTerm);
      let relevance = 0;
      if (nameMatch) relevance += 10;
      if (descMatch) relevance += 5;
      if (nameScore === 0) relevance += 20;
      if (food.name.toLowerCase() === searchTerm) relevance += 30;
      return { ...food, relevance, match: nameMatch || descMatch };
    }).filter(f => f.match).sort((a, b) => b.relevance - a.relevance);
    displaySearchResults(results, searchTerm);
  } catch (error) { console.error('Search error:', error); }
}

function displaySearchResults(results, searchTerm) {
  try {
    if (!searchResults) { console.error('searchResults element not found!'); return; }
    if (results.length === 0) {
      searchResults.innerHTML = `<div class="search-no-result"><span class="icon">🔍</span><p>No food items found for "<strong>${escapeHtml(searchTerm)}</strong>"</p><small>Try searching with different keywords</small></div>`;
      searchResults.classList.add('visible');
      return;
    }
    const showAll = results.length > 8;
    const displayResults = showAll ? results.slice(0, 8) : results;
    searchResults.innerHTML = displayResults.map(food => {
      const foodId = food.id;
      return `<div class="search-result-item" onclick="showProductDetail(${foodId})">
        <img src="${food.image}" alt="${food.name}" loading="lazy" onerror="this.src='https://via.placeholder.com/48'">
        <div class="search-result-info">
          <div class="name">${highlightMatch(food.name, searchTerm)}${food.rating > 0 ? `<span style="font-size:11px;color:#f39c12;font-weight:600;">⭐ ${food.rating}</span>` : ''}</div>
          <div class="desc">${highlightMatch(food.description || 'Delicious food item', searchTerm)}</div>
          <div class="price">৳${food.price.toFixed(2)}</div>
        </div>
        ${food.category_name ? `<span class="badge">${food.category_name}</span>` : ''}
      </div>`;
    }).join('');
    if (showAll) {
      searchResults.innerHTML += `<div class="search-result-item" onclick="showAllSearchResults('${searchTerm}')" style="justify-content:center;background:linear-gradient(135deg,#f8f9fa,#f0f2f5);border-radius:0 0 20px 20px;"><span style="font-weight:600;color:#0b6b57;">View all ${results.length} results →</span></div>`;
    }
    searchResults.classList.add('visible');
  } catch (error) { console.error('Display error:', error); }
}

function showAllSearchResults(searchTerm) {
  hideSearchResults();
  searchInput.value = searchTerm;
  performSearch(searchTerm);
  document.getElementById('menu').scrollIntoView({ behavior: 'smooth' });
}

function highlightMatch(text, term) {
  if (!text || !term) return text || '';
  try {
    const safeTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${safeTerm})`, 'gi');
    return text.replace(regex, '<mark>$1</mark>');
  } catch (e) { return text; }
}

function escapeHtml(text) { const div = document.createElement('div'); div.textContent = text; return div.innerHTML; }
function hideSearchResults() { if (searchResults) searchResults.classList.remove('visible'); }

if (searchInput) {
  searchInput.addEventListener('input', function(e) {
    try {
      const query = this.value;
      if (query.length > 0) clearSearchBtn.classList.remove('hidden');
      else { clearSearchBtn.classList.add('hidden'); hideSearchResults(); return; }
      if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
      if (query.length >= 2) {
        searchResults.innerHTML = `<div class="search-loading"><div class="spinner"></div><p style="margin-top:10px;color:#69737d;font-size:14px;">Searching...</p></div>`;
        searchResults.classList.add('visible');
      }
      searchDebounceTimer = setTimeout(() => { performSearch(query); }, 300);
    } catch (error) { console.error('Input handler error:', error); }
  });
  searchInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const query = this.value.trim();
      if (query) { performSearch(query); setTimeout(() => { if (searchResults.classList.contains('visible')) searchResults.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 100); }
    }
  });
  searchInput.addEventListener('focus', function() {
    const query = this.value.trim();
    if (query) performSearch(query);
    this.parentElement.style.transform = 'scale(1.02)';
  });
  searchInput.addEventListener('blur', function() { this.parentElement.style.transform = 'scale(1)'; });
}

if (clearSearchBtn) {
  clearSearchBtn.addEventListener('click', function() {
    searchInput.value = '';
    this.classList.add('hidden');
    hideSearchResults();
    searchInput.focus();
    document.querySelectorAll('.food-card.highlight').forEach(el => el.classList.remove('highlight'));
  });
}

if (searchBtn) {
  searchBtn.addEventListener('click', function() {
    const ripple = document.createElement('span');
    ripple.style.position = 'absolute';
    ripple.style.borderRadius = '50%';
    ripple.style.background = 'rgba(255,255,255,0.4)';
    ripple.style.transform = 'scale(0)';
    ripple.style.animation = 'ripple 0.6s linear';
    ripple.style.width = '100px';
    ripple.style.height = '100px';
    ripple.style.top = '-30px';
    ripple.style.left = '-30px';
    this.appendChild(ripple);
    setTimeout(() => ripple.remove(), 600);
    const query = searchInput.value.trim();
    if (query) { performSearch(query); if (searchResults) searchResults.classList.add('visible'); }
  });
}

const styleSheet = document.createElement("style");
styleSheet.textContent = `@keyframes ripple { to { transform: scale(4); opacity: 0; } }`;
document.head.appendChild(styleSheet);

document.addEventListener('click', function(e) {
  const searchContainer = document.querySelector('.search-container');
  if (searchContainer && !searchContainer.contains(e.target)) hideSearchResults();
});

if (searchResults) searchResults.addEventListener('click', function(e) { e.stopPropagation(); });

function initSearch() {
  try {
    if (foods && foods.length > 0) {
      console.log('Search initialized with foods:', foods.length);
      const wrapper = document.querySelector('.search-wrapper');
      if (wrapper && !wrapper.querySelector('.search-shortcut')) {
        const shortcut = document.createElement('span');
        shortcut.className = 'search-shortcut';
        shortcut.innerHTML = '<kbd>⌘</kbd> <kbd>K</kbd>';
        wrapper.appendChild(shortcut);
      }
    } else {
      console.log('Waiting for foods to load...');
      loadFoods().then(() => console.log('Foods loaded for search:', foods.length)).catch(err => console.error('Failed to load foods for search:', err));
    }
  } catch (error) { console.error('Init search error:', error); }
}
setTimeout(initSearch, 500);
window.testSearch = function(query) { performSearch(query); };

// ===== PRODUCT DETAIL =====
const productModal = document.getElementById('productModal');
const productDetailContent = document.getElementById('productDetailContent');

function showProductDetail(foodId) {
  try {
    let food = null;
    food = foods.find(f => f.id === foodId);
    if (!food) food = foods.find(f => String(f.id) === String(foodId));
    if (!food) { const numId = Number(foodId); food = foods.find(f => Number(f.id) === numId); }
    if (!food) { showToast('Product not found!'); return; }
    const related = foods.filter(f => String(f.id) !== String(food.id)).slice(0, 4);
    productDetailContent.innerHTML = `
      <div class="product-detail">
        <img src="${food.image}" alt="${food.name}" class="product-detail-image" onerror="this.src='https://via.placeholder.com/600x300'">
        <div class="product-detail-info">
          <div class="category">${food.category_name || 'Popular'}</div>
          <h2 class="name">${food.name}</h2>
          <p class="description">${food.description || 'Delicious food item prepared with fresh ingredients.'}</p>
          <div class="price">৳${food.price.toFixed(2)}</div>
          <div class="product-detail-actions">
            <button class="add-to-cart-btn" onclick="addToCartAndCloseDetail(${food.id})">🛒 Add to Cart</button>
            <button class="close-btn" onclick="closeProductModal()">Close</button>
          </div>
        </div>
        ${related.length > 0 ? `<div class="product-detail-related"><h3>You might also like</h3><div class="related-grid">${related.map(item => `<div class="related-item" onclick="showProductDetail(${item.id})"><img src="${item.image}" alt="${item.name}" onerror="this.src='https://via.placeholder.com/140x80'"><div class="name">${item.name}</div><div class="price">৳${item.price.toFixed(2)}</div></div>`).join('')}</div></div>` : ''}
      </div>
    `;
    productModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  } catch (error) { console.error('Error showing product detail:', error); showToast('Error loading product details'); }
}

function addToCartAndCloseDetail(foodId) { addToCart(foodId); closeProductModal(); }
function closeProductModal() { productModal.classList.add('hidden'); document.body.style.overflow = 'auto'; }

if (productModal) productModal.addEventListener('click', function(e) { if (e.target === productModal) closeProductModal(); });
document.addEventListener('keydown', function(e) { if (e.key === 'Escape' && !productModal.classList.contains('hidden')) closeProductModal(); });

// ===== CATEGORY FILTER =====
async function loadCategoriesForFilter() {
  try {
    const response = await fetch('/api/categories');
    if (!response.ok) throw new Error('Failed to load categories');
    const categories = await response.json();
    const filterContainer = document.getElementById('categoryFilter');
    if (!filterContainer) return;
    const filteredCount = allFoods.filter(f => f.price >= minPriceFilter && f.price <= maxPriceFilter).length;
    let html = `<button class="category-filter-btn active" onclick="filterByCategory('all', event)" data-category-id="all">All <span class="count">${filteredCount}</span></button>`;
    categories.forEach(cat => {
      const count = allFoods.filter(f => f.category_id === cat.id && f.price >= minPriceFilter && f.price <= maxPriceFilter).length;
      html += `<button class="category-filter-btn" onclick="filterByCategory('${cat.id}', event)" data-category-id="${cat.id}">${cat.icon || '📁'} ${cat.name} <span class="count">${count}</span></button>`;
    });
    filterContainer.innerHTML = html;
  } catch (error) { console.error('Error loading categories for filter:', error); }
}

function filterByCategory(categoryId, event) {
  selectedCategory = categoryId;
  if (event && event.target) {
    document.querySelectorAll('.category-filter-btn').forEach(btn => btn.classList.remove('active'));
    const btn = event.target.closest('.category-filter-btn');
    if (btn) btn.classList.add('active');
  }
  applyFiltersAndSort();
  const categoryName = categoryId === 'all' ? 'All items' : document.querySelector(`.category-filter-btn[data-category-id="${categoryId}"]`)?.textContent?.trim() || 'Category';
  showToast(`Showing: ${categoryName}`);
}

// ===== PRICE FILTER =====
function togglePriceFilter() {
  const body = document.getElementById('priceFilterBody');
  const arrow = document.querySelector('.price-filter-header .arrow');
  body.classList.toggle('open');
  arrow.classList.toggle('open');
}

function applyPriceFilter() {
  const minInput = document.getElementById('minPrice');
  const maxInput = document.getElementById('maxPrice');
  minPriceFilter = parseInt(minInput.value) || 0;
  maxPriceFilter = parseInt(maxInput.value) || 1000;
  if (minPriceFilter > maxPriceFilter) { showToast('Min price cannot be greater than max price!'); return; }
  applyFiltersAndSort();
  showToast(`Filtered: ৳${minPriceFilter} - ৳${maxPriceFilter}`);
  const body = document.getElementById('priceFilterBody');
  const arrow = document.querySelector('.price-filter-header .arrow');
  if (body) body.classList.remove('open');
  if (arrow) arrow.classList.remove('open');
}

function clearPriceFilter() {
  const minInput = document.getElementById('minPrice');
  const maxInput = document.getElementById('maxPrice');
  const sliderMin = document.getElementById('priceSliderMin');
  const sliderMax = document.getElementById('priceSliderMax');
  const displayMin = document.getElementById('displayMinPrice');
  const displayMax = document.getElementById('displayMaxPrice');
  minPriceFilter = 0;
  if (allFoods && allFoods.length > 0) {
    const maxPrice = Math.max(...allFoods.map(f => f.price));
    maxPriceFilter = maxPrice;
    if (sliderMax) sliderMax.value = maxPrice;
    if (displayMax) displayMax.textContent = Math.round(maxPrice);
    if (maxInput) maxInput.placeholder = Math.round(maxPrice);
  } else { maxPriceFilter = 1000; }
  if (minInput) minInput.value = '';
  if (maxInput) maxInput.value = '';
  if (sliderMin) sliderMin.value = 0;
  if (displayMin) displayMin.textContent = '0';
  applyFiltersAndSort();
  showToast('Price filter cleared');
}

function applySort() {
  const select = document.getElementById('sortSelect');
  currentSort = select.value;
  applyFiltersAndSort();
}

function applyFiltersAndSort() {
  let filtered = [...allFoods];
  if (selectedCategory !== 'all') filtered = filtered.filter(f => String(f.category_id) === String(selectedCategory));
  filtered = filtered.filter(f => f.price >= minPriceFilter && f.price <= maxPriceFilter);
  switch(currentSort) {
    case 'price_low': filtered.sort((a, b) => a.price - b.price); break;
    case 'price_high': filtered.sort((a, b) => b.price - a.price); break;
    case 'rating': filtered.sort((a, b) => (b.rating || 0) - (a.rating || 0)); break;
    case 'popularity': filtered.sort((a, b) => (b.popularity || 0) - (a.popularity || 0)); break;
    case 'newest': filtered.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || '')); break;
    default: break;
  }
  foods = filtered;
  renderFoods();
  updateCategoryCounts();
}

function updateCategoryCounts() {
  document.querySelectorAll('.category-filter-btn').forEach(btn => {
    const countSpan = btn.querySelector('.count');
    if (countSpan) {
      const catId = btn.dataset.categoryId || 'all';
      let count = 0;
      if (catId === 'all') count = allFoods.filter(f => f.price >= minPriceFilter && f.price <= maxPriceFilter).length;
      else count = allFoods.filter(f => String(f.category_id) === String(catId) && f.price >= minPriceFilter && f.price <= maxPriceFilter).length;
      countSpan.textContent = count;
    }
  });
}

document.addEventListener('DOMContentLoaded', function() {
  const sliderMin = document.getElementById('priceSliderMin');
  const sliderMax = document.getElementById('priceSliderMax');
  const displayMin = document.getElementById('displayMinPrice');
  const displayMax = document.getElementById('displayMaxPrice');
  const inputMin = document.getElementById('minPrice');
  const inputMax = document.getElementById('maxPrice');
  if (sliderMin && sliderMax) {
    setTimeout(() => {
      if (allFoods && allFoods.length > 0) {
        const maxPrice = Math.max(...allFoods.map(f => f.price));
        sliderMax.max = maxPrice;
        sliderMin.max = maxPrice;
        sliderMax.value = maxPrice;
        displayMax.textContent = Math.round(maxPrice);
        inputMax.placeholder = Math.round(maxPrice);
        maxPriceFilter = maxPrice;
      }
    }, 500);
  }
  if (sliderMin) {
    sliderMin.addEventListener('input', function() {
      const minVal = parseInt(this.value);
      const maxVal = parseInt(sliderMax.value);
      if (minVal > maxVal) { this.value = maxVal; return; }
      displayMin.textContent = minVal;
      inputMin.value = minVal;
    });
  }
  if (sliderMax) {
    sliderMax.addEventListener('input', function() {
      const minVal = parseInt(sliderMin.value);
      const maxVal = parseInt(this.value);
      if (maxVal < minVal) { this.value = minVal; return; }
      displayMax.textContent = maxVal;
      inputMax.value = maxVal;
    });
  }
  if (inputMin) {
    inputMin.addEventListener('input', function() {
      const val = parseInt(this.value) || 0;
      const maxVal = parseInt(inputMax.value) || 1000;
      if (val > maxVal) { this.value = maxVal; return; }
      sliderMin.value = val;
      displayMin.textContent = val;
    });
  }
  if (inputMax) {
    inputMax.addEventListener('input', function() {
      const val = parseInt(this.value) || 1000;
      const minVal = parseInt(inputMin.value) || 0;
      if (val < minVal) { this.value = minVal; return; }
      sliderMax.value = val;
      displayMax.textContent = val;
    });
  }
  document.addEventListener('click', function(e) {
    const priceFilter = document.querySelector('.price-filter');
    if (priceFilter && !priceFilter.contains(e.target)) {
      const body = document.getElementById('priceFilterBody');
      const arrow = document.querySelector('.price-filter-header .arrow');
      if (body) body.classList.remove('open');
      if (arrow) arrow.classList.remove('open');
    }
  });
});

// ===== ORDER TRACKING =====
const orderTrackingModal = document.getElementById('orderTrackingModal');
const orderTrackingContent = document.getElementById('orderTrackingContent');
let trackingInterval = null;
let currentTrackingOrderId = null;

const ORDER_STEPS = [
  { id: 'pending', label: 'Order Placed', icon: '📦', desc: 'Your order has been received' },
  { id: 'confirmed', label: 'Confirmed', icon: '✅', desc: 'Restaurant has confirmed your order' },
  { id: 'preparing', label: 'Preparing', icon: '👨‍🍳', desc: 'Your food is being prepared' },
  { id: 'out_for_delivery', label: 'Out for Delivery', icon: '🛵', desc: 'Delivery person is on the way' },
  { id: 'delivered', label: 'Delivered', icon: '🏠', desc: 'Your order has been delivered!' }
];

const STATUS_ORDER = ['pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered'];

function getStatusIndex(status) { return STATUS_ORDER.indexOf(status.toLowerCase()); }
function getProgressPercentage(status) {
  const index = getStatusIndex(status);
  if (index === -1) return 0;
  return Math.round((index / (STATUS_ORDER.length - 1)) * 100);
}

function openOrderTracking(orderId) {
  currentTrackingOrderId = orderId;
  orderTrackingModal.classList.remove('hidden');
  document.body.style.overflow = 'hidden';
  loadOrderTracking(orderId);
  if (trackingInterval) clearInterval(trackingInterval);
  trackingInterval = setInterval(() => { if (currentTrackingOrderId) loadOrderTracking(currentTrackingOrderId, true); }, 10000);
}

function closeOrderTracking() {
  orderTrackingModal.classList.add('hidden');
  document.body.style.overflow = 'auto';
  if (trackingInterval) { clearInterval(trackingInterval); trackingInterval = null; }
  currentTrackingOrderId = null;
}

async function loadOrderTracking(orderId, silent = false) {
  try {
    const response = await fetch(`/api/orders/track/${orderId}`, { headers: token ? { 'Authorization': `Bearer ${token}` } : {} });
    if (!response.ok) throw new Error('Failed to load order tracking');
    const order = await response.json();
    renderOrderTracking(order);
    if (!silent && currentTrackingOrderId === orderId) showToast(`Order #${orderId}: ${order.status}`);
  } catch (error) {
    console.error('Error loading order tracking:', error);
    if (!silent) showToast('Error loading order details');
  }
}

function renderOrderTracking(order) {
  const currentStatus = order.status.toLowerCase();
  const progress = getProgressPercentage(currentStatus);
  const currentIndex = getStatusIndex(currentStatus);
  const formatDate = (date) => {
    if (!date) return '—';
    const d = new Date(date);
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };
  let timelineHTML = ORDER_STEPS.map((step, index) => {
    const isCompleted = index <= currentIndex;
    const isActive = index === currentIndex;
    const statusTime = order.status_times?.[step.id] || null;
    let statusClass = '';
    if (isActive) statusClass = 'active';
    else if (isCompleted) statusClass = 'completed';
    return `<div class="timeline-item ${statusClass}">
      <div class="timeline-icon">${isCompleted ? '✅' : step.icon}</div>
      <div class="timeline-content">
        <div class="status-name">${step.label}${isCompleted ? '<span class="checkmark">✓</span>' : ''}</div>
        <div class="status-time">${statusTime ? formatDate(statusTime) : 'Waiting...'}</div>
        <div class="status-desc">${isCompleted ? step.desc : 'Pending'}</div>
      </div>
    </div>`;
  }).join('');
  let itemsHTML = order.items?.map(item => `<div class="item"><span class="item-name">${item.food_name || item.name} × ${item.quantity}</span><span class="item-price">৳${(item.price * item.quantity).toFixed(2)}</span></div>`).join('') || '';
  const getStatusClass = (status) => {
    const map = { 'pending': 'pending', 'confirmed': 'confirmed', 'preparing': 'preparing', 'out_for_delivery': 'out_for_delivery', 'delivered': 'delivered', 'cancelled': 'cancelled' };
    return map[status.toLowerCase()] || 'pending';
  };
  orderTrackingContent.innerHTML = `
    <div class="order-tracking">
      <div class="order-tracking-header">
        <span class="order-id">📦 Order #${order.id}</span>
        <span class="order-status-badge ${getStatusClass(order.status)}">${order.status}</span>
      </div>
      <div class="order-progress">
        <div class="progress-bar-container"><div class="progress-bar-fill" style="width: ${progress}%"></div></div>
        <div class="progress-percentage">${progress}% Complete</div>
      </div>
      <div class="order-info-grid">
        <div class="info-item"><span class="label">Customer</span><span class="value">${order.customer_name || '—'}</span></div>
        <div class="info-item"><span class="label">Phone</span><span class="value">${order.phone || '—'}</span></div>
        <div class="info-item"><span class="label">Delivery Address</span><span class="value">${order.address || '—'}</span></div>
        <div class="info-item"><span class="label">Order Date</span><span class="value">${formatDate(order.created_at)}</span></div>
      </div>
      <div class="order-items-list">
        <h4 style="margin:0 0 10px 0;color:#17202a;">Order Items</h4>
        ${itemsHTML}
        <div class="order-total"><span>Total</span><span class="total-amount">৳${Number(order.total).toFixed(2)}</span></div>
      </div>
      <div class="order-timeline">${timelineHTML}</div>
      <div class="tracking-actions">
        <button class="track-again-btn" onclick="loadOrderTracking(${order.id})">🔄 Refresh</button>
        <button class="close-track-btn" onclick="closeOrderTracking()">Close</button>
      </div>
    </div>
  `;
  setTimeout(() => {
    const activeItem = orderTrackingContent.querySelector('.timeline-item.active');
    if (activeItem) activeItem.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 300);
}

if (orderTrackingModal) orderTrackingModal.addEventListener('click', function(e) { if (e.target === orderTrackingModal) closeOrderTracking(); });
document.addEventListener('keydown', function(e) { if (e.key === 'Escape' && !orderTrackingModal.classList.contains('hidden')) closeOrderTracking(); });

// ===== PASSWORD RESET =====
async function forgotPassword(event) {
  event.preventDefault();
  const email = document.getElementById('resetEmail').value.trim();
  if (!email) { showToast('Please enter your email address.'); return; }
  try {
    const response = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Something went wrong.');
    showToast('✅ Password reset link sent to your email!');
    document.getElementById('resetEmail').value = '';
    setTimeout(() => closeModal(), 1500);
  } catch (error) { alert(error.message); }
}

function showForgotPassword() {
  modalContent.innerHTML = `
    <h2>🔑 Reset Password</h2>
    <p style="color:#69737d;margin-bottom:15px;">Enter your email address and we'll send you a link to reset your password.</p>
    <form onsubmit="forgotPassword(event)">
      <input id="resetEmail" type="email" placeholder="Your email address" required>
      <button type="submit">📧 Send Reset Link</button>
    </form>
    <p style="margin-top:15px;"><button class="secondary" onclick="showLogin()">← Back to Login</button></p>
  `;
  openModal();
}