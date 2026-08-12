let foods = [];
let cart = [];
let token = localStorage.getItem("token");
let currentUserId = null;
let allFoods = [];
let selectedCategory = 'all';

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
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    foods = data;
    allFoods = [...data];
    renderFoods();
    loadCategoriesForFilter();
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
    const items = cart.map(item => ({
      foodId: item.foodId,
      quantity: item.quantity
    }));

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
    showToast(`Order #${result.orderId} placed successfully!`);
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
    <p>Don't have an account?
      <button class="secondary" onclick="showSignup()">Create one</button>
    </p>
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
    <p>Already have an account?
      <button class="secondary" onclick="showLogin()">Login</button>
    </p>
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
    showToast("Account created!");
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
          <strong>Order #${order.id}</strong>
          <p>Status: ${order.status}</p>
          <p>Total: ৳${order.total.toFixed(2)}</p>
          <p>${order.items.map(item => `${item.food_name} × ${item.quantity}`).join(", ")}</p>
          <small>${order.created_at}</small>
        </div>
      `).join("") : "<p>You have no orders yet.</p>"}
    `;

    openModal();
  } catch (error) {
    alert(error.message);
  }
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
  const html = messages.length
    ? messages.map(m => `<div class="chat-message ${m.sender_role === 'admin' ? 'admin-msg' : 'user-msg'}"><div>${esc(m.message)}</div><small>${m.created_at}</small></div>`).join('')
    : '<p>No messages yet. How can we help?</p>';

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
    await api('/api/chat/messages', {
      method: 'POST',
      body: JSON.stringify({ message })
    });
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
  return String(v).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[c]));
}

function openModal() {
  modal.classList.remove("hidden");
}

function closeModal() {
  modal.classList.add("hidden");
  if(chatPoller){clearInterval(chatPoller);chatPoller=null;}
}

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

modal.addEventListener("click", event => {
  if (event.target === modal) closeModal();
});

cart = normalizeCart(JSON.parse(localStorage.getItem("foodhub_cart_guest") || localStorage.getItem("cart") || "[]"));
updateCartCount();
updateAuthUI();
loadFoods().catch(error => {
  foodGrid.innerHTML = `<p>Could not load menu: ${error.message}</p>`;
});

// ===== HERO SLIDESHOW =====
let slideIndex = 0;
let slideTimer = null;
const slides = document.querySelectorAll('.slide');
const dots = document.querySelectorAll('.dot');

function showSlide(index) {
  if (index < 0) index = slides.length - 1;
  if (index >= slides.length) index = 0;
  slideIndex = index;

  slides.forEach(slide => {
    slide.classList.remove('active');
  });

  dots.forEach(dot => {
    dot.classList.remove('active');
  });

  slides[index].classList.add('active');
  if (dots[index]) {
    dots[index].classList.add('active');
  }
}

function changeSlide(direction) {
  if (slideTimer) {
    clearInterval(slideTimer);
  }
  showSlide(slideIndex + direction);
  startSlideTimer();
}

function currentSlide(index) {
  if (slideTimer) {
    clearInterval(slideTimer);
  }
  showSlide(index);
  startSlideTimer();
}

function startSlideTimer() {
  slideTimer = setInterval(() => {
    showSlide(slideIndex + 1);
  }, 4000);
}

function initSlideshow() {
  if (slides.length > 0 && dots.length > 0) {
    showSlide(0);
    startSlideTimer();
  }
}

document.addEventListener('DOMContentLoaded', function() {
  initSlideshow();
});

if (document.readyState === 'complete' || document.readyState === 'interactive') {
  setTimeout(initSlideshow, 100);
}

// ===== SEARCH FUNCTIONALITY =====
const searchInput = document.getElementById('searchInput');
const searchResults = document.getElementById('searchResults');
const clearSearchBtn = document.getElementById('clearSearchBtn');
const searchBtn = document.getElementById('searchBtn');
let searchDebounceTimer = null;

function performSearch(query) {
  try {
    if (!query || query.trim().length === 0) {
      hideSearchResults();
      return;
    }

    const searchTerm = query.trim().toLowerCase();
    
    if (!foods || foods.length === 0) {
      console.warn('Foods not loaded yet');
      loadFoods().then(() => {
        performSearch(query);
      }).catch(err => {
        console.error('Failed to reload foods:', err);
      });
      return;
    }

    console.log('Searching for:', searchTerm, 'Total foods:', foods.length);
    
    const results = foods.filter(food => {
      const nameMatch = food.name.toLowerCase().includes(searchTerm);
      const descMatch = food.description.toLowerCase().includes(searchTerm);
      return nameMatch || descMatch;
    });

    console.log('Found results:', results.length);
    displaySearchResults(results, searchTerm);
  } catch (error) {
    console.error('Search error:', error);
  }
}

