let token = localStorage.getItem('adminToken');
let foods = [];
let selectedUser = null;
let poller = null;

const $ = id => document.getElementById(id);

async function api(url, opt = {}) {
  const h = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = 'Bearer ' + token;
  const r = await fetch(url, { ...opt, headers: h });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw Error(d.message || 'Request failed');
  return d;
}

function esc(v) {
  return String(v).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[c]));
}

async function login(e) {
  e.preventDefault();
  $('error').textContent = '';
  try {
    const d = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: $('email').value,
        password: $('password').value
      })
    });
    if (d.user.role !== 'admin') throw Error('This account is not an admin.');
    token = d.token;
    localStorage.setItem('adminToken', token);
    show();
  } catch (e) {
    $('error').textContent = e.message;
  }
}

async function show() {
  try {
    const me = await api('/api/me');
    if (me.role !== 'admin') throw Error('Admin access required.');
    $('login').classList.add('hidden');
    $('dash').classList.remove('hidden');
    await Promise.all([stats(), loadFoods(), loadOrders(), loadUsers(), loadChats()]);
    poller = setInterval(async () => {
      try {
        await loadChats();
        if (selectedUser) await refreshSelectedChat();
      } catch {}
    }, 3000);
  } catch (e) {
    localStorage.removeItem('adminToken');
    token = null;
    $('error').textContent = e.message;
  }
}

async function stats() {
  try {
    const s = await api('/api/admin/stats');
    $('foodsN').textContent = s.foods;
    $('ordersN').textContent = s.orders;
    $('customersN').textContent = s.customers;
    $('revenueN').textContent = '৳' + Number(s.revenue).toFixed(2);
  } catch (error) {
    console.error('Stats error:', error);
  }
}

async function loadFoods() {
  try {
    foods = await api('/api/foods');
    console.log('Foods loaded for admin:', foods);
    renderFoods();
  } catch (error) {
    console.error('Load foods error:', error);
    $('foodList').innerHTML = '<p>Error loading foods.</p>';
  }
}

function renderFoods() {
  if (!foods || foods.length === 0) {
    $('foodList').innerHTML = '<p>No foods available.</p>';
    return;
  }
  
  $('foodList').innerHTML = foods.map(f => `
    <article class="food">
      <img src="${f.image}" alt="${esc(f.name)}">
      <div class="foodbody">
        <h3>${esc(f.name)}</h3>
        <p>${esc(f.description)}</p>
        <b>৳${Number(f.price).toFixed(2)}</b>
        <div class="actions">
          <button onclick="editFood(${f.id})">Edit</button>
          <button class="delete" onclick="delFood(${f.id})">Delete</button>
        </div>
      </div>
    </article>
  `).join('');
}

async function loadOrders() {
  try {
    const os = await api('/api/admin/orders');
    $('orderList').innerHTML = os.length ? os.map(o => `
      <div class="order">
        <div class="orderTop">
          <div>
            <h3>Order #${o.id}</h3>
            <b>${esc(o.customer_name)}</b> — ${esc(o.customer_email)}
            <div>Phone: ${esc(o.phone)}</div>
            <div>Address: ${esc(o.address)}</div>
          </div>
          <b>৳${Number(o.total).toFixed(2)}</b>
        </div>
        <p>Items: ${o.items.map(i => `${esc(i.food_name)} × ${i.quantity}`).join(', ')}</p>
        <select onchange="status(${o.id},this.value)">
          ${['Pending','Confirmed','Preparing','Out for Delivery','Delivered','Cancelled'].map(s => `
            <option ${s === o.status ? 'selected' : ''}>${s}</option>
          `).join('')}
        </select>
        <small> Current: ${o.status} | ${o.created_at}</small>
      </div>
    `).join('') : '<p>No orders yet.</p>';
  } catch (error) {
    console.error('Load orders error:', error);
  }
}

