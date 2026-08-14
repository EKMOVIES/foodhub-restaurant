// ===== STATE =====
let token = localStorage.getItem('adminToken');
let foods = [];
let categories = [];
let selectedUser = null;
let poller = null;
let allOrders = [];
let allUsers = [];

// ===== DOM HELPERS =====
const $ = id => document.getElementById(id);
const $$ = selector => document.querySelectorAll(selector);

// ===== TOAST SYSTEM =====
function showToast(message, type = 'info') {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.className = 'toast ' + type;
  toast.classList.add('show');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), 3000);
}

// ===== API =====
async function api(url, opt = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const res = await fetch(url, { ...opt, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || 'Request failed');
  return data;
}

// ===== SIDEBAR TOGGLE =====
function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  sidebar.classList.toggle('open');
  
  let overlay = document.querySelector('.sidebar-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'sidebar-overlay';
    overlay.onclick = toggleSidebar;
    document.body.appendChild(overlay);
  }
  overlay.classList.toggle('active');
}

// ===== NAVIGATION =====
function navigateTo(section) {
  document.querySelectorAll('.sidebar-nav .nav-link[data-section]').forEach(link => {
    link.classList.toggle('active', link.dataset.section === section);
  });
  
  document.querySelectorAll('.content-section').forEach(el => {
    el.classList.toggle('active', el.id === 'section-' + section);
  });
  
  if (section === 'reviews') {
    loadAdminReviews();
  }
   if (section === 'subscribers') {  
    loadSubscribers();
  }
  if (section === 'faqs') {
  loadFaqs();
}
  const sidebar = document.getElementById('sidebar');
  if (sidebar.classList.contains('open')) {
    toggleSidebar();
  }
}

// ===== AUTH =====
async function login(e) {
  e.preventDefault();
  const errorEl = document.getElementById('error');
  if (errorEl) errorEl.textContent = '';
  
  const email = document.getElementById('email');
  const password = document.getElementById('password');
  
  if (!email || !password) {
    showToast('Please fill in all fields', 'error');
    return;
  }
  
  try {
    const data = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: email.value,
        password: password.value
      })
    });
    
    if (data.user.role !== 'admin') {
      throw new Error('This account is not an admin.');
    }
    
    token = data.token;
    localStorage.setItem('adminToken', token);
    
    document.getElementById('loginOverlay').classList.add('hidden');
    document.getElementById('mainContent').classList.remove('hidden');
    
    await showDashboard();
    showToast('Welcome back, Admin!', 'success');
  } catch (err) {
    if (errorEl) errorEl.textContent = err.message;
    showToast(err.message, 'error');
  }
}

function logout() {
  localStorage.removeItem('adminToken');
  token = null;
  if (poller) clearInterval(poller);
  
  document.getElementById('loginOverlay').classList.remove('hidden');
  document.getElementById('mainContent').classList.add('hidden');
  
  showToast('Logged out successfully', 'info');
}

// ===== DASHBOARD =====
async function showDashboard() {
  try {
    const me = await api('/api/me');
    if (me.role !== 'admin') throw new Error('Admin access required.');
    
    const adminName = document.getElementById('adminName');
    if (adminName) adminName.textContent = me.name || 'Admin';
    
    await Promise.all([
      loadStats(),
      loadCategories(),
      loadFoods(),
      loadOrders(),
      loadUsers(),
      loadChats(),
      loadAdminReviews(),
      loadSubscribers(),
      loadFaqs()
    ]);
    
    loadRecentOrders();
    
    if (poller) clearInterval(poller);
    poller = setInterval(async () => {
      try {
        await loadChats();
        if (selectedUser) await refreshSelectedChat();
      } catch {}
    }, 3000);
    
  } catch (err) {
    console.error('Dashboard error:', err);
    showToast('Error loading dashboard: ' + err.message, 'error');
  }
}

// ===== STATS =====
async function loadStats() {
  try {
    const stats = await api('/api/admin/stats');
    const foodsN = document.getElementById('foodsN');
    const ordersN = document.getElementById('ordersN');
    const customersN = document.getElementById('customersN');
    const revenueN = document.getElementById('revenueN');
    
    if (foodsN) foodsN.textContent = stats.foods;
    if (ordersN) ordersN.textContent = stats.orders;
    if (customersN) customersN.textContent = stats.customers;
    if (revenueN) revenueN.textContent = '৳' + Number(stats.revenue).toFixed(2);
  } catch (err) {
    console.error('Stats error:', err);
  }
}

// ===== RECENT ORDERS =====
async function loadRecentOrders() {
  try {
    const orders = await api('/api/admin/orders');
    const recent = orders.slice(0, 5);
    const container = document.getElementById('recentOrdersList');
    
    if (!container) return;
    
    if (!recent || recent.length === 0) {
      container.innerHTML = '<p class="text-muted">No recent orders</p>';
      return;
    }
    
    container.innerHTML = recent.map(order => `
      <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #f0f2f5;cursor:pointer;" onclick="navigateTo('orders')">
        <div>
          <strong>#${order.id}</strong>
          <div style="font-size:13px;color:#69737d;">${esc(order.customer_name)}</div>
        </div>
        <span style="font-weight:700;color:#0b6b57;">৳${Number(order.total).toFixed(2)}</span>
      </div>
    `).join('');
  } catch (err) {
    console.error('Recent orders error:', err);
  }
}

// ===== CATEGORIES =====
async function loadCategories() {
  try {
    categories = await api('/api/categories');
    renderCategories();
    populateCategorySelect();
    return categories;
  } catch (err) {
    console.error('Load categories error:', err);
    const container = document.getElementById('categoryList');
    if (container) {
      container.innerHTML = '<p class="text-muted">Error loading categories.</p>';
    }
  }
}