function displaySearchResults(results, searchTerm) {
  try {
    if (!searchResults) {
      console.error('searchResults element not found!');
      return;
    }

    if (results.length === 0) {
      searchResults.innerHTML = `
        <div class="search-no-result">
          <span>🍽️</span>
          <p>No food items found for "<strong>${escapeHtml(searchTerm)}</strong>"</p>
          <small>Try searching with different keywords</small>
        </div>
      `;
      searchResults.classList.add('visible');
      console.log('Showing no results message');
      return;
    }

    searchResults.innerHTML = results.map(food => {
      const foodId = food.id;
      return `
        <div class="search-result-item" onclick="showProductDetail(${foodId})">
          <img src="${food.image}" alt="${food.name}" loading="lazy" onerror="this.src='https://via.placeholder.com/45'">
          <div class="search-result-info">
            <div class="name">${highlightMatch(food.name, searchTerm)}</div>
            <div class="desc">${highlightMatch(food.description, searchTerm)}</div>
            <div class="price">৳${food.price.toFixed(2)}</div>
          </div>
        </div>
      `;
    }).join('');

    searchResults.classList.add('visible');
    console.log('Search results displayed, count:', results.length);
  } catch (error) {
    console.error('Display error:', error);
  }
}

function highlightMatch(text, term) {
  if (!text || !term) return text || '';
  try {
    const safeTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${safeTerm})`, 'gi');
    return text.replace(regex, '<mark style="background:#f39c12; color:white; padding:0 3px; border-radius:3px;">$1</mark>');
  } catch (e) {
    return text;
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function hideSearchResults() {
  if (searchResults) {
    searchResults.classList.remove('visible');
    console.log('Search results hidden');
  }
}

if (searchInput) {
  searchInput.addEventListener('input', function(e) {
    try {
      const query = this.value;
      
      if (query.length > 0) {
        clearSearchBtn.classList.remove('hidden');
      } else {
        clearSearchBtn.classList.add('hidden');
        hideSearchResults();
        return;
      }

      if (searchDebounceTimer) {
        clearTimeout(searchDebounceTimer);
      }

      searchDebounceTimer = setTimeout(() => {
        performSearch(query);
      }, 300);
    } catch (error) {
      console.error('Input handler error:', error);
    }
  });

  searchInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      const query = this.value.trim();
      if (query) {
        performSearch(query);
        if (searchResults) {
          searchResults.classList.add('visible');
        }
      }
    }
  });

  searchInput.addEventListener('focus', function() {
    const query = this.value.trim();
    if (query) {
      performSearch(query);
    }
  });
}

if (clearSearchBtn) {
  clearSearchBtn.addEventListener('click', function() {
    searchInput.value = '';
    this.classList.add('hidden');
    hideSearchResults();
    searchInput.focus();
    document.querySelectorAll('.food-card.highlight').forEach(el => {
      el.classList.remove('highlight');
    });
  });
}

if (searchBtn) {
  searchBtn.addEventListener('click', function() {
    const query = searchInput.value.trim();
    if (query) {
      performSearch(query);
      if (searchResults) {
        searchResults.classList.add('visible');
      }
    }
  });
}

document.addEventListener('click', function(e) {
  const searchContainer = document.querySelector('.search-container');
  if (searchContainer && !searchContainer.contains(e.target)) {
    hideSearchResults();
  }
});

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    hideSearchResults();
    if (searchInput) searchInput.blur();
  }
});

if (searchResults) {
  searchResults.addEventListener('click', function(e) {
    e.stopPropagation();
  });
}

function initSearch() {
  try {
    if (foods && foods.length > 0) {
      console.log('Search initialized with foods:', foods.length);
    } else {
      console.log('Waiting for foods to load...');
      loadFoods().then(() => {
        console.log('Foods loaded for search:', foods.length);
      }).catch(err => {
        console.error('Failed to load foods for search:', err);
      });
    }
  } catch (error) {
    console.error('Init search error:', error);
  }
}

setTimeout(initSearch, 500);

window.testSearch = function(query) {
  performSearch(query);
};

// ===== PRODUCT DETAIL FUNCTIONALITY =====
const productModal = document.getElementById('productModal');
const productDetailContent = document.getElementById('productDetailContent');

function showProductDetail(foodId) {
  try {
    console.log('showProductDetail called with:', foodId);
    
    let food = null;
    food = foods.find(f => f.id === foodId);
    if (!food) food = foods.find(f => String(f.id) === String(foodId));
    if (!food) {
      const numId = Number(foodId);
      food = foods.find(f => Number(f.id) === numId);
    }
    
    if (!food) {
      console.error('Product not found for ID:', foodId);
      showToast('Product not found!');
      return;
    }

    console.log('Found food:', food);

    const related = foods
      .filter(f => String(f.id) !== String(food.id))
      .slice(0, 4);

    productDetailContent.innerHTML = `
      <div class="product-detail">
        <img src="${food.image}" alt="${food.name}" class="product-detail-image" onerror="this.src='https://via.placeholder.com/600x300'">
        
        <div class="product-detail-info">
          <div class="category">${food.category_name || 'Popular'}</div>
          <h2 class="name">${food.name}</h2>
          <p class="description">${food.description || 'Delicious food item prepared with fresh ingredients.'}</p>
          <div class="price">৳${food.price.toFixed(2)}</div>
          
          <div class="product-detail-actions">
            <button class="add-to-cart-btn" onclick="addToCartAndCloseDetail(${food.id})">
              🛒 Add to Cart
            </button>
            <button class="close-btn" onclick="closeProductModal()">Close</button>
          </div>
        </div>
        
        ${related.length > 0 ? `
          <div class="product-detail-related">
            <h3>You might also like</h3>
            <div class="related-grid">
              ${related.map(item => `
                <div class="related-item" onclick="showProductDetail(${item.id})">
                  <img src="${item.image}" alt="${item.name}" onerror="this.src='https://via.placeholder.com/140x80'">
                  <div class="name">${item.name}</div>
                  <div class="price">৳${item.price.toFixed(2)}</div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;

    productModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

  } catch (error) {
    console.error('Error showing product detail:', error);
    showToast('Error loading product details');
  }
}