async function loadUsers() {
  try {
    const us = await api('/api/admin/users');
    $('userList').innerHTML = us.length ? `
      <div class="tableWrap">
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
            ${us.map(u => `
              <tr>
                <td>${esc(u.name)}</td>
                <td>${esc(u.email)}</td>
                <td>${u.role}</td>
                <td>${u.order_count}</td>
                <td>৳${Number(u.total_spent).toFixed(2)}</td>
                <td>${u.message_count}</td>
                <td>${u.created_at}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    ` : '<p>No users found.</p>';
  } catch (error) {
    console.error('Load users error:', error);
  }
}

async function loadChats() {
  try {
    const cs = await api('/api/admin/chats');
    $('chatList').innerHTML = cs.length ? cs.map(c => `
      <button class="chatItem ${String(selectedUser) === String(c.user_id) ? 'active' : ''}" onclick="loadChat('${c.user_id}')">
        <strong>${esc(c.name)}</strong>
        <small>${esc(c.email)}</small>
        <span>${esc(c.last_message || 'No messages yet')}</span>
      </button>
    `).join('') : '<p>No conversations yet.</p>';
  } catch (error) {
    console.error('Load chats error:', error);
  }
}

async function loadChat(uid, silent = false) {
  try {
    selectedUser = uid;
    const d = await api('/api/admin/chats/' + uid);
    $('chatTitle').textContent = d.user.name + ' — ' + d.user.email;
    $('adminMessages').innerHTML = d.messages.length ? d.messages.map(m => `
      <div class="chat-message ${m.sender_role === 'admin' ? 'admin-msg' : 'user-msg'}">
        <div>${esc(m.message)}</div>
        <small>${m.created_at}</small>
      </div>
    `).join('') : '<p>No messages yet.</p>';
    $('adminMessages').scrollTop = $('adminMessages').scrollHeight;
    $('adminChatForm').classList.remove('hidden');
    $('adminChatForm').dataset.uid = uid;
    if (!silent) await loadChats();
  } catch (error) {
    console.error('Load chat error:', error);
  }
}

async function refreshSelectedChat() {
  if (!selectedUser) return;
  try {
    const d = await api('/api/admin/chats/' + selectedUser);
    const box = $('adminMessages');
    const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
    const html = d.messages.length ? d.messages.map(m => `
      <div class="chat-message ${m.sender_role === 'admin' ? 'admin-msg' : 'user-msg'}">
        <div>${esc(m.message)}</div>
        <small>${m.created_at}</small>
      </div>
    `).join('') : '<p>No messages yet.</p>';
    if (box.innerHTML !== html) box.innerHTML = html;
    if (nearBottom) box.scrollTop = box.scrollHeight;
  } catch (error) {
    console.error('Refresh chat error:', error);
  }
}

async function sendAdmin(e) {
  e.preventDefault();
  const uid = $('adminChatForm').dataset.uid;
  const m = $('adminChatInput').value.trim();
  if (!uid || !m) return;
  try {
    await api('/api/admin/chats/' + uid + '/messages', {
      method: 'POST',
      body: JSON.stringify({ message: m })
    });
    $('adminChatInput').value = '';
    await loadChat(uid);
  } catch (e) {
    alert(e.message);
  }
}

// ===== FIXED FOOD FUNCTIONS =====
function openFood(f = null) {
  $('formTitle').textContent = f ? 'Edit Food' : 'Add Food';
  $('foodId').value = f?.id || '';
  $('foodName').value = f?.name || '';
  $('foodDesc').value = f?.description || '';
  $('foodPrice').value = f?.price || '';
  $('foodImage').value = f?.image || '';
  $('modal').classList.remove('hidden');
}

function closeFood() {
  $('modal').classList.add('hidden');
}

function editFood(id) {
  console.log('Edit food called with ID:', id);
  console.log('Available foods:', foods);
  
  // Try multiple ways to find the food
  let food = null;
  
  // 1. Try exact match
  food = foods.find(f => f.id === id);
  
  // 2. Try string comparison
  if (!food) {
    food = foods.find(f => String(f.id) === String(id));
  }
  
  // 3. Try number comparison
  if (!food) {
    const numId = Number(id);
    food = foods.find(f => Number(f.id) === numId);
  }
  
  if (!food) {
    console.error('Food not found for ID:', id);
    alert('Food item not found. Please refresh and try again.');
    return;
  }
  
  console.log('Found food to edit:', food);
  openFood(food);
}

async function saveFood(e) {
  e.preventDefault();
  const id = $('foodId').value;
  const body = {
    name: $('foodName').value,
    description: $('foodDesc').value,
    price: Number($('foodPrice').value),
    image: $('foodImage').value
  };
  
  try {
    if (id) {
      // Update existing food
      await api('/api/admin/foods/' + id, {
        method: 'PUT',
        body: JSON.stringify(body)
      });
    } else {
      // Create new food
      await api('/api/admin/foods', {
        method: 'POST',
        body: JSON.stringify(body)
      });
    }
    closeFood();
    await Promise.all([loadFoods(), stats()]);
    alert(id ? 'Food updated successfully!' : 'Food added successfully!');
  } catch (e) {
    console.error('Save food error:', e);
    alert('Error saving food: ' + e.message);
  }
}

async function delFood(id) {
  if (!confirm('Delete this food?')) return;
  try {
    await api('/api/admin/foods/' + id, {
      method: 'DELETE'
    });
    await Promise.all([loadFoods(), stats()]);
    alert('Food deleted successfully!');
  } catch (e) {
    console.error('Delete food error:', e);
    alert('Error deleting food: ' + e.message);
  }
}

async function status(id, s) {
  try {
    await api('/api/admin/orders/' + id + '/status', {
      method: 'PATCH',
      body: JSON.stringify({ status: s })
    });
    await Promise.all([loadOrders(), stats()]);
  } catch (e) {
    alert(e.message);
  }
}

// ===== EVENT LISTENERS =====
$('loginForm').addEventListener('submit', login);
$('foodForm').addEventListener('submit', saveFood);
$('adminChatForm').addEventListener('submit', sendAdmin);

$('logout').onclick = () => {
  localStorage.removeItem('adminToken');
  location.reload();
};

// ===== INITIALIZATION =====
if (token) {
  show().catch(error => {
    console.error('Initialization error:', error);
  });
}

// Debug helper
window.debugFoods = function() {
  console.log('Foods in memory:', foods);
  console.log('Food IDs:', foods.map(f => ({ id: f.id, type: typeof f.id, name: f.name })));
};