function renderCategories() {
  const container = document.getElementById('categoryList');
  if (!container) return;
  
  if (!categories || categories.length === 0) {
    container.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:40px;color:#69737d;">
        <i class="fas fa-tags" style="font-size:48px;display:block;margin-bottom:12px;opacity:0.3;"></i>
        <p>No categories available. Add your first category!</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = categories.map(c => `
    <div class="category-card">
      <span class="icon">${c.icon || '📁'}</span>
      <div class="name">${esc(c.name)}</div>
      <div class="desc">${esc(c.description || '')}</div>
      <span class="food-count">${c.food_count || 0} foods</span>
      <div class="actions">
        <button class="edit-btn" onclick="editCategory(${c.id})">
          <i class="fas fa-edit"></i> Edit
        </button>
        <button class="delete-btn" onclick="delCategory(${c.id})">
          <i class="fas fa-trash"></i>
        </button>
      </div>
    </div>
  `).join('');
}

function populateCategorySelect() {
  const select = document.getElementById('foodCategory');
  if (!select) return;
  select.innerHTML = '<option value="">Select Category</option>';
  categories.forEach(c => {
    select.innerHTML += `<option value="${c.id}">${c.icon || '📁'} ${esc(c.name)}</option>`;
  });
}

// ===== CATEGORY CRUD =====
function openCategory(c = null) {
  const title = document.getElementById('categoryFormTitle');
  if (title) {
    title.innerHTML = c ? 
      '<i class="fas fa-edit"></i> Edit Category' : 
      '<i class="fas fa-plus"></i> Add Category';
  }
  
  const idField = document.getElementById('categoryId');
  const nameField = document.getElementById('categoryName');
  const iconField = document.getElementById('categoryIcon');
  const descField = document.getElementById('categoryDesc');
  
  if (idField) idField.value = c?.id || '';
  if (nameField) nameField.value = c?.name || '';
  if (iconField) iconField.value = c?.icon || '';
  if (descField) descField.value = c?.description || '';
  
  const modal = document.getElementById('categoryModal');
  if (modal) modal.classList.add('visible');
}

function closeCategory() {
  const modal = document.getElementById('categoryModal');
  if (modal) modal.classList.remove('visible');
}

function editCategory(id) {
  const cat = categories.find(c => c.id === id);
  if (!cat) { showToast('Category not found!', 'error'); return; }
  openCategory(cat);
}

async function saveCategory(e) {
  e.preventDefault();
  const id = document.getElementById('categoryId').value;
  const body = {
    name: document.getElementById('categoryName').value.trim(),
    icon: document.getElementById('categoryIcon').value.trim() || '📁',
    description: document.getElementById('categoryDesc').value.trim()
  };
  
  try {
    if (id) {
      await api('/api/admin/categories/' + id, { method: 'PUT', body: JSON.stringify(body) });
      showToast('Category updated!', 'success');
    } else {
      await api('/api/admin/categories', { method: 'POST', body: JSON.stringify(body) });
      showToast('Category added!', 'success');
    }
    closeCategory();
    await loadCategories();
    await loadFoods();
    await loadStats();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

async function delCategory(id) {
  const cat = categories.find(c => c.id === id);
  if (!cat) return;
  
  if (cat.food_count > 0) {
    if (!confirm(`Category "${cat.name}" has ${cat.food_count} foods. Delete anyway?`)) return;
  } else {
    if (!confirm('Delete this category?')) return;
  }
  
  try {
    await api('/api/admin/categories/' + id, { method: 'DELETE' });
    await loadCategories();
    await loadFoods();
    await loadStats();
    showToast('Category deleted!', 'success');
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

// ===== FOODS =====
async function loadFoods() {
  try {
    foods = await api('/api/foods');
    renderFoods();
  } catch (err) {
    console.error('Load foods error:', err);
    const container = document.getElementById('foodList');
    if (container) {
      container.innerHTML = '<p class="text-muted">Error loading foods.</p>';
    }
  }
}

function renderFoods() {
  const container = document.getElementById('foodList');
  if (!container) return;
  
  if (!foods || foods.length === 0) {
    container.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:40px;color:#69737d;">
        <i class="fas fa-utensils" style="font-size:48px;display:block;margin-bottom:12px;opacity:0.3;"></i>
        <p>No food items available. Add your first item!</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = foods.map(f => {
    const cat = categories.find(c => c.id === f.category_id);
    const hasDiscount = f.discount_percent > 0;
    const discountPrice = hasDiscount ? f.price - (f.price * f.discount_percent / 100) : null;
    
    return `
      <div class="food-card">
        <img src="${f.image}" alt="${esc(f.name)}" onerror="this.src='https://via.placeholder.com/400x160?text=No+Image'">
        <div class="food-body">
          <h3>${esc(f.name)}</h3>
          ${cat ? `<span class="category-tag">${cat.icon} ${esc(cat.name)}</span>` : ''}
          ${hasDiscount ? `<span class="discount-tag">-${f.discount_percent}%</span>` : ''}
          <p>${esc(f.description)}</p>
          <div class="price">
            ${hasDiscount ? `
              <span class="original-price">৳${Number(f.price).toFixed(2)}</span>
              <span class="discount-price">৳${discountPrice.toFixed(2)}</span>
            ` : `
              <span>৳${Number(f.price).toFixed(2)}</span>
            `}
          </div>
          <div class="actions">
            <button class="edit-btn" onclick="editFood(${f.id})">
              <i class="fas fa-edit"></i> Edit
            </button>
            <button class="delete-btn" onclick="delFood(${f.id})">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ===== FOOD CRUD =====
function openFood(f = null) {
  const title = document.getElementById('formTitle');
  if (title) {
    title.innerHTML = f ? 
      '<i class="fas fa-edit"></i> Edit Food' : 
      '<i class="fas fa-plus"></i> Add Food';
  }
  
  const idField = document.getElementById('foodId');
  const nameField = document.getElementById('foodName');
  const descField = document.getElementById('foodDesc');
  const priceField = document.getElementById('foodPrice');
  const discountField = document.getElementById('foodDiscount');
  const imageField = document.getElementById('foodImage');
  const categoryField = document.getElementById('foodCategory');
  
  if (idField) idField.value = f?.id || '';
  if (nameField) nameField.value = f?.name || '';
  if (descField) descField.value = f?.description || '';
  if (priceField) priceField.value = f?.price || '';
  if (discountField) discountField.value = f?.discount_percent || 0;
  if (imageField) imageField.value = f?.image || '';
  if (categoryField) categoryField.value = f?.category_id || '';
  
  const modal = document.getElementById('modal');
  if (modal) modal.classList.add('visible');
}

function closeFood() {
  const modal = document.getElementById('modal');
  if (modal) modal.classList.remove('visible');
}

function editFood(id) {
  const numId = Number(id);
  let food = null;
  
  food = foods.find(f => f.id === numId);
  if (!food) {
    food = foods.find(f => String(f.id) === String(id));
  }
  if (!food && !isNaN(numId)) {
    food = foods.find(f => Number(f.id) === numId);
  }
  
  if (!food) {
    showToast('Food not found! Please refresh and try again.', 'error');
    return;
  }
  
  openFood(food);
}

async function delFood(id) {
  if (!confirm('Delete this food item?')) return;
  try {
    const numId = Number(id);
    if (isNaN(numId)) {
      showToast('Invalid food ID', 'error');
      return;
    }
    await api('/api/admin/foods/' + numId, { method: 'DELETE' });
    await Promise.all([loadFoods(), loadStats()]);
    showToast('Food deleted!', 'success');
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

async function saveFood(e) {
  e.preventDefault();
  const id = document.getElementById('foodId').value;
  const body = {
    name: document.getElementById('foodName').value.trim(),
    description: document.getElementById('foodDesc').value.trim(),
    price: Number(document.getElementById('foodPrice').value),
    discount_percent: Number(document.getElementById('foodDiscount').value) || 0,
    image: document.getElementById('foodImage').value.trim(),
    category_id: document.getElementById('foodCategory').value || null
  };
  
  if (!body.name || !body.description || !body.price || !body.image) {
    showToast('Please fill in all required fields', 'error');
    return;
  }
  
  if (body.discount_percent < 0 || body.discount_percent > 100) {
    showToast('Discount must be between 0 and 100', 'error');
    return;
  }
  
  try {
    if (id) {
      const numId = Number(id);
      await api('/api/admin/foods/' + numId, { 
        method: 'PUT', 
        body: JSON.stringify(body) 
      });
      showToast('Food updated successfully!', 'success');
    } else {
      await api('/api/admin/foods', { 
        method: 'POST', 
        body: JSON.stringify(body) 
      });
      showToast('Food added successfully!', 'success');
    }
    
    closeFood();
    await Promise.all([loadFoods(), loadCategories(), loadStats()]);
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

// ===== ORDERS =====
async function loadOrders() {
  try {
    allOrders = await api('/api/admin/orders');
    renderOrders();
  } catch (err) {
    console.error('Load orders error:', err);
    const container = document.getElementById('orderList');
    if (container) {
      container.innerHTML = '<p class="text-muted">Error loading orders.</p>';
    }
  }
}

function renderOrders(filter = 'all') {
  const container = document.getElementById('orderList');
  if (!container) return;
  
  let filtered = allOrders;
  
  if (filter !== 'all') {
    filtered = allOrders.filter(o => o.status === filter);
  }
  
  if (!filtered || filtered.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:40px;color:#69737d;">
        <i class="fas fa-shopping-cart" style="font-size:48px;display:block;margin-bottom:12px;opacity:0.3;"></i>
        <p>No orders found.</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = filtered.map(o => `
    <div class="order-item">
      <div class="order-header">
        <span class="order-id">📦 Order #${o.id}</span>
        <span class="order-total">৳${Number(o.total).toFixed(2)}</span>
      </div>
      <div class="order-details">
        <span>👤 ${esc(o.customer_name)}</span>
        <span>📧 ${esc(o.customer_email)}</span>
        <span>📱 ${esc(o.phone)}</span>
        <span>📍 ${esc(o.address)}</span>
      </div>
      
      <!-- ===== FREE GOOGLE MAP SECTION (No API Key) ===== -->
      ${o.latitude ? `
        <div style="margin:10px 0;padding:12px;background:#f8f9fa;border-radius:8px;border-left:3px solid #0b6b57;">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px;">
            <span style="font-weight:600;font-size:14px;color:#17202a;">
              📍 Location
            </span>
            ${o.address_mode ? `
              <span style="font-size:11px;color:#69737d;background:#e9ecef;padding:2px 12px;border-radius:10px;">
                ${o.address_mode === 'auto' ? '📍 Auto-detected' : '✏️ Manual'}
              </span>
            ` : ''}
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
              src="https://maps.google.com/maps?q=${o.latitude},${o.longitude}&z=16&output=embed&hl=en">
            </iframe>
          </div>
          
          <!-- Address and Actions -->
          <div style="font-size:13px;color:#69737d;margin-bottom:6px;word-break:break-word;">
            📍 ${esc(o.address)}
          </div>
          
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <a href="https://www.google.com/maps?q=${o.latitude},${o.longitude}" 
               target="_blank" 
               style="display:inline-flex;align-items:center;gap:4px;padding:4px 12px;background:#0b6b57;color:white;border:none;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;text-decoration:none;">
              🗺️ Open in Google Maps
            </a>
            <a href="https://www.google.com/maps/dir//${o.latitude},${o.longitude}" 
               target="_blank" 
               style="display:inline-flex;align-items:center;gap:4px;padding:4px 12px;background:#f39c12;color:white;border:none;border-radius:6px;cursor:pointer;font-size:12px;font-weight:600;text-decoration:none;">
              🚗 Get Directions
            </a>
            <span style="font-size:11px;color:#69737d;display:flex;align-items:center;">
              Lat: ${parseFloat(o.latitude).toFixed(4)}, Lng: ${parseFloat(o.longitude).toFixed(4)}
            </span>
          </div>
        </div>
      ` : `
        <div style="margin:8px 0;padding:8px 12px;background:#f8f9fa;border-radius:6px;font-size:13px;">
          <span>📍 ${esc(o.address)}</span>
        </div>
      `}
      <!-- ===== END FREE GOOGLE MAP SECTION ===== -->
      
      ${o.instructions ? `
        <div style="margin:6px 0;font-size:13px;color:#69737d;padding:6px 12px;background:#fff8e1;border-radius:6px;border-left:3px solid #f39c12;">
          📝 ${esc(o.instructions)}
        </div>
      ` : ''}
      
      ${o.payment_method ? `
        <div style="margin:6px 0;font-size:13px;color:#69737d;">
          💳 ${esc(o.payment_method)}
        </div>
      ` : ''}
      
      <div class="order-items">
        🍽️ ${o.items.map(i => `${esc(i.food_name)} × ${i.quantity}`).join(', ')}
      </div>
      
      <div class="order-actions">
        <select onchange="updateOrderStatus(${o.id}, this.value)">
          ${['Pending','Confirmed','Preparing','Out for Delivery','Delivered','Cancelled'].map(s => 
            `<option ${s === o.status ? 'selected' : ''}>${s}</option>`
          ).join('')}
        </select>
        <span class="status-badge status-${o.status.toLowerCase().replace(/ /g, '_')}">${o.status}</span>
        <button class="print-invoice-btn" onclick="printOrder(${o.id})" title="Print Invoice">
          🖨️
        </button>
        <small style="color:#69737d;">${o.created_at}</small>
      </div>
    </div>
  `).join('');
}
function filterOrders() {
  const filter = document.getElementById('orderStatusFilter');
  renderOrders(filter ? filter.value : 'all');
}

async function updateOrderStatus(id, status) {
  try {
    await api('/api/admin/orders/' + id + '/status', {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
    await Promise.all([loadOrders(), loadStats(), loadRecentOrders()]);
    showToast(`Order #${id} updated to ${status}`, 'success');
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

// ===== USERS =====
async function loadUsers() {
  try {
    allUsers = await api('/api/admin/users');
    renderUsers();
  } catch (err) {
    console.error('Load users error:', err);
    const container = document.getElementById('userList');
    if (container) {
      container.innerHTML = '<p class="text-muted">Error loading users.</p>';
    }
  }
}

function renderUsers(search = '') {
  const container = document.getElementById('userList');
  if (!container) return;
  
  let filtered = allUsers;
  
  if (search) {
    const term = search.toLowerCase();
    filtered = allUsers.filter(u => 
      u.name.toLowerCase().includes(term) || 
      u.email.toLowerCase().includes(term)
    );
  }
  
  if (!filtered || filtered.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:40px;color:#69737d;">
        <i class="fas fa-users" style="font-size:48px;display:block;margin-bottom:12px;opacity:0.3;"></i>
        <p>No customers found.</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = `
    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Email</th>
            <th>Role</th>
            <th>Orders</th>
            <th>Spent</th>
            <th>Messages</th>
            <th>Joined</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map(u => `
            <tr>
              <td><strong>${esc(u.name)}</strong></td>
              <td>${esc(u.email)}</td>
              <td><span class="status-badge status-${u.role}">${u.role}</span></td>
              <td>${u.order_count}</td>
              <td>৳${Number(u.total_spent).toFixed(2)}</td>
              <td>${u.message_count}</td>
              <td style="font-size:12px;color:#69737d;">${u.created_at}</td>
                 <td>
                <button class="view-profile-btn" onclick="viewCustomerProfile('${u.id}')" title="View Profile">
                  👤 View
                </button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function filterUsers() {
  const search = document.getElementById('userSearch');
  renderUsers(search ? search.value : '');
}

// ===== CHATS =====
async function loadChats() {
  try {
    const chats = await api('/api/admin/chats');
    const container = document.getElementById('chatList');
    if (!container) return;
    
    const badge = document.getElementById('chatBadge');
    if (badge) {
      const unread = 0;
      badge.textContent = unread;
      badge.style.display = unread > 0 ? 'inline' : 'none';
    }
    
    if (!chats || chats.length === 0) {
      container.innerHTML = `
        <div style="text-align:center;padding:30px;color:#69737d;">
          <i class="fas fa-comments" style="font-size:32px;display:block;margin-bottom:8px;opacity:0.3;"></i>
          <p style="font-size:13px;">No conversations yet</p>
        </div>
      `;
      return;
    }
    
    container.innerHTML = chats.map(c => `
      <div class="chat-item ${String(selectedUser) === String(c.user_id) ? 'active' : ''}" 
           onclick="loadChat('${c.user_id}')">
        <div class="chat-name">${esc(c.name)}</div>
        <div class="chat-email">${esc(c.email)}</div>
        <div class="chat-preview">${esc(c.last_message || 'No messages yet')}</div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Load chats error:', err);
  }
}

function filterChatList() {
  const search = document.getElementById('chatSearch');
  if (!search) return;
  
  const term = search.value.toLowerCase();
  const items = document.querySelectorAll('.chat-item');
  items.forEach(item => {
    const text = item.textContent.toLowerCase();
    item.style.display = text.includes(term) ? 'block' : 'none';
  });
}

async function loadChat(uid, silent = false) {
  try {
    selectedUser = uid;
    const data = await api('/api/admin/chats/' + uid);
    
    const title = document.getElementById('chatTitle');
    if (title) {
      title.innerHTML = `
        <i class="fas fa-user-circle"></i> 
        ${data.user.name} — ${data.user.email}
      `;
    }
    
    const messagesContainer = document.getElementById('adminMessages');
    if (messagesContainer) {
      if (data.messages && data.messages.length > 0) {
        messagesContainer.innerHTML = data.messages.map(m => `
          <div class="chat-message ${m.sender_role === 'admin' ? 'admin-msg' : 'user-msg'}">
            ${esc(m.message)}
            <span class="msg-time">${m.created_at}</span>
          </div>
        `).join('');
      } else {
        messagesContainer.innerHTML = `
          <div style="text-align:center;padding:30px;color:#69737d;">
            <p>No messages yet. Start the conversation!</p>
          </div>
        `;
      }
      
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
    
    const form = document.getElementById('adminChatForm');
    if (form) {
      form.classList.remove('hidden');
      form.dataset.uid = uid;
    }
    
    if (!silent) await loadChats();
  } catch (err) {
    console.error('Load chat error:', err);
    showToast('Error loading chat: ' + err.message, 'error');
  }
}

async function refreshSelectedChat() {
  if (!selectedUser) return;
  try {
    const data = await api('/api/admin/chats/' + selectedUser);
    const box = document.getElementById('adminMessages');
    if (!box) return;
    
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    
    const html = data.messages && data.messages.length > 0 
      ? data.messages.map(m => `
          <div class="chat-message ${m.sender_role === 'admin' ? 'admin-msg' : 'user-msg'}">
            ${esc(m.message)}
            <span class="msg-time">${m.created_at}</span>
          </div>
        `).join('')
      : `<div style="text-align:center;padding:30px;color:#69737d;"><p>No messages yet.</p></div>`;
    
    if (box.innerHTML !== html) box.innerHTML = html;
    if (nearBottom) box.scrollTop = box.scrollHeight;
  } catch (err) {
    console.error('Refresh chat error:', err);
  }
}

async function sendAdminReply(e) {
  e.preventDefault();
  const form = document.getElementById('adminChatForm');
  const uid = form ? form.dataset.uid : null;
  const input = document.getElementById('adminChatInput');
  const message = input ? input.value.trim() : '';
  
  if (!uid || !message) return;
  
  try {
    await api('/api/admin/chats/' + uid + '/messages', {
      method: 'POST',
      body: JSON.stringify({ message })
    });
    if (input) input.value = '';
    await loadChat(uid);
    showToast('Reply sent!', 'success');
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

// ===== ADMIN REVIEWS =====

async function loadAdminReviews() {
  try {
    const reviews = await api('/api/admin/reviews');
    renderAdminReviews(reviews);
    
    const pending = reviews.filter(r => !r.is_approved).length;
    const badge = document.getElementById('reviewBadge');
    if (badge) {
      badge.textContent = pending;
      badge.style.display = pending > 0 ? 'inline' : 'none';
    }
    
    return reviews;
  } catch (err) {
    console.error('Error loading admin reviews:', err);
    const container = document.getElementById('reviewList');
    if (container) {
      container.innerHTML = `<p style="color:#e74c3c;">Error loading reviews: ${err.message}</p>`;
    }
  }
}

function renderAdminReviews(reviews) {
  const container = document.getElementById('reviewList');
  if (!container) return;
  
  if (!reviews || reviews.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:40px;color:#69737d;">
        <i class="fas fa-star" style="font-size:48px;display:block;margin-bottom:12px;opacity:0.3;"></i>
        <p>No reviews yet.</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = reviews.map(r => `
    <div class="admin-review" style="padding:15px;background:#f8f9fa;border-radius:10px;margin-bottom:12px;border-left:4px solid ${r.is_approved ? '#27ae60' : '#f39c12'};">
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
        <div>
          <strong>${esc(r.user_name)}</strong>
          <span style="color:#69737d;font-size:13px;display:block;">${esc(r.user_email)}</span>
        </div>
        <div style="color:#f39c12;font-size:18px;">${'★'.repeat(r.rating)}${'☆'.repeat(5-r.rating)}</div>
        <span class="review-status ${r.is_approved ? 'approved' : 'pending'}" style="font-size:12px;font-weight:600;padding:2px 10px;border-radius:12px;background:${r.is_approved ? '#d4edda' : '#fff3cd'};color:${r.is_approved ? '#155724' : '#856404'};">
          ${r.is_approved ? '✅ Approved' : '⏳ Pending'}
        </span>
      </div>
      <div style="margin:8px 0;color:#0b6b57;">
        <strong>${esc(r.food_name)}</strong>
      </div>
      ${r.comment ? `<p style="margin:8px 0;color:#69737d;">${esc(r.comment)}</p>` : ''}
      <div style="display:flex;gap:8px;margin:8px 0;flex-wrap:wrap;">
        ${!r.is_approved ? `
          <button onclick="approveReview(${r.id})" style="background:#27ae60;color:white;border:none;padding:6px 16px;border-radius:6px;cursor:pointer;font-weight:600;">
            ✅ Approve
          </button>
          <button onclick="rejectReview(${r.id})" style="background:#e74c3c;color:white;border:none;padding:6px 16px;border-radius:6px;cursor:pointer;font-weight:600;">
            ❌ Reject
          </button>
        ` : `
          <button onclick="rejectReview(${r.id})" style="background:#f39c12;color:white;border:none;padding:6px 16px;border-radius:6px;cursor:pointer;font-weight:600;">
            ↩️ Unapprove
          </button>
        `}
        <button onclick="deleteReview(${r.id})" style="background:#e74c3c;color:white;border:none;padding:6px 16px;border-radius:6px;cursor:pointer;font-weight:600;">
          🗑️ Delete
        </button>
      </div>
      <small style="color:#69737d;">${new Date(r.created_at).toLocaleString()}</small>
    </div>
  `).join('');
}

async function approveReview(id) {
  try {
    await api(`/api/admin/reviews/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_approved: true })
    });
    await loadAdminReviews();
    showToast('Review approved!', 'success');
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

async function rejectReview(id) {
  try {
    await api(`/api/admin/reviews/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_approved: false })
    });
    await loadAdminReviews();
    showToast('Review updated.', 'info');
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

async function deleteReview(id) {
  if (!confirm('Delete this review?')) return;
  try {
    await api(`/api/admin/reviews/${id}`, { method: 'DELETE' });
    await loadAdminReviews();
    showToast('Review deleted.', 'success');
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

// ===== GLOBAL SEARCH =====
function handleGlobalSearch(e) {
  const query = e.target.value.trim().toLowerCase();
  if (query.length < 2) return;
  
  const foodResults = foods.filter(f => 
    f.name.toLowerCase().includes(query) || 
    f.description.toLowerCase().includes(query)
  );
  
  const categoryResults = categories.filter(c => 
    c.name.toLowerCase().includes(query)
  );
  
  const orderResults = allOrders.filter(o => 
    String(o.id).includes(query) || 
    o.customer_name.toLowerCase().includes(query)
  );
  
  if (foodResults.length > 0) {
    navigateTo('foods');
    showToast(`Found ${foodResults.length} food items`, 'info');
  } else if (categoryResults.length > 0) {
    navigateTo('categories');
    showToast(`Found ${categoryResults.length} categories`, 'info');
  } else if (orderResults.length > 0) {
    navigateTo('orders');
    showToast(`Found ${orderResults.length} orders`, 'info');
  } else {
    showToast('No results found', 'info');
  }
}

// ===== UTILITY =====
function esc(v) {
  return String(v).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  })[c]);
}

// ===== EVENT LISTENERS =====
document.addEventListener('DOMContentLoaded', function() {
  const loginForm = document.getElementById('loginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', login);
  }
  
  const foodForm = document.getElementById('foodForm');
  if (foodForm) {
    foodForm.addEventListener('submit', saveFood);
  }
  
  const categoryForm = document.getElementById('categoryForm');
  if (categoryForm) {
    categoryForm.addEventListener('submit', saveCategory);
  }
  
  const adminChatForm = document.getElementById('adminChatForm');
  if (adminChatForm) {
    adminChatForm.addEventListener('submit', sendAdminReply);
  }
    const faqForm = document.getElementById('faqForm');
  if (faqForm) {
    faqForm.addEventListener('submit', saveFaq);
  }
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', logout);
  }
  
  document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        modal.classList.remove('visible');
      }
    });
  });
  
  if (token) {
    document.getElementById('loginOverlay').classList.add('hidden');
    document.getElementById('mainContent').classList.remove('hidden');
    showDashboard().catch(err => {
      console.error('Initialization error:', err);
      localStorage.removeItem('adminToken');
      token = null;
      document.getElementById('loginOverlay').classList.remove('hidden');
      document.getElementById('mainContent').classList.add('hidden');
    });
  } else {
    document.getElementById('loginOverlay').classList.remove('hidden');
    document.getElementById('mainContent').classList.add('hidden');
  }
});

// ===== EXPOSE FUNCTIONS =====
window.toggleSidebar = toggleSidebar;
window.navigateTo = navigateTo;
window.openCategory = openCategory;
window.closeCategory = closeCategory;
window.editCategory = editCategory;
window.delCategory = delCategory;
window.openFood = openFood;
window.closeFood = closeFood;
window.editFood = editFood;
window.delFood = delFood;
window.filterOrders = filterOrders;
window.updateOrderStatus = updateOrderStatus;
window.filterUsers = filterUsers;
window.loadChat = loadChat;
window.filterChatList = filterChatList;
window.handleGlobalSearch = handleGlobalSearch;
window.showToast = showToast;
window.logout = logout;
window.loadAdminReviews = loadAdminReviews;
window.approveReview = approveReview;
window.rejectReview = rejectReview;
window.deleteReview = deleteReview;


// ===== SUBSCRIBERS =====
async function loadSubscribers() {
  try {
    const subscribers = await api('/api/admin/subscribers');
    const container = document.getElementById('subscriberList');
    const total = document.getElementById('subscriberTotal');
    const badge = document.getElementById('subscriberBadge');
    
    if (total) total.textContent = subscribers.length;
    if (badge) {
      badge.textContent = subscribers.length;
      badge.style.display = subscribers.length > 0 ? 'inline' : 'none';
    }
    
    if (!container) return;
    
    if (subscribers.length === 0) {
      container.innerHTML = `
        <div style="text-align:center;padding:40px;color:#69737d;">
          <i class="fas fa-envelope" style="font-size:48px;display:block;margin-bottom:12px;opacity:0.3;"></i>
          <p>No subscribers yet.</p>
        </div>
      `;
      return;
    }
    
    container.innerHTML = `
      <div class="table-container">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Email</th>
              <th>Name</th>
              <th>Status</th>
              <th>Subscribed</th>
            </tr>
          </thead>
          <tbody>
            ${subscribers.map((s, i) => `
              <tr>
                <td>${i + 1}</td>
                <td><strong>${esc(s.email)}</strong></td>
                <td>${s.name ? esc(s.name) : '—'}</td>
                <td>
                  <span class="status-badge ${s.is_active ? 'status-delivered' : 'status-cancelled'}">
                    ${s.is_active ? '✅ Active' : '❌ Inactive'}
                  </span>
                </td>
                <td style="font-size:12px;color:#69737d;">${s.created_at}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    console.error('Error loading subscribers:', err);
  }
}

// ===== PRINT INVOICE =====
async function printOrder(orderId) {
  try {
    // প্রথমে allOrders থেকে খুঁজি
    let order = allOrders.find(o => o.id === orderId);
    
    // যদি না পাওয়া যায়, তাহলে API থেকে ডাইরেক্ট লোড করি
    if (!order) {
      showToast('Loading order details...', 'info');
      // অর্ডার ডিটেইল API কল
      const response = await fetch(`/api/admin/orders/${orderId}`, {
        headers: { 'Authorization': 'Bearer ' + token }
      });
      
      if (!response.ok) {
        throw new Error('Order not found');
      }
      
      order = await response.json();
    }
    
    // যদি এখনও order না পাওয়া যায়
    if (!order) {
      showToast('Order not found!', 'error');
      return;
    }
    
    // আইটেমগুলি সঠিকভাবে ফরম্যাট করুন
    const items = order.items || [];
    
    // প্রিন্ট উইন্ডো তৈরি করুন
    const printWindow = window.open('', '_blank', 'width=800,height=600');
    if (!printWindow) {
      showToast('Please allow popups for this site.', 'error');
      return;
    }
    
    // ইনভয়েস HTML তৈরি করুন
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Invoice #${order.id} - FoodHub</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; background: #fff; color: #17202a; }
          .invoice-container { max-width: 700px; margin: 0 auto; background: white; padding: 40px; }
          .invoice-header { text-align: center; border-bottom: 3px solid #0b6b57; padding-bottom: 20px; margin-bottom: 25px; }
          .invoice-header .logo { font-size: 36px; font-weight: 800; color: #0b6b57; }
          .invoice-header .logo span { color: #f39c12; }
          .invoice-header .subtitle { color: #69737d; font-size: 14px; }
          .invoice-title { display: flex; justify-content: space-between; align-items: center; margin: 20px 0; padding: 15px; background: #f8f9fa; border-radius: 8px; }
          .invoice-title .order-id { font-size: 20px; font-weight: 700; }
          .invoice-title .order-status { padding: 6px 16px; border-radius: 20px; font-size: 13px; font-weight: 700; color: white; background: ${order.status === 'Delivered' ? '#27ae60' : order.status === 'Cancelled' ? '#e74c3c' : order.status === 'Pending' ? '#f39c12' : '#3498db'}; }
          .section-title { font-size: 16px; font-weight: 700; margin: 20px 0 12px; padding-bottom: 8px; border-bottom: 2px solid #f0f2f5; }
          .customer-details { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; background: #f8f9fa; padding: 15px 20px; border-radius: 8px; margin-bottom: 20px; }
          .customer-details .detail { display: flex; flex-direction: column; }
          .customer-details .detail .label { font-size: 11px; color: #69737d; text-transform: uppercase; font-weight: 600; }
          .customer-details .detail .value { font-size: 15px; font-weight: 600; color: #17202a; }
          .items-table { width: 100%; border-collapse: collapse; margin: 15px 0; }
          .items-table th { background: #0b6b57; color: white; padding: 12px 16px; text-align: left; font-weight: 600; font-size: 13px; }
          .items-table td { padding: 10px 16px; border-bottom: 1px solid #f0f2f5; font-size: 14px; }
          .items-table .total-row { background: #f8f9fa; font-weight: 700; font-size: 16px; }
          .items-table .total-row td { padding: 15px 16px; }
          .items-table .total-row .grand-total { color: #0b6b57; font-size: 20px; }
          .invoice-footer { margin-top: 30px; padding-top: 20px; border-top: 2px solid #f0f2f5; text-align: center; color: #69737d; font-size: 13px; }
          .invoice-footer .thanks { font-size: 18px; font-weight: 700; color: #0b6b57; margin-bottom: 6px; }
          @media print { body { padding: 20px; } .invoice-container { padding: 20px; } }
          @media (max-width: 600px) { .customer-details { grid-template-columns: 1fr; } .invoice-title { flex-direction: column; gap: 10px; text-align: center; } }
        </style>
      </head>
      <body>
        <div class="invoice-container">
          <div class="invoice-header">
            <div class="logo">🍽️ Food<span>Hub</span></div>
            <div class="subtitle">Fresh • Fast • Delicious</div>
          </div>
          <div class="invoice-title">
            <span class="order-id">Invoice #${order.id}</span>
            <span class="order-status">${order.status}</span>
          </div>
          <p style="color:#69737d;font-size:14px;margin-bottom:15px;">
            <strong>Date:</strong> ${new Date(order.created_at).toLocaleString()}
          </p>
          <div class="section-title">👤 Customer Details</div>
          <div class="customer-details">
            <div class="detail"><span class="label">Full Name</span><span class="value">${esc(order.customer_name)}</span></div>
            <div class="detail"><span class="label">Phone</span><span class="value">${esc(order.phone)}</span></div>
            <div class="detail" style="grid-column:1/-1;"><span class="label">Delivery Address</span><span class="value">${esc(order.address)}</span></div>
            <div class="detail"><span class="label">Email</span><span class="value">${esc(order.customer_email || 'N/A')}</span></div>
            <div class="detail"><span class="label">Order Date</span><span class="value">${new Date(order.created_at).toLocaleDateString()}</span></div>
          </div>
          <div class="section-title">🍽️ Order Items</div>
          <table class="items-table">
            <thead><tr><th style="width:50%;">Item</th><th style="width:15%;text-align:center;">Qty</th><th style="width:17%;text-align:right;">Price</th><th style="width:18%;text-align:right;">Total</th></tr></thead>
            <tbody>
              ${items.length > 0 ? items.map(item => `
                <tr>
                  <td>${esc(item.food_name || item.name || 'Unknown Item')}</td>
                  <td style="text-align:center;">${item.quantity}</td>
                  <td style="text-align:right;">৳${Number(item.price).toFixed(2)}</td>
                  <td style="text-align:right;">৳${(item.price * item.quantity).toFixed(2)}</td>
                </tr>
              `).join('') : `
                <tr><td colspan="4" style="text-align:center;color:#69737d;">No items found</td></tr>
              `}
              <tr class="total-row">
                <td colspan="3" style="text-align:right;">Grand Total</td>
                <td style="text-align:right;" class="grand-total">৳${Number(order.total).toFixed(2)}</td>
              </tr>
            </tbody>
          </table>
          <div class="invoice-footer">
            <div class="thanks">Thank you for your order! 🎉</div>
            <div>FoodHub Restaurant • Fresh • Fast • Delicious</div>
            <div style="margin-top:8px;font-size:12px;color:#69737d;">
              📞 +880 1234 567890 &nbsp;|&nbsp; 📧 hello@foodhub.com
            </div>
          </div>
        </div>
        <script>
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 500);
          };
        <\/script>
      </body>
      </html>
    `);
    
    printWindow.document.close();
    
  } catch (error) {
    console.error('Print error:', error);
    showToast('Error loading order: ' + error.message, 'error');
  }
}

// ===== CUSTOMER PROFILE =====
async function viewCustomerProfile(userId) {
  try {
    showToast('Loading customer profile...', 'info');
    
    const data = await api(`/api/admin/customers/${userId}`);
    
    const container = document.getElementById('customerProfileContent');
    const subtitle = document.getElementById('customerProfileSubtitle');
    
    if (subtitle) {
      subtitle.textContent = `Viewing: ${data.user.name} (${data.user.email})`;
    }
    
    // Status color helper
    const getStatusColor = (status) => {
      const colors = {
        'Pending': '#f39c12',
        'Confirmed': '#3498db',
        'Preparing': '#9b59b6',
        'Out for Delivery': '#e67e22',
        'Delivered': '#27ae60',
        'Cancelled': '#e74c3c'
      };
      return colors[status] || '#69737d';
    };
    
    const getStatusEmoji = (status) => {
      const emojis = {
        'Pending': '⏳',
        'Confirmed': '✅',
        'Preparing': '👨‍🍳',
        'Out for Delivery': '🛵',
        'Delivered': '🏠',
        'Cancelled': '❌'
      };
      return emojis[status] || '📦';
    };
    
    container.innerHTML = `
      <div class="customer-profile">
        <!-- Profile Header -->
        <div class="profile-header">
          <div class="profile-avatar">
            ${data.user.name.charAt(0).toUpperCase()}
          </div>
          <div class="profile-info">
            <h3>${esc(data.user.name)}</h3>
            <p class="profile-email">📧 ${esc(data.user.email)}</p>
            <p class="profile-joined">📅 Joined: ${new Date(data.user.created_at).toLocaleDateString()}</p>
            <span class="profile-role status-badge status-${data.user.role}">${data.user.role}</span>
          </div>
          <div class="profile-actions">
            <button class="btn-secondary" onclick="loadChat('${userId}'); navigateTo('chats')">
              💬 Chat
            </button>
          </div>
        </div>
        
        <!-- Stats -->
        <div class="profile-stats">
          <div class="stat-card">
            <div class="stat-number">${data.summary.total_orders}</div>
            <div class="stat-label">Total Orders</div>
          </div>
          <div class="stat-card">
            <div class="stat-number" style="color:#27ae60;">${data.summary.delivered}</div>
            <div class="stat-label">✅ Delivered</div>
          </div>
          <div class="stat-card">
            <div class="stat-number" style="color:#f39c12;">${data.summary.pending}</div>
            <div class="stat-label">⏳ Pending</div>
          </div>
          <div class="stat-card">
            <div class="stat-number" style="color:#0b6b57;">৳${Number(data.summary.total_spent).toFixed(2)}</div>
            <div class="stat-label">💰 Total Spent</div>
          </div>
        </div>
        
        <!-- Order History -->
        <div class="profile-orders">
          <h3>📦 Order History (${data.orders.length})</h3>
          ${data.orders.length > 0 ? data.orders.map(order => `
            <div class="profile-order-item">
              <div class="order-header">
                <span class="order-id">#${order.id}</span>
                <span class="order-status" style="background:${getStatusColor(order.status)};color:white;padding:2px 12px;border-radius:12px;font-size:12px;font-weight:600;">
                  ${getStatusEmoji(order.status)} ${order.status}
                </span>
                <span class="order-total">৳${Number(order.total).toFixed(2)}</span>
              </div>
              <div class="order-details">
                <span>📱 ${esc(order.phone)}</span>
                <span>📍 ${esc(order.address)}</span>
                <span>📅 ${new Date(order.created_at).toLocaleString()}</span>
              </div>
              <div class="order-items">
                ${order.items.map(item => `${esc(item.food_name)} × ${item.quantity}`).join(', ')}
              </div>
              <div class="order-actions">
                <button class="btn-secondary" onclick="navigateTo('orders')">📋 View in Orders</button>
              </div>
            </div>
          `).join('') : `
            <p style="text-align:center;color:#69737d;padding:20px;">No orders yet.</p>
          `}
        </div>
      </div>
    `;
    
    // Customer সেকশনে নেভিগেট করুন
    navigateTo('customer');
    
  } catch (error) {
    console.error('Error loading customer profile:', error);
    showToast('Error loading customer profile: ' + error.message, 'error');
  }
}


// ===== FAQ MANAGEMENT =====

let allFaqs = [];

async function loadFaqs() {
  try {
    allFaqs = await api('/api/admin/faqs');
    renderFaqs();
    
    const badge = document.getElementById('faqBadge');
    if (badge) {
      const count = allFaqs.filter(f => f.is_active).length;
      badge.textContent = count;
      badge.style.display = count > 0 ? 'inline' : 'none';
    }
  } catch (err) {
    console.error('Error loading FAQs:', err);
    const container = document.getElementById('faqList');
    if (container) {
      container.innerHTML = `<p style="color:#e74c3c;">Error loading FAQs: ${err.message}</p>`;
    }
  }
}

function renderFaqs() {
  const container = document.getElementById('faqList');
  if (!container) return;
  
  if (!allFaqs || allFaqs.length === 0) {
    container.innerHTML = `
      <div style="text-align:center;padding:40px;color:#69737d;">
        <i class="fas fa-question-circle" style="font-size:48px;display:block;margin-bottom:12px;opacity:0.3;"></i>
        <p>No FAQs yet. Add your first FAQ!</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = allFaqs.map(f => `
    <div class="faq-admin-item" style="padding:15px;background:#f8f9fa;border-radius:10px;margin-bottom:12px;border-left:4px solid ${f.is_active ? '#27ae60' : '#e74c3c'};">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;">
        <div style="flex:1;">
          <div style="font-weight:700;font-size:16px;color:#17202a;">
            ${esc(f.question)}
          </div>
          <div style="color:#69737d;font-size:14px;margin:6px 0;">
            ${esc(f.answer)}
          </div>
          <div style="display:flex;gap:12px;font-size:12px;color:#69737d;flex-wrap:wrap;">
            <span>📂 ${esc(f.category || 'General')}</span>
            <span>🔢 Order: ${f.display_order}</span>
            <span class="faq-status" style="color:${f.is_active ? '#27ae60' : '#e74c3c'};font-weight:600;">
              ${f.is_active ? '✅ Active' : '❌ Inactive'}
            </span>
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-shrink:0;">
          <button onclick="editFaq(${f.id})" style="padding:6px 14px;background:#3498db;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600;font-size:12px;">
            ✏️ Edit
          </button>
          <button onclick="deleteFaq(${f.id})" style="padding:6px 14px;background:#e74c3c;color:white;border:none;border-radius:6px;cursor:pointer;font-weight:600;font-size:12px;">
            🗑️ Delete
          </button>
        </div>
      </div>
    </div>
  `).join('');
}

function openFaq(f = null) {
  const title = document.getElementById('faqFormTitle');
  if (title) {
    title.innerHTML = f ? 
      '<i class="fas fa-edit"></i> Edit FAQ' : 
      '<i class="fas fa-plus"></i> Add FAQ';
  }
  
  document.getElementById('faqId').value = f?.id || '';
  document.getElementById('faqQuestion').value = f?.question || '';
  document.getElementById('faqAnswer').value = f?.answer || '';
  document.getElementById('faqCategory').value = f?.category || 'General';
  document.getElementById('faqOrder').value = f?.display_order || 0;
  document.getElementById('faqActive').checked = f?.is_active !== undefined ? f.is_active : true;
  
  document.getElementById('faqModal').classList.add('visible');
}

function closeFaq() {
  document.getElementById('faqModal').classList.remove('visible');
}

function editFaq(id) {
  // id কে number এ কনভার্ট করুন
  const numericId = Number(id);
  
  // allFaqs অ্যারে থেকে FAQ খুঁজুন
  const faq = allFaqs.find(f => Number(f.id) === numericId);
  
  if (!faq) {
    showToast('FAQ not found! Please refresh the page and try again.', 'error');
    console.log('Available FAQs:', allFaqs);
    console.log('Searching for ID:', numericId);
    return;
  }
  
  openFaq(faq);
}

async function saveFaq(e) {
  e.preventDefault();
  
  const id = document.getElementById('faqId').value;
  const data = {
    question: document.getElementById('faqQuestion').value.trim(),
    answer: document.getElementById('faqAnswer').value.trim(),
    category: document.getElementById('faqCategory').value,
    display_order: parseInt(document.getElementById('faqOrder').value) || 0,
    is_active: document.getElementById('faqActive').checked
  };
  
  if (!data.question) {
    showToast('Question is required', 'error');
    return;
  }
  if (!data.answer) {
    showToast('Answer is required', 'error');
    return;
  }
  
  try {
    if (id) {
      await api('/api/admin/faqs/' + id, {
        method: 'PUT',
        body: JSON.stringify(data)
      });
      showToast('FAQ updated successfully!', 'success');
    } else {
      await api('/api/admin/faqs', {
        method: 'POST',
        body: JSON.stringify(data)
      });
      showToast('FAQ added successfully!', 'success');
    }
    
    closeFaq();
    await loadFaqs();
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

async function deleteFaq(id) {
  if (!confirm('Delete this FAQ?')) return;
  try {
    await api('/api/admin/faqs/' + id, { method: 'DELETE' });
    await loadFaqs();
    showToast('FAQ deleted!', 'success');
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}