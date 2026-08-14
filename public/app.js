let foods = [];
let cart = [];
let token = localStorage.getItem("token");
let currentUserId = null;
let allFoods = [];
let selectedCategory = 'all';
let minPriceFilter = 0;
let maxPriceFilter = 1000;
let currentSort = 'default';
let currentOrderPage = 1;
let chatPoller = null;

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
  if (!userId) return;
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
const cartBtn = document.getElementById("cartBtn");
const floatingChat = document.getElementById("floatingChat");

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
    
    loadPopularFoods();
    loadCategoryWiseFoods();
    loadFeaturedProduct();
     loadFaqs();
    
    console.log('Foods loaded successfully:', foods.length);
    return foods;
  } catch (error) {
    console.error('Error loading foods:', error);
    foodGrid.innerHTML = `<p>Could not load menu: ${error.message}</p>`;
    throw error;
  }
}
// ===== POPULAR FOODS =====
function loadPopularFoods() {
  const container = document.getElementById('popularFoodGrid');
  if (!container) return;
  
  // পপুলারিটি অনুযায়ী সাজান (যদি পপুলারিটি ডাটা থাকে)
  let popular = [...foods];
  popular.sort((a, b) => (b.popularity || 0) - (a.popularity || 0));
  popular = popular.slice(0, 8); // ৮টি প্রোডাক্ট দেখান
  
  if (popular.length === 0) {
    container.innerHTML = `<p style="text-align:center;color:#69737d;grid-column:1/-1;">No popular items yet.</p>`;
    return;
  }
  
  container.innerHTML = popular.map(food => `
    <article class="food-card" onclick="showProductDetail(${food.id})">
      <img src="${food.image}" alt="${food.name}" loading="lazy" onerror="this.src='https://via.placeholder.com/270x200?text=No+Image'">
      <div class="food-body">
        <div class="food-tags">
          ${food.category_name ? `<span class="tag">${food.category_icon || '📁'} ${food.category_name}</span>` : ''}
          <span class="tag" style="background:#f39c12;color:white;">🔥 Popular</span>
        </div>
        <h3>${food.name}</h3>
        <div class="food-meta">
          <span class="rating">⭐ ${food.rating || 0}</span>
          <span class="popularity">🔥 ${food.popularity || 0} orders</span>
        </div>
        <p>${food.description}</p>
        <div class="price">৳${food.price.toFixed(2)}</div>
        <button class="add-btn" onclick="event.stopPropagation(); addToCart(${food.id})">
          🛒 Add to Cart
        </button>
      </div>
    </article>
  `).join('');
}

// ===== CATEGORY WISE FOODS =====
async function loadCategoryWiseFoods() {
  const container = document.getElementById('categoryWiseContainer');
  if (!container) return;
  
  try {
    // ক্যাটাগরি লোড করুন
    const categoriesRes = await fetch('/api/categories');
    const categories = await categoriesRes.json();
    
    if (!categories || categories.length === 0) {
      container.innerHTML = `<p style="text-align:center;color:#69737d;">No categories available.</p>`;
      return;
    }
    
    let html = '<div class="category-wise-container">';
    
    // প্রতি ক্যাটাগরিতে ৪টি করে প্রোডাক্ট দেখান
    for (const cat of categories) {
      const catFoods = foods.filter(f => f.category_id === cat.id).slice(0, 4);
      
      if (catFoods.length === 0) continue;
      
      html += `
        <div class="category-block">
          <div class="category-header">
            <h3><span class="cat-icon">${cat.icon || '📁'}</span> ${cat.name}</h3>
            <a class="view-all" onclick="filterByCategory('${cat.id}')">View All →</a>
          </div>
          <div class="category-food-grid">
      `;
      
      for (const food of catFoods) {
        html += `
          <div class="category-food-item" onclick="showProductDetail(${food.id})">
            <img src="${food.image}" alt="${food.name}" onerror="this.src='https://via.placeholder.com/200x140?text=No+Image'">
            <div class="food-info">
              <div class="name">${food.name}</div>
              <div class="price">৳${food.price.toFixed(2)}</div>
              <button class="order-btn" onclick="event.stopPropagation(); addToCart(${food.id})">🛒 Add to Cart</button>
            </div>
          </div>
        `;
      }
      
      html += `
          </div>
        </div>
      `;
    }
    
    html += '</div>';
    container.innerHTML = html;
    
  } catch (error) {
    console.error('Error loading category wise foods:', error);
    container.innerHTML = `<p style="text-align:center;color:#e74c3c;">Error loading categories.</p>`;
  }
}