function addToCartAndCloseDetail(foodId) {
  addToCart(foodId);
  closeProductModal();
}

function closeProductModal() {
  productModal.classList.add('hidden');
  document.body.style.overflow = 'auto';
}

if (productModal) {
  productModal.addEventListener('click', function(e) {
    if (e.target === productModal) {
      closeProductModal();
    }
  });
}

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape' && !productModal.classList.contains('hidden')) {
    closeProductModal();
  }
});

// ===== CATEGORY FILTER FUNCTIONALITY =====
async function loadCategoriesForFilter() {
  try {
    const response = await fetch('/api/categories');
    if (!response.ok) throw new Error('Failed to load categories');
    const categories = await response.json();
    
    const filterContainer = document.getElementById('categoryFilter');
    if (!filterContainer) return;
    
    let html = `<button class="category-filter-btn active" onclick="filterByCategory('all', event)">
      All <span class="count" id="allCount">${allFoods.length}</span>
    </button>`;
    
    categories.forEach(cat => {
      const count = allFoods.filter(f => f.category_id === cat.id).length;
      html += `<button class="category-filter-btn" onclick="filterByCategory('${cat.id}', event)" data-category-id="${cat.id}">
        ${cat.icon || '📁'} ${cat.name} <span class="count">${count}</span>
      </button>`;
    });
    
    filterContainer.innerHTML = html;
  } catch (error) {
    console.error('Error loading categories for filter:', error);
  }
}

function filterByCategory(categoryId, event) {
  selectedCategory = categoryId;
  
  if (event && event.target) {
    document.querySelectorAll('.category-filter-btn').forEach(btn => {
      btn.classList.remove('active');
    });
    event.target.closest('.category-filter-btn').classList.add('active');
  }
  
  if (categoryId === 'all') {
    foods = [...allFoods];
  } else {
    foods = allFoods.filter(f => String(f.category_id) === String(categoryId));
  }
  
  renderFoods();
  
  const categoryName = categoryId === 'all' ? 'All items' : 
    document.querySelector(`.category-filter-btn[data-category-id="${categoryId}"]`)?.textContent?.trim() || 'Category';
  showToast(`Showing: ${categoryName}`);
}