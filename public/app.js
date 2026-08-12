let foods = [];
let cart = JSON.parse(localStorage.getItem("cart") || "[]").map(item => ({ ...item, foodId: String(item.foodId) }));
let token = localStorage.getItem("token");

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
  foods = await api("/api/foods");
  renderFoods();
}

function renderFoods() {
  foodGrid.innerHTML = foods.map(food => `
    <article class="food-card">
      <img src="${food.image}" alt="${food.name}">
      <div class="food-body">
        <h3>${food.name}</h3>
        <p>${food.description}</p>
        <div class="price">৳${food.price.toFixed(2)}</div>
        <button onclick="addToCart(${food.id})">Add to Cart</button>
      </div>
    </article>
  `).join("");
}

function saveCart() {
  localStorage.setItem("cart", JSON.stringify(cart));
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
        <div>
          <strong>${item.name}</strong><br>
          ৳${item.price} × ${item.quantity}
        </div>
        <div class="qty">
          <button onclick="changeQty(${item.id}, -1)">−</button>
          <span>${item.quantity}</span>
          <button onclick="changeQty(${item.id}, 1)">+</button>
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
    updateAuthUI();
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
    updateAuthUI();
    closeModal();
    showToast("Welcome back!");
  } catch (error) {
    alert(error.message);
  }
}

function logout() {
  token = null;
  localStorage.removeItem("token");
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

updateCartCount();
updateAuthUI();
loadFoods().catch(error => {
  foodGrid.innerHTML = `<p>Could not load menu: ${error.message}</p>`;
});