// ===== FEATURED PRODUCT =====
function loadFeaturedProduct() {
  if (!foods || foods.length === 0) return;
  
  // ফিচার্ড প্রোডাক্ট হিসেবে প্রথম প্রোডাক্ট বা রেটিং অনুযায়ী বাছাই
  let featured = [...foods];
  featured.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  const product = featured[0] || foods[0];
  
  const img = document.getElementById('featuredProductImage');
  const name = document.getElementById('featuredProductName');
  const desc = document.getElementById('featuredProductDesc');
  const originalPrice = document.getElementById('featuredOriginalPrice');
  const discountPrice = document.getElementById('featuredDiscountPrice');
  const orderBtn = document.querySelector('.featured-order-btn');
  const detailBtn = document.querySelector('.featured-detail-btn');
  
  if (img) img.src = product.image;
  if (name) name.textContent = product.name;
  if (desc) desc.textContent = product.description || 'Delicious food prepared with fresh ingredients.';
  if (originalPrice) originalPrice.textContent = `৳${(product.price * 1.15).toFixed(2)}`;
  if (discountPrice) discountPrice.textContent = `৳${product.price.toFixed(2)}`;
  
  if (orderBtn) orderBtn.onclick = () => showProductDetail(product.id);
  if (detailBtn) detailBtn.onclick = () => showProductDetail(product.id);
}
function renderFoods() {
  foodGrid.innerHTML = foods.map(food => {
    const foodId = food.id;
    const hasDiscount = food.discount_percent > 0;
    const discountPrice = hasDiscount ? food.price - (food.price * food.discount_percent / 100) : null;
    const isFav = isFavorited(foodId);
    
    return `
      <article class="food-card" onclick="showProductDetail(${foodId})">
        <img src="${food.image}" alt="${food.name}" loading="lazy">
        ${hasDiscount ? `<div class="discount-badge">-${food.discount_percent}%</div>` : ''}
        <button class="favorite-btn ${isFav ? 'favorited' : ''}" 
                data-food-id="${foodId}" 
                onclick="event.stopPropagation();toggleFavorite(${foodId}, event)">
          ${isFav ? '❤️' : '🤍'}
        </button>
        <div class="food-body">
          <div class="food-tags">
            ${food.category_name ? `<span class="tag">${food.category_icon || '📁'} ${food.category_name}</span>` : ''}
          </div>
          <h3>${food.name}</h3>
          <div class="food-meta">
            <span class="rating">⭐ ${food.rating || 0}</span>
            <span class="popularity">🔥 ${food.popularity || 0} orders</span>
          </div>
          <p>${food.description}</p>
          <div class="price">
            ${hasDiscount ? `
              <span class="original-price">৳${food.price.toFixed(2)}</span>
              <span class="discount-price">৳${discountPrice.toFixed(2)}</span>
            ` : `
              <span>৳${food.price.toFixed(2)}</span>
            `}
          </div>
          <button class="add-btn" onclick="event.stopPropagation(); addToCart(${foodId})">
            🛒 Add to Cart
          </button>
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
    <h2>🛒 Your Cart</h2>
    ${items.length ? items.map(item => `
      <div class="cart-item">
        <div class="item-name" onclick="showProductDetail(${item.id})">
          <strong>${item.name}</strong>
          <small>৳${item.price} × ${item.quantity}</small>
        </div>
        <div class="qty">
          <button onclick="event.stopPropagation(); changeQty(${item.id}, -1)">−</button>
          <span>${item.quantity}</span>
          <button onclick="event.stopPropagation(); changeQty(${item.id}, 1)">+</button>
        </div>
      </div>
    `).join("") : "<p style='text-align:center;padding:30px;color:#69737d;'>Your cart is empty. 🍽️</p>"}
    <div class="total">Total: ৳${total.toFixed(2)}</div>
    ${items.length ? `<button class="checkout-btn" onclick="openCheckout()">🛒 Proceed to Checkout</button>` : ""}
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
    <h2>📋 Checkout</h2>
    <form onsubmit="placeOrder(event)">
      <div class="form-group">
        <label>👤 Full Name</label>
        <input id="customerName" required placeholder="Enter your full name">
      </div>
      <div class="form-group">
        <label>📱 Phone Number</label>
        <input id="phone" required placeholder="01XXXXXXXXX">
      </div>
      <div class="form-group">
        <label>📍 Delivery Address</label>
        <textarea id="address" rows="4" required placeholder="Enter your full delivery address"></textarea>
      </div>
      <button type="submit" class="checkout-btn">✅ Place Order</button>
    </form>
  `;
  openModal();
}

// ===== PLACE ORDER (UPDATED) =====
async function placeOrder(event) {
  event.preventDefault();
  
  let address = '';
  let latitude = null;
  let longitude = null;
  
  // Get address based on mode
  if (addressMode === 'auto') {
    address = document.getElementById('autoAddress')?.value || '';
    latitude = document.getElementById('autoLat')?.value || null;
    longitude = document.getElementById('autoLng')?.value || null;
    
    if (!address || address.trim() === '') {
      showToast('📍 Could not detect your location. Please try again or use manual address.', 'error');
      return;
    }
  } else {
    address = document.getElementById('address')?.value?.trim() || '';
    if (!address) {
      showToast('Please enter your delivery address.', 'error');
      return;
    }
  }
  
  // Validate name and phone
  const name = document.getElementById('customerName')?.value?.trim() || '';
  const phone = document.getElementById('phone')?.value?.trim() || '';
  
  if (!name) {
    showToast('Please enter your full name.', 'error');
    return;
  }
  
  // Phone validation (Bangladesh)
  const phoneRegex = /^(01|8801)[0-9]{9}$/;
  if (!phone || !phoneRegex.test(phone)) {
    showToast('Please enter a valid phone number (e.g., 01XXXXXXXXX).', 'error');
    return;
  }
  
  // Save data for next time
  try {
    localStorage.setItem('checkout_name', name);
    localStorage.setItem('checkout_phone', phone);
    if (addressMode === 'manual') {
      localStorage.setItem('checkout_address', address);
    }
  } catch(e) {}
  
  try {
    const items = cart.map(item => ({ 
      foodId: parseInt(item.foodId), 
      quantity: parseInt(item.quantity) 
    }));
    
    const instructions = document.getElementById('instructions')?.value || '';
    const paymentMethod = document.getElementById('paymentMethod')?.value || 'cash';
    
    // Show loading state
    const submitBtn = event.target.querySelector('button[type="submit"]');
    const originalText = submitBtn?.textContent || '';
    if (submitBtn) {
      submitBtn.textContent = '⏳ Placing Order...';
      submitBtn.disabled = true;
    }
    
    const result = await api("/api/orders", {
      method: "POST",
      body: JSON.stringify({
        items,
        customerName: name,
        phone: phone,
        address: address,
        instructions: instructions,
        paymentMethod: paymentMethod,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        addressMode: addressMode
      })
    });
    
    // Clear cart
    cart = [];
    saveCart();
    closeModal();
    
    // Clear stored address if it was auto
    if (addressMode === 'auto') {
      try { localStorage.removeItem('checkout_address'); } catch(e) {}
    }
    
    showToast(`🎉 Order #${result.orderId} placed successfully! Check your email for confirmation.`, 'success');
    
    // Reset submit button
    if (submitBtn) {
      submitBtn.textContent = originalText;
      submitBtn.disabled = false;
    }
    
  } catch (error) {
    console.error('Order error:', error);
    showToast(error.message || 'Could not place order. Please try again.', 'error');
    
    // Reset submit button
    const submitBtn = event.target.querySelector('button[type="submit"]');
    if (submitBtn) {
      const total = cart.reduce((sum, item) => {
        const food = foods.find(f => String(f.id) === String(item.foodId));
        return sum + (food ? food.price * item.quantity : 0);
      }, 0);
      submitBtn.textContent = `✅ Place Order - ৳${total.toFixed(2)}`;
      submitBtn.disabled = false;
    }
  }
}

function showLogin() {
  modalContent.innerHTML = `
    <h2>🔑 Login</h2>
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
    <h2>📝 Create Account</h2>
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
  closeDropdown();
  if (currentUserId) {
    localStorage.setItem(getCartStorageKey(), JSON.stringify(normalizeCart(cart)));
  }
  token = null;
  localStorage.removeItem("token");
  clearCurrentCartFromMemory();
  updateAuthUI();
  showToast("Logged out.");
}

// ===== USER DROPDOWN =====
document.addEventListener('DOMContentLoaded', function() {
  const toggle = document.getElementById('dropdownToggle');
  const menu = document.getElementById('dropdownMenu');

  if (toggle && menu) {
    toggle.addEventListener('click', function(e) {
      e.stopPropagation();
      menu.classList.toggle('open');
      toggle.classList.toggle('active');
    });

    document.addEventListener('click', function(e) {
      const dropdown = document.getElementById('userDropdown');
      if (dropdown && !dropdown.contains(e.target)) {
        menu.classList.remove('open');
        toggle.classList.remove('active');
      }
    });
  }
});

function closeDropdown() {
  const menu = document.getElementById('dropdownMenu');
  const toggle = document.getElementById('dropdownToggle');
  if (menu) menu.classList.remove('open');
  if (toggle) toggle.classList.remove('active');
}

async function updateAuthUI() {
  const loginBtn = document.getElementById("loginBtn");
  const userDropdown = document.getElementById("userDropdown");
  const userName = document.getElementById("userName");
  const userAvatar = document.getElementById("userAvatar");
  const floatingChat = document.getElementById("floatingChat");

  if (!token) {
    if (loginBtn) loginBtn.classList.remove("hidden");
    if (userDropdown) userDropdown.classList.add("hidden");
    if (floatingChat) floatingChat.classList.add("hidden");
    userFavorites = [];
    return;
  }
  try {
    const user = await api("/api/me");
    const userId = user.id ?? user.userId ?? user.email;
    if (userId == null) throw new Error("Could not identify the logged-in user.");
    loadCartForUser(userId);
    
    if (userName) userName.textContent = user.name || "User";
    if (userAvatar) userAvatar.textContent = user.name ? user.name.charAt(0).toUpperCase() : "👤";
    
    if (loginBtn) loginBtn.classList.add("hidden");
    if (userDropdown) userDropdown.classList.remove("hidden");
    if (floatingChat) floatingChat.classList.remove("hidden");
    
    // Load favorites after login
    await loadFavorites();
    
  } catch {
    logout();
  }
}

// ===== MY ORDERS (ড্রপডাউন থেকে) =====
async function showOrders() {
  closeDropdown();
  if (!token) {
    showLogin();
    return;
  }
  try {
    const orders = await api("/api/orders");
    modalContent.innerHTML = `
      <h2>📦 My Orders</h2>
      ${orders.length ? orders.map(order => `
        <div class="order-card">
          <div class="order-header">
            <span class="order-id">Order #${order.id}</span>
            <span class="order-status ${order.status.toLowerCase().replace(/ /g, '_')}">${order.status}</span>
          </div>
          <div class="order-details">
            <span>📅 ${new Date(order.created_at).toLocaleDateString()}</span>
            <span class="order-total">৳${order.total.toFixed(2)}</span>
          </div>
          <div class="order-items">
            🍽️ ${order.items.map(item => `${item.food_name} × ${item.quantity}`).join(", ")}
          </div>
          <div class="order-actions">
            <button class="track-btn" onclick="event.stopPropagation(); openOrderTracking(${order.id})">📦 Track Order</button>
            ${order.status === 'Delivered' ? `
              <button class="review-btn" onclick="event.stopPropagation(); showReviewForOrder(${order.id})">⭐ Review</button>
            ` : ''}
          </div>
        </div>
      `).join("") : "<p style='text-align:center;padding:30px;color:#69737d;'>You have no orders yet. 🍽️</p>"}
    `;
    openModal();
  } catch (error) {
    alert(error.message);
  }
}

// ===== ORDER HISTORY (ড্রপডাউন থেকে) =====
async function showOrderHistory() {
  closeDropdown();
  if (!token) {
    showLogin();
    return;
  }
  
  modalContent.innerHTML = `
    <h2>📦 Order History</h2>
    
    <div id="orderSummary" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(80px,1fr));gap:10px;margin:15px 0;padding:15px;background:#f8f9fa;border-radius:12px;">
      <div style="text-align:center;">
        <div style="font-size:20px;font-weight:800;color:#17202a;" id="totalOrders">0</div>
        <div style="font-size:11px;color:#69737d;">Total</div>
      </div>
      <div style="text-align:center;">
        <div style="font-size:20px;font-weight:800;color:#f39c12;" id="pendingOrders">0</div>
        <div style="font-size:11px;color:#69737d;">Pending</div>
      </div>
      <div style="text-align:center;">
        <div style="font-size:20px;font-weight:800;color:#3498db;" id="confirmedOrders">0</div>
        <div style="font-size:11px;color:#69737d;">Confirmed</div>
      </div>
      <div style="text-align:center;">
        <div style="font-size:20px;font-weight:800;color:#27ae60;" id="deliveredOrders">0</div>
        <div style="font-size:11px;color:#69737d;">Delivered</div>
      </div>
      <div style="text-align:center;">
        <div style="font-size:20px;font-weight:800;color:#0b6b57;" id="totalSpent">৳0</div>
        <div style="font-size:11px;color:#69737d;">Total Spent</div>
      </div>
    </div>
    
    <div style="display:flex;flex-wrap:wrap;gap:10px;margin:15px 0;padding:12px;background:#f8f9fa;border-radius:10px;">
      <div style="flex:1;min-width:150px;">
        <select id="orderHistoryFilter" onchange="filterOrderHistory()" style="width:100%;padding:10px 14px;border:2px solid #e9ecef;border-radius:8px;font-size:14px;">
          <option value="all">📋 All Orders</option>
          <option value="Pending">⏳ Pending</option>
          <option value="Confirmed">✅ Confirmed</option>
          <option value="Preparing">👨‍🍳 Preparing</option>
          <option value="Out for Delivery">🛵 Out for Delivery</option>
          <option value="Delivered">🏠 Delivered</option>
          <option value="Cancelled">❌ Cancelled</option>
        </select>
      </div>
      <div style="flex:1;min-width:150px;">
        <input type="text" id="orderHistorySearch" placeholder="🔍 Search by Order #" oninput="filterOrderHistory()" style="width:100%;padding:10px 14px;border:2px solid #e9ecef;border-radius:8px;font-size:14px;">
      </div>
      <button onclick="resetOrderFilters()" style="padding:10px 20px;background:#e9ecef;border:none;border-radius:8px;font-weight:600;cursor:pointer;">🔄 Reset</button>
    </div>
    
    <div id="orderHistoryList" style="max-height:500px;overflow-y:auto;padding-right:4px;">
      <div style="text-align:center;padding:40px;color:#69737d;">
        <div class="spinner" style="width:30px;height:30px;border:3px solid #f0f2f5;border-top:3px solid #f39c12;border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto;"></div>
        <p style="margin-top:10px;">Loading orders...</p>
      </div>
    </div>
    
    <div id="orderPagination" style="display:flex;justify-content:center;gap:8px;margin-top:15px;padding-top:15px;border-top:1px solid #f0f2f5;"></div>
    
    <button onclick="closeModal()" style="width:100%;padding:12px;background:#e9ecef;border:none;border-radius:8px;margin-top:15px;cursor:pointer;font-weight:600;">Close</button>
  `;
  
  openModal();
  await loadOrderSummary();
  await loadOrderHistory();
}

async function loadOrderSummary() {
  try {
    const data = await api('/api/orders/summary');
    document.getElementById('totalOrders').textContent = data.total_orders || 0;
    document.getElementById('pendingOrders').textContent = data.pending || 0;
    document.getElementById('confirmedOrders').textContent = data.confirmed || 0;
    document.getElementById('deliveredOrders').textContent = data.delivered || 0;
    document.getElementById('totalSpent').textContent = '৳' + (data.total_spent || 0).toFixed(2);
  } catch (error) {
    console.error('Error loading order summary:', error);
  }
}

async function loadOrderHistory(page = 1) {
  try {
    currentOrderPage = page;
    const filter = document.getElementById('orderHistoryFilter')?.value || 'all';
    const search = document.getElementById('orderHistorySearch')?.value || '';
    
    const url = `/api/orders/history?page=${page}&limit=10&status=${filter}&search=${search}`;
    const data = await api(url);
    
    renderOrderHistory(data);
    renderPagination(data.pagination);
  } catch (error) {
    console.error('Error loading order history:', error);
    document.getElementById('orderHistoryList').innerHTML = `
      <div style="text-align:center;padding:40px;color:#e74c3c;">
        <p>⚠️ ${error.message}</p>
        <button onclick="loadOrderHistory()" style="margin-top:10px;padding:10px 20px;background:#0b6b57;color:white;border:none;border-radius:8px;cursor:pointer;">🔄 Try Again</button>
      </div>
    `;
  }
}

function renderOrderHistory(data) {
  const container = document.getElementById('orderHistoryList');
  
  if (!data.orders || data.orders.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:50px 20px;color:#69737d;">
        <div style="font-size:48px;margin-bottom:16px;">📦</div>
        <h3 style="color:#17202a;margin-bottom:8px;">No orders found</h3>
        <p>${document.getElementById('orderHistorySearch')?.value ? 'Try a different search term' : 'You haven\'t placed any orders yet'}</p>
        ${!document.getElementById('orderHistorySearch')?.value ? `<button onclick="closeModal();document.getElementById('menu').scrollIntoView({behavior:'smooth'})" style="margin-top:12px;padding:10px 24px;background:var(--gradient-primary);color:white;border:none;border-radius:8px;cursor:pointer;font-weight:600;">🍽️ Browse Menu</button>` : ''}
      </div>
    `;
    return;
  }
  
  container.innerHTML = data.orders.map(order => `
    <div class="order-history-card" style="background:white;border-radius:12px;padding:16px;margin-bottom:12px;border:1px solid #e9ecef;transition:all 0.3s;cursor:pointer;" onclick="showOrderDetail(${order.id})">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;">
        <div>
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <span style="font-weight:800;font-size:16px;color:#17202a;">#${order.id}</span>
            <span style="font-size:12px;color:#69737d;">${new Date(order.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
            <span style="font-size:12px;color:#69737d;">${new Date(order.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>
          <div style="margin-top:4px;font-size:14px;color:#69737d;">
            ${order.items ? order.items.map(item => `${item.food_name} × ${item.quantity}`).join(', ') : ''}
          </div>
          <div style="margin-top:4px;font-size:13px;color:#69737d;">
            📍 ${order.address}
          </div>
        </div>
        <div style="text-align:right;">
          <div style="font-weight:800;font-size:18px;color:#0b6b57;">৳${Number(order.total).toFixed(2)}</div>
          <span class="order-status-badge ${order.status.toLowerCase().replace(/ /g, '_')}" style="display:inline-block;padding:3px 14px;border-radius:20px;font-size:12px;font-weight:700;color:white;background:${getStatusBgColor(order.status)};">
            ${order.status}
          </span>
          <div style="margin-top:4px;font-size:12px;color:#69737d;">${order.item_count || 0} items</div>
        </div>
      </div>
      <div style="display:flex;gap:8px;margin-top:12px;padding-top:12px;border-top:1px solid #f0f2f5;flex-wrap:wrap;">
        <button onclick="event.stopPropagation(); openOrderTracking(${order.id})" style="padding:6px 16px;background:#0b6b57;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600;font-size:12px;">
          📦 Track
        </button>
        ${order.status === 'Delivered' ? `
          <button onclick="event.stopPropagation(); showReviewForOrder(${order.id})" style="padding:6px 16px;background:#f39c12;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600;font-size:12px;">
            ⭐ Review
          </button>
        ` : ''}
        <button onclick="event.stopPropagation(); showOrderDetail(${order.id})" style="padding:6px 16px;background:#e9ecef;color:#17202a;border:none;border-radius:6px;cursor:pointer;font-weight:600;font-size:12px;">
          📋 Details
        </button>
      </div>
    </div>
  `).join('');
}

function renderPagination(pagination) {
  const container = document.getElementById('orderPagination');
  if (!container) return;
  
  if (pagination.totalPages <= 1) {
    container.innerHTML = '';
    return;
  }
  
  let html = '';
  
  if (pagination.page > 1) {
    html += `<button onclick="loadOrderHistory(${pagination.page - 1})" style="padding:6px 14px;border:2px solid #e9ecef;border-radius:6px;background:white;cursor:pointer;font-weight:600;">‹ Prev</button>`;
  }
  
  for (let i = 1; i <= pagination.totalPages; i++) {
    if (i === pagination.page) {
      html += `<button style="padding:6px 14px;border:2px solid #0b6b57;border-radius:6px;background:#0b6b57;color:white;font-weight:700;">${i}</button>`;
    } else if (i <= 3 || i > pagination.totalPages - 3 || Math.abs(i - pagination.page) <= 1) {
      html += `<button onclick="loadOrderHistory(${i})" style="padding:6px 14px;border:2px solid #e9ecef;border-radius:6px;background:white;cursor:pointer;font-weight:600;">${i}</button>`;
    } else if (i === 4 || i === pagination.totalPages - 3) {
      html += `<span style="padding:6px 8px;color:#69737d;">…</span>`;
    }
  }
  
  if (pagination.page < pagination.totalPages) {
    html += `<button onclick="loadOrderHistory(${pagination.page + 1})" style="padding:6px 14px;border:2px solid #e9ecef;border-radius:6px;background:white;cursor:pointer;font-weight:600;">Next ›</button>`;
  }
  
  container.innerHTML = html;
}

function filterOrderHistory() {
  loadOrderHistory(1);
}

function resetOrderFilters() {
  const filter = document.getElementById('orderHistoryFilter');
  const search = document.getElementById('orderHistorySearch');
  if (filter) filter.value = 'all';
  if (search) search.value = '';
  loadOrderHistory(1);
}

async function showOrderDetail(orderId) {
  try {
    const order = await api(`/api/orders/track/${orderId}`);
    
    const formatDate = (date) => {
      if (!date) return '—';
      const d = new Date(date);
      return d.toLocaleString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric',
        hour: '2-digit', 
        minute: '2-digit' 
      });
    };
    
    modalContent.innerHTML = `
      <h2>📋 Order Details</h2>
      <div style="margin-bottom:16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;padding:12px 16px;background:#f8f9fa;border-radius:10px;">
          <div>
            <div style="font-weight:700;font-size:18px;">Order #${order.id}</div>
            <div style="font-size:13px;color:#69737d;">${formatDate(order.created_at)}</div>
          </div>
          <span class="order-status-badge ${order.status.toLowerCase().replace(/ /g, '_')}" style="display:inline-block;padding:4px 16px;border-radius:20px;font-size:14px;font-weight:700;color:white;background:${getStatusBgColor(order.status)};">
            ${order.status}
          </span>
        </div>
      </div>
      
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin:12px 0;padding:14px;background:#f8f9fa;border-radius:10px;">
        <div><span style="font-size:12px;color:#69737d;display:block;">👤 Customer</span><span style="font-weight:600;">${order.customer_name || '—'}</span></div>
        <div><span style="font-size:12px;color:#69737d;display:block;">📱 Phone</span><span style="font-weight:600;">${order.phone || '—'}</span></div>
        <div style="grid-column:1/-1;"><span style="font-size:12px;color:#69737d;display:block;">📍 Address</span><span style="font-weight:600;">${order.address || '—'}</span></div>
      </div>
      
      <div style="margin:12px 0;padding:14px;background:#f8f9fa;border-radius:10px;">
        <div style="font-weight:700;margin-bottom:8px;">🍽️ Items</div>
        ${order.items ? order.items.map(item => `
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e9ecef;">
            <span>${item.food_name} × ${item.quantity}</span>
            <span style="font-weight:600;color:#0b6b57;">৳${(item.price * item.quantity).toFixed(2)}</span>
          </div>
        `).join('') : ''}
        <div style="display:flex;justify-content:space-between;padding:10px 0 0 0;border-top:2px solid #e9ecef;margin-top:6px;font-size:18px;font-weight:800;">
          <span>Total</span>
          <span style="color:#0b6b57;">৳${Number(order.total).toFixed(2)}</span>
        </div>
      </div>
      
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px;">
        <button onclick="closeModal();openOrderTracking(${order.id})" style="flex:1;padding:12px;background:#0b6b57;color:white;border:none;border-radius:8px;cursor:pointer;font-weight:600;">
          📦 Track Order
        </button>
        ${order.status === 'Delivered' ? `
          <button onclick="closeModal();showReviewForOrder(${order.id})" style="flex:1;padding:12px;background:#f39c12;color:white;border:none;border-radius:8px;cursor:pointer;font-weight:600;">
            ⭐ Write Review
          </button>
        ` : ''}
        <button onclick="closeModal()" style="flex:1;padding:12px;background:#e9ecef;border:none;border-radius:8px;cursor:pointer;font-weight:600;">
          ✕ Close
        </button>
      </div>
    `;
    openModal();
  } catch (error) {
    showToast('Error loading order details: ' + error.message, 'error');
  }
}

function getStatusBgColor(status) {
  const map = {
    'Pending': '#f39c12',
    'Confirmed': '#3498db',
    'Preparing': '#9b59b6',
    'Out for Delivery': '#e67e22',
    'Delivered': '#27ae60',
    'Cancelled': '#e74c3c'
  };
  return map[status] || '#69737d';
}

// ===== CHAT (ড্রপডাউন থেকে) =====
async function showChat() {
  closeDropdown();
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
      <h2>💬 Chat with FoodHub</h2>
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

// ===== EVENT LISTENERS =====
loginBtn.addEventListener("click", showLogin);
cartBtn.addEventListener("click", showCart);
floatingChat.addEventListener("click", showChat);

modal.addEventListener("click", event => { if (event.target === modal) closeModal(); });

// ===== INIT =====
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

// ===== PRODUCT DETAIL WITH REVIEWS =====
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
    
    const hasDiscount = food.discount_percent > 0;
    const discountPrice = hasDiscount ? food.price - (food.price * food.discount_percent / 100) : null;
    const isFav = isFavorited(foodId);
    
    productDetailContent.innerHTML = `
      <div class="product-detail">
        <img src="${food.image}" alt="${food.name}" class="product-detail-image" onerror="this.src='https://via.placeholder.com/600x300?text=No+Image'">
        <div class="product-detail-info">
          <div class="category">${food.category_name || 'Popular'}</div>
          <h2 class="name">${food.name}</h2>
          ${hasDiscount ? `<span class="discount-badge-large">🔥 ${food.discount_percent}% OFF</span>` : ''}
          <p class="description">${food.description || 'Delicious food item prepared with fresh ingredients.'}</p>
          <div class="price">
            ${hasDiscount ? `
              <span class="original-price-large">৳${food.price.toFixed(2)}</span>
              <span class="discount-price-large">৳${discountPrice.toFixed(2)}</span>
            ` : `
              <span>৳${food.price.toFixed(2)}</span>
            `}
          </div>
          <div class="product-detail-actions">
            <button class="favorite-btn-detail ${isFav ? 'favorited' : ''}" 
                    data-food-id="${foodId}" 
                    onclick="toggleFavorite(${foodId}, event)">
              ${isFav ? '❤️ Remove from Favorites' : '🤍 Add to Favorites'}
            </button>
            <button class="add-to-cart-btn" onclick="addToCartAndCloseDetail(${food.id})">🛒 Add to Cart</button>
            <button class="close-btn" onclick="closeProductModal()">Close</button>
          </div>
        </div>
        
        <div id="reviewsSection" class="reviews-section">
          <h3>⭐ Reviews</h3>
          <div id="reviewsLoading" style="text-align:center;padding:20px;color:#69737d;">
            <div class="spinner" style="width:30px;height:30px;border:3px solid #f0f2f5;border-top:3px solid #f39c12;border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto;"></div>
            <p style="margin-top:10px;">Loading reviews...</p>
          </div>
          <div id="reviewsContent"></div>
        </div>
        
        ${related.length > 0 ? `
          <div class="product-detail-related">
            <h3>🔄 You might also like</h3>
            <div class="related-grid">
              ${related.map(item => `
                <div class="related-item" onclick="showProductDetail(${item.id})">
                  <img src="${item.image}" alt="${item.name}" onerror="this.src='https://via.placeholder.com/140x80?text=No+Image'">
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
    loadAndRenderReviews(foodId);
  } catch (error) {
    console.error('Error showing product detail:', error);
    showToast('Error loading product details');
  }
}
async function loadAndRenderReviews(foodId) {
  try {
    const data = await loadFoodReviews(foodId);
    const content = document.getElementById('reviewsContent');
    const loading = document.getElementById('reviewsLoading');
    
    if (loading) loading.style.display = 'none';
    if (!data || !content) return;
    
    const { reviews, stats } = data;
    const total = parseInt(stats.total) || 0;
    const avg = parseFloat(stats.avg_rating) || 0;
    
    if (total === 0) {
      content.innerHTML = `
        <div style="text-align:center;padding:20px;color:#69737d;">
          <p>No reviews yet. Be the first to review!</p>
         ${token ? `<button onclick="showReviewModal(${foodId})" style="background:#f39c12;color:white;border:none;padding:10px 20px;border-radius:8px;cursor:pointer;font-weight:600;margin-top:10px;">⭐ Write a Review</button>` : '<p style="font-size:13px;color:#69737d;">Login to write a review</p>'}
        </div>
      `;
      return;
    }
    
    content.innerHTML = `
      <div class="rating-summary">
        <div>
          <div class="avg-rating">${avg.toFixed(1)}</div>
          <div class="stars-display">${'★'.repeat(Math.round(avg))}${'☆'.repeat(5-Math.round(avg))}</div>
          <div style="font-size:14px;color:#69737d;">${total} reviews</div>
        </div>
        <div class="rating-bars">
          ${[5,4,3,2,1].map(r => {
            const count = parseInt(stats[`${r}_star`]) || 0;
            const percent = total > 0 ? Math.round((count/total)*100) : 0;
            return `
              <div class="rating-bar">
                <span>${r}★</span>
                <div class="bar"><div style="width:${percent}%"></div></div>
                <span>${count}</span>
              </div>
            `;
          }).join('')}
        </div>
        <div style="margin-left:auto;">
          ${token ? `<button onclick="showReviewModal(${foodId})" style="background:#f39c12;color:white;border:none;padding:10px 20px;border-radius:8px;cursor:pointer;font-weight:600;">⭐ Write Review</button>` : ''}
        </div>
      </div>
      <div class="reviews-list">
        ${reviews.slice(0, 5).map(r => `
          <div class="review-card">
            <div class="reviewer">
              <strong>${r.user_name}</strong>
              <div class="stars">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</div>
              <small style="color:#69737d;">${new Date(r.created_at).toLocaleDateString()}</small>
            </div>
            ${r.comment ? `<p>${r.comment}</p>` : ''}
          </div>
        `).join('')}
        ${reviews.length > 5 ? `<button onclick="showAllReviews(${foodId})" style="background:transparent;color:#0b6b57;border:none;cursor:pointer;font-weight:600;padding:10px;">View All ${reviews.length} Reviews →</button>` : ''}
      </div>
    `;
  } catch (error) {
    console.error('Error loading reviews:', error);
    const content = document.getElementById('reviewsContent');
    if (content) {
      content.innerHTML = `<p style="color:#69737d;">Could not load reviews.</p>`;
    }
  }
}

async function showAllReviews(foodId) {
  try {
    const data = await loadFoodReviews(foodId);
    if (!data) return;
    
    const { reviews, stats } = data;
    const total = parseInt(stats.total) || 0;
    const avg = parseFloat(stats.avg_rating) || 0;
    
    // প্রোডাক্ট পপআপ বন্ধ করুন
    closeProductModal();
    
    const modalContent = document.getElementById('modalContent');
    if (!modalContent) return;
    
    modalContent.innerHTML = `
      <h2>⭐ All Reviews</h2>
      <div style="display:flex;align-items:center;gap:20px;padding:15px;background:#f8f9fa;border-radius:10px;margin-bottom:15px;flex-wrap:wrap;">
        <div style="font-size:32px;font-weight:800;color:#17202a;">${avg.toFixed(1)}</div>
        <div>
          <div style="color:#f39c12;font-size:20px;">${'★'.repeat(Math.round(avg))}${'☆'.repeat(5-Math.round(avg))}</div>
          <div style="color:#69737d;font-size:14px;">${total} reviews</div>
        </div>
        ${token ? `<button onclick="closeModal();showReviewModal(${foodId})" style="background:#f39c12;color:white;border:none;padding:10px 20px;border-radius:8px;cursor:pointer;font-weight:600;margin-left:auto;">⭐ Write Review</button>` : ''}
      </div>
      <div style="max-height:400px;overflow-y:auto;">
        ${reviews.map(r => `
          <div class="review-card" style="padding:12px 0;border-bottom:1px solid #f0f2f5;">
            <div class="reviewer" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
              <strong>${r.user_name}</strong>
              <div style="color:#f39c12;font-size:14px;">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</div>
              <small style="color:#69737d;">${new Date(r.created_at).toLocaleDateString()}</small>
            </div>
            ${r.comment ? `<p style="margin:8px 0 0 0;color:#69737d;">${r.comment}</p>` : ''}
          </div>
        `).join('')}
      </div>
      <button onclick="closeModal()" style="width:100%;padding:12px;background:#e9ecef;border:none;border-radius:8px;margin-top:15px;cursor:pointer;font-weight:600;">Close</button>
    `;
    openModal();
  } catch (error) {
    showToast('Error loading reviews: ' + error.message, 'error');
  }
}
async function loadFoodReviews(foodId) {
  try {
    const data = await api(`/api/foods/${foodId}/reviews`);
    return data;
  } catch (error) {
    console.error('Error loading reviews:', error);
    return null;
  }
}

function addToCartAndCloseDetail(foodId) { addToCart(foodId); closeProductModal(); }
function closeProductModal() { productModal.classList.add('hidden'); document.body.style.overflow = 'auto'; }

if (productModal) productModal.addEventListener('click', function(e) { if (e.target === productModal) closeProductModal(); });
document.addEventListener('keydown', function(e) { if (e.key === 'Escape' && !productModal.classList.contains('hidden')) closeProductModal(); });

// ===== REVIEW FUNCTIONS =====

async function showReviewForOrder(orderId) {
  if (!token) {
    showToast("Please login to review.");
    showLogin();
    return;
  }
  
  // বর্তমান মোডাল বন্ধ করুন (যদি প্রোডাক্ট পপআপ খোলা থাকে)
  closeProductModal();
  
  try {
    const order = await api(`/api/orders/track/${orderId}`);
    
    if (order.status !== 'Delivered') {
      showToast('You can only review delivered orders.', 'error');
      return;
    }
    
    let itemsHtml = order.items.map(item => `
      <div class="review-order-item" style="display:flex;align-items:center;gap:15px;padding:10px;border-bottom:1px solid #eee;cursor:pointer;" onclick="showReviewModal(${item.food_id}, ${orderId})">
        <span style="font-size:20px;">🍽️</span>
        <div>
          <strong>${item.food_name}</strong>
          <span style="color:#69737d;">× ${item.quantity}</span>
          <span style="color:#0b6b57;font-weight:700;">৳${(item.price * item.quantity).toFixed(2)}</span>
        </div>
        <span style="margin-left:auto;color:#f39c12;">⭐ Review</span>
      </div>
    `).join('');
    
    const modalContent = document.getElementById('modalContent');
    if (!modalContent) return;
    
    modalContent.innerHTML = `
      <h2>⭐ Review Your Order</h2>
      <p style="color:#69737d;">Select an item to review from order #${orderId}</p>
      <div style="margin:15px 0;">
        ${itemsHtml}
      </div>
      <button onclick="closeModal()" style="background:#95a5a6;width:100%;margin-top:10px;padding:12px;border:none;border-radius:8px;cursor:pointer;font-weight:600;">Close</button>
    `;
    openModal();
  } catch (error) {
    showToast('Error loading order: ' + error.message, 'error');
  }
}

async function showReviewModal(foodId, orderId = null) {
  if (!token) {
    showToast("Please login to review.");
    showLogin();
    return;
  }
  
  // প্রোডাক্ট পপআপ বন্ধ করুন
  closeProductModal();
  
  // রিভিউ কন্টেন্ট তৈরি করুন
  let foodName = '';
  try {
    const food = foods.find(f => f.id === foodId);
    if (food) foodName = food.name;
  } catch (e) {}
  
  const modalContent = document.getElementById('modalContent');
  if (!modalContent) return;
  
  modalContent.innerHTML = `
    <h2>⭐ Rate & Review</h2>
    <p style="color:#69737d;">${foodName ? `Reviewing: <strong>${foodName}</strong>` : 'Share your experience'}</p>
    <form onsubmit="submitReview(event, ${foodId}, ${orderId})">
      <div class="rating-input">
        <label style="font-weight:600;display:block;margin-bottom:8px;">Your Rating</label>
        <div class="star-rating" id="starRating">
          ${[1,2,3,4,5].map(i => `
            <span class="star" data-value="${i}" onclick="setRating(${i})" style="font-size:36px;cursor:pointer;color:#d4d8dc;transition:all 0.3s;">☆</span>
          `).join('')}
        </div>
        <input type="hidden" id="reviewRating" value="0">
        <p id="ratingText" style="font-size:14px;color:#69737d;margin-top:5px;">Select a rating</p>
      </div>
      <div class="form-group">
        <label style="font-weight:600;display:block;margin-bottom:5px;">Your Review (Optional)</label>
        <textarea id="reviewComment" placeholder="Tell us about your experience..." rows="4" maxlength="500" style="width:100%;padding:12px;border:2px solid #e9ecef;border-radius:8px;font-family:inherit;"></textarea>
        <small style="color:#69737d;">Max 500 characters</small>
      </div>
      <button type="submit" style="width:100%;padding:14px;background:#0b6b57;color:white;border:none;border-radius:8px;font-size:16px;font-weight:700;cursor:pointer;margin-top:10px;">
        ⭐ Submit Review
      </button>
    </form>
    <button onclick="closeModal()" style="width:100%;padding:12px;background:#e9ecef;border:none;border-radius:8px;margin-top:8px;cursor:pointer;font-weight:600;">
      Cancel
    </button>
  `;
  
  // রিভিউ পপআপ খুলুন
  openModal();
}

let selectedRating = 0;

function setRating(rating) {
  selectedRating = rating;
  document.getElementById('reviewRating').value = rating;
  
  const stars = document.querySelectorAll('.star');
  stars.forEach((star, index) => {
    const value = parseInt(star.dataset.value);
    star.textContent = value <= rating ? '★' : '☆';
    star.style.color = value <= rating ? '#f39c12' : '#d4d8dc';
  });
  
  const texts = ['', 'Poor 😞', 'Fair 😐', 'Good 🙂', 'Very Good 😊', 'Excellent 🤩'];
  const ratingText = document.getElementById('ratingText');
  if (ratingText) ratingText.textContent = texts[rating] || 'Select a rating';
}

async function submitReview(event, foodId, orderId) {
  event.preventDefault();
  
  const rating = parseInt(document.getElementById('reviewRating').value);
  const comment = document.getElementById('reviewComment').value.trim();
  
  if (!rating || rating < 1 || rating > 5) {
    showToast('Please select a rating.', 'error');
    return;
  }
  
  try {
    const result = await api('/api/reviews', {
      method: 'POST',
      body: JSON.stringify({
        foodId: parseInt(foodId),
        orderId: orderId || null,
        rating: rating,
        comment: comment || null
      })
    });
    
    closeModal();
    showToast('✅ Review submitted! Waiting for admin approval.', 'success');
    await loadFoodReviews(foodId);
  } catch (error) {
    showToast(error.message, 'error');
    console.error('Review error:', error);
  }
}

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
        <div class="info-item"><span class="label">👤 Customer</span><span class="value">${order.customer_name || '—'}</span></div>
        <div class="info-item"><span class="label">📱 Phone</span><span class="value">${order.phone || '—'}</span></div>
        <div class="info-item"><span class="label">📍 Delivery Address</span><span class="value">${order.address || '—'}</span></div>
        <div class="info-item"><span class="label">📅 Order Date</span><span class="value">${formatDate(order.created_at)}</span></div>
      </div>
      <div class="order-items-list">
        <h4>🍽️ Order Items</h4>
        ${itemsHTML}
        <div class="order-total"><span>Total</span><span class="total-amount">৳${Number(order.total).toFixed(2)}</span></div>
      </div>
      <div class="order-timeline">${timelineHTML}</div>
      <div class="tracking-actions">
        <button class="track-again-btn" onclick="loadOrderTracking(${order.id})">🔄 Refresh</button>
        <button class="close-track-btn" onclick="closeOrderTracking()">✕ Close</button>
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

// ===== NEWSLETTER SUBSCRIPTION =====
async function subscribeNewsletter(event) {
  event.preventDefault();
  
  const form = document.getElementById('newsletterForm');
  const emailInput = document.getElementById('newsletterEmail');
  const nameInput = document.getElementById('newsletterName');
  const button = document.getElementById('newsletterBtn');
  const message = document.getElementById('newsletterMessage');
  
  // ভ্যালিডেশন
  const email = emailInput.value.trim();
  if (!email) {
    showNewsletterMessage('Please enter your email address.', 'error');
    return;
  }
  
  // ইমেইল ফরম্যাট চেক
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    showNewsletterMessage('Please enter a valid email address.', 'error');
    return;
  }
  
  const name = nameInput.value.trim() || null;
  
  // বাটন লোডিং স্টেট
  button.classList.add('loading');
  button.disabled = true;
  
  try {
    const response = await fetch('/api/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      throw new Error(data.message || 'Something went wrong.');
    }
    
    // সফল
    showNewsletterMessage(data.message || '🎉 Thank you for subscribing!', 'success');
    emailInput.value = '';
    nameInput.value = '';
    
    // ৫ সেকেন্ড পর মেসেজ লুকান
    setTimeout(() => {
      message.classList.add('hidden');
    }, 5000);
    
  } catch (error) {
    showNewsletterMessage(error.message || 'Could not subscribe. Please try again.', 'error');
  } finally {
    button.classList.remove('loading');
    button.disabled = false;
  }
}

function showNewsletterMessage(text, type = 'info') {
  const message = document.getElementById('newsletterMessage');
  if (!message) return;
  
  message.textContent = text;
  message.className = 'newsletter-message ' + type;
  message.classList.remove('hidden');
}

// ===== KEYBOARD SHORTCUT: ESC to close messages =====
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    const message = document.getElementById('newsletterMessage');
    if (message && !message.classList.contains('hidden')) {
      message.classList.add('hidden');
    }
  }
});

// ===== FAQ LOADER =====
async function loadFaqs() {
  const container = document.getElementById('faqContainer');
  if (!container) return;
  
  try {
    const response = await fetch('/api/faqs');
    if (!response.ok) throw new Error('Failed to load FAQs');
    const faqs = await response.json();
    
    if (!faqs || faqs.length === 0) {
      container.innerHTML = `
        <div style="text-align:center;padding:30px;color:#69737d;">
          <p>No FAQs available yet.</p>
        </div>
      `;
      return;
    }
    
    container.innerHTML = `
      <div class="faq-accordion">
        ${faqs.map((faq, index) => `
          <div class="faq-item">
            <div class="faq-question" onclick="toggleFaq(this)">
              <span class="faq-number">${String(index + 1).padStart(2, '0')}</span>
              <span class="faq-question-text">${esc(faq.question)}</span>
              <span class="faq-icon">▼</span>
            </div>
            <div class="faq-answer">
              <p>${esc(faq.answer)}</p>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  } catch (error) {
    console.error('Error loading FAQs:', error);
    container.innerHTML = `
      <div style="text-align:center;padding:30px;color:#e74c3c;">
        <p>Could not load FAQs. Please try again later.</p>
      </div>
    `;
  }
}

// ===== TOGGLE FAQ =====
function toggleFaq(element) {
  const item = element.closest('.faq-item');
  if (!item) return;
  
  const isOpen = item.classList.contains('open');
  
  // Close all other items
  document.querySelectorAll('.faq-item').forEach(el => {
    if (el !== item) {
      el.classList.remove('open');
    }
  });
  
  // Toggle current item
  if (isOpen) {
    item.classList.remove('open');
  } else {
    item.classList.add('open');
  }
}

// ===== FAVORITE FOODS =====

let userFavorites = [];

// Load user favorites
async function loadFavorites() {
  if (!token) {
    userFavorites = [];
    return;
  }
  
  try {
    const data = await api('/api/favorites');
    userFavorites = data.map(f => String(f.food_id));
    updateFavoriteIcons();
    return data;
  } catch (error) {
    console.error('Error loading favorites:', error);
    userFavorites = [];
  }
}

// Check if food is favorited
function isFavorited(foodId) {
  return userFavorites.includes(String(foodId));
}

// Toggle favorite
async function toggleFavorite(foodId, event) {
  if (event) {
    event.stopPropagation();
  }
  
  if (!token) {
    showToast('Please login to add favorites!', 'info');
    showLogin();
    return;
  }
  
  const foodIdStr = String(foodId);
  const isFav = isFavorited(foodIdStr);
  
  try {
    if (isFav) {
      // Remove from favorites
      await api(`/api/favorites/${foodId}`, { method: 'DELETE' });
      userFavorites = userFavorites.filter(id => id !== foodIdStr);
      showToast('Removed from favorites ❤️', 'info');
    } else {
      // Add to favorites
      await api('/api/favorites', {
        method: 'POST',
        body: JSON.stringify({ food_id: foodId })
      });
      userFavorites.push(foodIdStr);
      showToast('Added to favorites ❤️', 'success');
    }
    
    updateFavoriteIcons();
    updateFavoriteButtons();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

// Update favorite icons in food grid
function updateFavoriteIcons() {
  document.querySelectorAll('.favorite-btn').forEach(btn => {
    const foodId = btn.dataset.foodId;
    if (isFavorited(foodId)) {
      btn.classList.add('favorited');
      btn.textContent = '❤️';
    } else {
      btn.classList.remove('favorited');
      btn.textContent = '🤍';
    }
  });
}

// Update favorite buttons in product detail
function updateFavoriteButtons() {
  document.querySelectorAll('.favorite-btn-detail').forEach(btn => {
    const foodId = btn.dataset.foodId;
    if (isFavorited(foodId)) {
      btn.classList.add('favorited');
      btn.innerHTML = '❤️ Remove from Favorites';
    } else {
      btn.classList.remove('favorited');
      btn.innerHTML = '🤍 Add to Favorites';
    }
  });
}

// Show favorites page
async function showFavorites() {
  closeDropdown();
  
  if (!token) {
    showToast('Please login to view favorites!', 'info');
    showLogin();
    return;
  }
  
  try {
    const favorites = await api('/api/favorites');
    
    if (favorites.length === 0) {
      modalContent.innerHTML = `
        <h2>❤️ My Favorites</h2>
        <div style="text-align:center;padding:50px 20px;color:#69737d;">
          <div style="font-size:64px;margin-bottom:16px;">🤍</div>
          <h3 style="color:#17202a;margin-bottom:8px;">No favorites yet</h3>
          <p>Start adding your favorite foods by clicking the ❤️ button on any food item.</p>
          <button onclick="closeModal();document.getElementById('menu').scrollIntoView({behavior:'smooth'})" 
                  style="margin-top:16px;padding:12px 30px;background:#0b6b57;color:white;border:none;border-radius:10px;cursor:pointer;font-weight:600;">
            🍽️ Browse Menu
          </button>
        </div>
      `;
      openModal();
      return;
    }
    
    modalContent.innerHTML = `
      <h2>❤️ My Favorites</h2>
      <p style="color:#69737d;margin-bottom:16px;">${favorites.length} favorite items</p>
      <div class="favorites-grid" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:16px;">
        ${favorites.map(f => `
          <div class="favorite-item" style="background:white;border-radius:12px;overflow:hidden;border:1px solid #f0f2f5;cursor:pointer;transition:all 0.3s;" 
               onclick="closeModal();showProductDetail(${f.food_id})">
            <img src="${f.image}" alt="${f.name}" style="width:100%;height:140px;object-fit:cover;" 
                 onerror="this.src='https://via.placeholder.com/200x140?text=No+Image'">
            <div style="padding:12px 14px 14px;">
              <div style="font-weight:600;font-size:15px;color:#17202a;margin-bottom:4px;">${esc(f.name)}</div>
              <div style="color:#69737d;font-size:13px;margin-bottom:6px;">${f.category_name || 'Popular'}</div>
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="font-weight:700;font-size:17px;color:#0b6b57;">৳${Number(f.price).toFixed(2)}</span>
                <button onclick="event.stopPropagation();toggleFavorite(${f.food_id})" 
                        style="background:none;border:none;font-size:22px;cursor:pointer;transition:all 0.3s;">
                  ❤️
                </button>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
      <button onclick="closeModal()" style="width:100%;padding:12px;background:#e9ecef;border:none;border-radius:8px;margin-top:16px;cursor:pointer;font-weight:600;">
        Close
      </button>
    `;
    openModal();
  } catch (error) {
    showToast('Error loading favorites: ' + error.message, 'error');
  }
}

// ===== CHECKOUT WITH AUTO/MANUAL LOCATION =====

// Track address mode
let addressMode = 'auto'; // 'auto' or 'manual'
let currentLocation = {
  lat: null,
  lng: null,
  address: ''
};

function openCheckout() {
  if (!token) {
    showLogin();
    showToast("Please login before ordering.");
    return;
  }
  
  const items = cartDetails();
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  
  modalContent.innerHTML = `
    <h2>📋 Checkout</h2>
    
    <!-- Order Summary -->
    <div style="background:#f8f9fa;padding:15px;border-radius:10px;margin-bottom:20px;">
      <h4 style="margin:0 0 10px 0;color:#17202a;">🛒 Order Summary</h4>
      ${items.map(item => `
        <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #e9ecef;font-size:14px;">
          <span>${item.name} × ${item.quantity}</span>
          <span style="font-weight:600;color:#0b6b57;">৳${(item.price * item.quantity).toFixed(2)}</span>
        </div>
      `).join('')}
      <div style="display:flex;justify-content:space-between;padding:10px 0 0 0;font-size:18px;font-weight:800;border-top:2px solid #0b6b57;margin-top:8px;">
        <span>Total:</span>
        <span style="color:#0b6b57;">৳${total.toFixed(2)}</span>
      </div>
    </div>
    
    <form onsubmit="placeOrder(event)">
      <!-- Customer Info -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
        <div class="form-group">
          <label>👤 Full Name</label>
          <input id="customerName" required placeholder="Enter your full name" value="${localStorage.getItem('checkout_name') || ''}">
        </div>
        <div class="form-group">
          <label>📱 Phone Number</label>
          <input id="phone" type="tel" required placeholder="01XXXXXXXXX" value="${localStorage.getItem('checkout_phone') || ''}">
        </div>
      </div>
      
      <!-- Address Section -->
      <div style="margin:15px 0;">
        <label style="font-weight:600;display:block;margin-bottom:8px;">📍 Delivery Address</label>
        
        <!-- Toggle Buttons -->
        <div style="display:flex;gap:10px;margin-bottom:12px;">
          <button type="button" id="autoLocationBtn" onclick="toggleAddressMode('auto')" 
                  style="flex:1;padding:10px 16px;border:2px solid #0b6b57;border-radius:8px;background:#0b6b57;color:white;font-weight:600;cursor:pointer;transition:all 0.3s;font-size:14px;">
            📍 Auto Location
          </button>
          <button type="button" id="manualAddressBtn" onclick="toggleAddressMode('manual')" 
                  style="flex:1;padding:10px 16px;border:2px solid #e9ecef;border-radius:8px;background:white;color:#69737d;font-weight:600;cursor:pointer;transition:all 0.3s;font-size:14px;">
            ✏️ Manual Address
          </button>
        </div>
        
        <!-- Auto Location Section -->
        <div id="autoLocationSection" style="display:block;">
          <div style="background:#f8f9fa;padding:15px;border-radius:10px;border:2px solid #0b6b57;transition:all 0.3s;">
            <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;flex-wrap:wrap;">
              <span style="font-size:24px;" id="locationIcon">📍</span>
              <div style="flex:1;min-width:150px;">
                <div id="locationStatus" style="font-weight:600;color:#17202a;">Getting your location...</div>
                <div id="locationDetails" style="font-size:13px;color:#69737d;word-break:break-word;">Please wait...</div>
              </div>
              <button type="button" onclick="getCurrentLocation()" 
                      style="padding:8px 16px;background:#0b6b57;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600;font-size:13px;white-space:nowrap;">
                🔄 Refresh
              </button>
            </div>
            <div id="locationMap" style="width:100%;min-height:120px;background:#e9ecef;border-radius:8px;display:none;align-items:center;justify-content:center;color:#69737d;flex-direction:column;padding:10px;">
              <!-- Map will show here -->
            </div>
            <input type="hidden" id="autoAddress" value="">
            <input type="hidden" id="autoLat" value="">
            <input type="hidden" id="autoLng" value="">
          </div>
        </div>
        
        <!-- Manual Address Section -->
        <div id="manualAddressSection" style="display:none;">
          <textarea id="address" rows="3" placeholder="Enter your full delivery address (House, Road, Area, City)" 
                    style="width:100%;padding:12px;border:2px solid #e9ecef;border-radius:8px;font-size:14px;font-family:inherit;resize:vertical;">${localStorage.getItem('checkout_address') || ''}</textarea>
        </div>
      </div>
      
      <!-- Delivery Instructions -->
      <div class="form-group">
        <label>📝 Special Instructions (Optional)</label>
        <textarea id="instructions" rows="2" placeholder="Any special requests? e.g., extra sauce, no onions, etc.">${localStorage.getItem('checkout_instructions') || ''}</textarea>
      </div>
      
      <!-- Payment Method -->
      <div class="form-group">
        <label>💳 Payment Method</label>
        <select id="paymentMethod" style="width:100%;padding:12px;border:2px solid #e9ecef;border-radius:8px;font-size:14px;background:white;">
          <option value="cash">Cash on Delivery</option>
          <option value="bkash">bKash</option>
          <option value="nagad">Nagad</option>
          <option value="card">Credit/Debit Card</option>
        </select>
      </div>
      
      <button type="submit" class="checkout-btn" style="width:100%;padding:14px;background:#0b6b57;color:white;border:none;border-radius:10px;font-size:16px;font-weight:700;cursor:pointer;transition:all 0.3s;margin-top:10px;">
        ✅ Place Order - ৳${total.toFixed(2)}
      </button>
    </form>
  `;
  openModal();
  
  // Save form data on input
  document.addEventListener('input', saveCheckoutData);
  
  // Auto location start
  setTimeout(() => {
    getCurrentLocation();
  }, 500);
}

// ===== SAVE CHECKOUT DATA =====
function saveCheckoutData() {
  try {
    const name = document.getElementById('customerName')?.value;
    const phone = document.getElementById('phone')?.value;
    const address = document.getElementById('address')?.value;
    const instructions = document.getElementById('instructions')?.value;
    
    if (name) localStorage.setItem('checkout_name', name);
    if (phone) localStorage.setItem('checkout_phone', phone);
    if (address) localStorage.setItem('checkout_address', address);
    if (instructions) localStorage.setItem('checkout_instructions', instructions);
  } catch(e) {}
}

// ===== TOGGLE ADDRESS MODE =====
function toggleAddressMode(mode) {
  addressMode = mode;
  const autoSection = document.getElementById('autoLocationSection');
  const manualSection = document.getElementById('manualAddressSection');
  const autoBtn = document.getElementById('autoLocationBtn');
  const manualBtn = document.getElementById('manualAddressBtn');
  
  if (mode === 'auto') {
    autoSection.style.display = 'block';
    manualSection.style.display = 'none';
    autoBtn.style.background = '#0b6b57';
    autoBtn.style.color = 'white';
    autoBtn.style.borderColor = '#0b6b57';
    manualBtn.style.background = 'white';
    manualBtn.style.color = '#69737d';
    manualBtn.style.borderColor = '#e9ecef';
    // Auto location try if not already detected
    if (!currentLocation.lat) {
      getCurrentLocation();
    }
  } else {
    autoSection.style.display = 'none';
    manualSection.style.display = 'block';
    manualBtn.style.background = '#0b6b57';
    manualBtn.style.color = 'white';
    manualBtn.style.borderColor = '#0b6b57';
    autoBtn.style.background = 'white';
    autoBtn.style.color = '#69737d';
    autoBtn.style.borderColor = '#e9ecef';
  }
}

// ===== GET CURRENT LOCATION =====
// ===== GET CURRENT LOCATION WITH FREE GOOGLE MAP (No API Key) =====
function getCurrentLocation() {
  const status = document.getElementById('locationStatus');
  const details = document.getElementById('locationDetails');
  const mapDiv = document.getElementById('locationMap');
  const icon = document.getElementById('locationIcon');
  
  if (!status) return;
  
  if (!navigator.geolocation) {
    status.textContent = '❌ Location not supported';
    details.textContent = 'Your browser does not support location services. Please use manual address.';
    icon.textContent = '❌';
    return;
  }
  
  status.textContent = '⏳ Getting your location...';
  details.textContent = 'Please wait...';
  icon.textContent = '⏳';
  mapDiv.style.display = 'none';
  
  navigator.geolocation.getCurrentPosition(
    async function(position) {
      const { latitude, longitude } = position.coords;
      currentLocation.lat = latitude;
      currentLocation.lng = longitude;
      
      document.getElementById('autoLat').value = latitude;
      document.getElementById('autoLng').value = longitude;
      
      status.textContent = '✅ Location found!';
      icon.textContent = '📍';
      
      try {
        const address = await getAddressFromCoords(latitude, longitude);
        currentLocation.address = address;
        document.getElementById('autoAddress').value = address;
        details.textContent = address;
        
        // ===== FREE GOOGLE MAP (No API Key needed) =====
        mapDiv.style.display = 'flex';
        mapDiv.innerHTML = `
          <div style="width:100%;padding:10px;">
            <div style="font-weight:600;color:#0b6b57;margin-bottom:8px;font-size:14px;">
              📍 Location Detected
            </div>
            
            <!-- FREE Google Map Embed (No API Key Required) -->
            <div style="position:relative;width:100%;height:200px;border-radius:8px;overflow:hidden;margin-bottom:8px;border:1px solid #e9ecef;">
              <iframe
                width="100%"
                height="100%"
                frameborder="0"
                style="border:0;border-radius:8px;"
                allowfullscreen
                loading="lazy"
                src="https://maps.google.com/maps?q=${latitude},${longitude}&z=16&output=embed&hl=en">
              </iframe>
            </div>
            
            <!-- Address and Actions -->
            <div style="font-size:13px;color:#69737d;margin-bottom:8px;word-break:break-word;">
              📍 ${address}
            </div>
            
            <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
              <a href="https://www.google.com/maps?q=${latitude},${longitude}" 
                 target="_blank" 
                 style="padding:6px 16px;background:#0b6b57;color:white;border:none;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;text-decoration:none;display:inline-flex;align-items:center;gap:4px;">
                🗺️ Open in Google Maps
              </a>
              <button onclick="copyAddress()" 
                      style="padding:6px 16px;background:#f39c12;color:white;border:none;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;">
                📋 Copy Address
              </button>
            </div>
            
            <div style="font-size:11px;color:#69737d;margin-top:6px;text-align:center;">
              Lat: ${latitude.toFixed(6)}, Lng: ${longitude.toFixed(6)}
            </div>
          </div>
        `;
        showToast('📍 Location detected successfully!', 'success');
      } catch (error) {
        details.textContent = 'Could not get address. Please check manually.';
        console.error('Reverse geocoding error:', error);
        mapDiv.style.display = 'flex';
        mapDiv.innerHTML = `
          <div style="text-align:center;padding:20px;width:100%;">
            <div style="font-size:32px;">⚠️</div>
            <div style="font-weight:600;color:#e74c3c;margin-top:4px;">Address Not Found</div>
            <div style="font-size:13px;color:#69737d;margin-top:4px;">
              Lat: ${latitude.toFixed(4)}, Lng: ${longitude.toFixed(4)}
            </div>
            <a href="https://www.google.com/maps?q=${latitude},${longitude}" 
               target="_blank" 
               style="display:inline-block;margin-top:8px;padding:6px 16px;background:#0b6b57;color:white;border:none;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;text-decoration:none;">
              🗺️ Open in Google Maps
            </a>
          </div>
        `;
      }
    },
    function(error) {
      console.error('Geolocation error:', error);
      let errorMessage = '';
      
      switch(error.code) {
        case error.PERMISSION_DENIED:
          errorMessage = 'Please allow location access in your browser settings.';
          break;
        case error.POSITION_UNAVAILABLE:
          errorMessage = 'Location information is unavailable.';
          break;
        case error.TIMEOUT:
          errorMessage = 'Location request timed out. Please try again.';
          break;
        default:
          errorMessage = 'Could not get your location.';
      }
      
      status.textContent = '❌ Location failed';
      details.textContent = `${errorMessage} Please use manual address.`;
      icon.textContent = '❌';
      mapDiv.style.display = 'flex';
      mapDiv.innerHTML = `
        <div style="text-align:center;padding:20px;width:100%;">
          <div style="font-size:32px;">📍</div>
          <div style="font-weight:600;color:#e74c3c;margin-top:4px;">Location Error</div>
          <div style="font-size:13px;color:#69737d;margin-top:4px;">${errorMessage}</div>
          <button onclick="toggleAddressMode('manual')" 
                  style="margin-top:8px;padding:6px 16px;background:#f39c12;color:white;border:none;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;">
            ✏️ Use Manual Address
          </button>
        </div>
      `;
    },
    {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 60000
    }
  );
}

// ===== GET ADDRESS FROM COORDINATES (Reverse Geocoding) =====
async function getAddressFromCoords(lat, lng) {
  try {
    // Using OpenStreetMap Nominatim API (Free, no API key needed)
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1&accept-language=en`
    );
    
    if (!response.ok) {
      throw new Error('Nominatim API error');
    }
    
    const data = await response.json();
    
    if (data && data.display_name) {
      // Clean up the address - remove extra commas
      let address = data.display_name;
      // Limit length
      if (address.length > 200) {
        address = address.substring(0, 200) + '...';
      }
      return address;
    }
    
    // Fallback: Return coordinates
    return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
    
  } catch (error) {
    console.error('Reverse geocoding error:', error);
    
    // Try Google Maps Geocoding as fallback (if you have API key)
    // Uncomment and add your API key if needed
    /*
    try {
      const GOOGLE_API_KEY = 'YOUR_GOOGLE_API_KEY';
      const response = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_API_KEY}`
      );
      const data = await response.json();
      if (data.results && data.results[0]) {
        return data.results[0].formatted_address;
      }
    } catch (googleError) {
      console.error('Google Geocoding error:', googleError);
    }
    */
    
    throw error;
  }
}

// ===== COPY ADDRESS =====
function copyAddress() {
  const address = document.getElementById('autoAddress')?.value;
  if (!address) {
    showToast('No address to copy!', 'error');
    return;
  }
  
  navigator.clipboard?.writeText(address).then(() => {
    showToast('📋 Address copied to clipboard!', 'success');
  }).catch(() => {
    // Fallback
    const textarea = document.createElement('textarea');
    textarea.value = address;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
    showToast('📋 Address copied to clipboard!', 'success');
  });
}

// ===== OPEN GOOGLE MAPS =====
function openGoogleMaps(lat, lng) {
  // Try to open in Google Maps app first, then web
  const url = `https://www.google.com/maps?q=${lat},${lng}`;
  window.open(url, '_blank');
}

// ===== PLACE ORDER (UPDATED) =====
async function placeOrder(event) {
  event.preventDefault();
  
  let address = '';
  let latitude = null;
  let longitude = null;
  
  // Get address based on mode
  if (addressMode === 'auto') {
    address = document.getElementById('autoAddress').value;
    latitude = document.getElementById('autoLat').value;
    longitude = document.getElementById('autoLng').value;
    
    if (!address || address.trim() === '') {
      showToast('📍 Could not detect your location. Please try again or use manual address.', 'error');
      return;
    }
  } else {
    address = document.getElementById('address').value.trim();
    if (!address) {
      showToast('Please enter your delivery address.', 'error');
      return;
    }
  }
  
  // Validate name and phone
  const name = document.getElementById('customerName').value.trim();
  const phone = document.getElementById('phone').value.trim();
  
  if (!name) {
    showToast('Please enter your full name.', 'error');
    return;
  }
  
  if (!phone || phone.length < 10) {
    showToast('Please enter a valid phone number.', 'error');
    return;
  }
  
  // Save data for next time
  localStorage.setItem('checkout_name', name);
  localStorage.setItem('checkout_phone', phone);
  if (addressMode === 'manual') {
    localStorage.setItem('checkout_address', address);
  }
  
  try {
    const items = cart.map(item => ({ foodId: item.foodId, quantity: item.quantity }));
    const instructions = document.getElementById('instructions')?.value || '';
    const paymentMethod = document.getElementById('paymentMethod')?.value || 'cash';
    
    // Show loading state
    const submitBtn = event.target.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.textContent = '⏳ Placing Order...';
      submitBtn.disabled = true;
    }
    
    const result = await api("/api/orders", {
      method: "POST",
      body: JSON.stringify({
        items,
        customerName: name,
        phone: phone,
        address: address,
        instructions: instructions,
        paymentMethod: paymentMethod,
        latitude: latitude ? parseFloat(latitude) : null,
        longitude: longitude ? parseFloat(longitude) : null,
        addressMode: addressMode
      })
    });
    
    cart = [];
    saveCart();
    closeModal();
    
    // Clear stored address if it was auto
    if (addressMode === 'auto') {
      localStorage.removeItem('checkout_address');
    }
    
    showToast(`🎉 Order #${result.orderId} placed successfully! Check your email for confirmation.`, 'success');
  } catch (error) {
    showToast(error.message || 'Could not place order. Please try again.', 'error');
    console.error('Order error:', error);
    
    // Reset button
    const submitBtn = event.target.querySelector('button[type="submit"]');
    if (submitBtn) {
      const total = cart.reduce((sum, item) => {
        const food = foods.find(f => String(f.id) === String(item.foodId));
        return sum + (food ? food.price * item.quantity : 0);
      }, 0);
      submitBtn.textContent = `✅ Place Order - ৳${total.toFixed(2)}`;
      submitBtn.disabled = false;
    }
  }
}

// ===== EXIT CHECKOUT - Clean up =====
// Add this to your closeModal function or create a cleanup function
function cleanupCheckout() {
  document.removeEventListener('input', saveCheckoutData);
  currentLocation = { lat: null, lng: null, address: '' };
}

// Override closeModal to include cleanup
const originalCloseModal = closeModal;
closeModal = function() {
  cleanupCheckout();
  originalCloseModal.call(this);
};