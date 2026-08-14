require("dotenv").config();

const express = require("express");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
const nodemailer = require("nodemailer");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

if (!process.env.DATABASE_URL || !JWT_SECRET) {
  console.error("Missing DATABASE_URL or JWT_SECRET. Copy .env.example to .env and fill them in.");
  process.exit(1);
}

// ===== EMAIL CONFIGURATION =====
const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  tls: {
    rejectUnauthorized: false,
    minVersion: 'TLSv1.2'
  },
  connectionTimeout: 60000,
  greetingTimeout: 60000,
  socketTimeout: 60000,
  pool: true,
  maxConnections: 5,
  rateDelta: 1000,
  rateLimit: 5
});

async function verifyEmail() {
  try {
    await transporter.verify();
    console.log('✅ Email server ready');
  } catch (error) {
    console.error('❌ Email error:', error.message);
    console.log('📧 Trying fallback...');
  }
}
verifyEmail();

// ===== DATABASE CONNECTION =====
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { 
    rejectUnauthorized: false,
    sslmode: 'require'
  },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 30000,
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
});

// ===== EMAIL FUNCTIONS =====
async function sendOrderConfirmationEmail(order, user, items) {
  try {
    const itemsHtml = items.map(item => `
      <tr>
        <td style="padding:8px;border-bottom:1px solid #e9ecef;">${item.name}</td>
        <td style="padding:8px;border-bottom:1px solid #e9ecef;text-align:center;">${item.quantity}</td>
        <td style="padding:8px;border-bottom:1px solid #e9ecef;text-align:right;">৳${(item.price * item.quantity).toFixed(2)}</td>
      </tr>
    `).join('');

    const mailOptions = {
      from: `"FoodHub Restaurant" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: `✅ Order Confirmed - Order #${order.id}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f8f9fa;border-radius:10px;">
          <div style="background:#0b6b57;padding:20px;border-radius:10px 10px 0 0;text-align:center;">
            <h1 style="color:white;margin:0;">🍽️ FoodHub</h1>
            <p style="color:rgba(255,255,255,0.9);margin:5px 0 0;">Order Confirmation</p>
          </div>
          <div style="background:white;padding:25px;border-radius:0 0 10px 10px;">
            <h2 style="color:#17202a;margin:0 0 10px;">Thank you for your order! 🎉</h2>
            <p style="color:#69737d;">Hi <strong>${user.name}</strong>, your order has been confirmed.</p>
            <div style="background:#f8f9fa;padding:15px;border-radius:8px;margin:15px 0;">
              <p style="margin:5px 0;"><strong>Order #:</strong> ${order.id}</p>
              <p style="margin:5px 0;"><strong>Date:</strong> ${new Date(order.created_at).toLocaleString()}</p>
              <p style="margin:5px 0;"><strong>Status:</strong> <span style="color:#f39c12;">${order.status}</span></p>
            </div>
            <h3 style="color:#17202a;margin:20px 0 10px;">Order Items</h3>
            <table style="width:100%;border-collapse:collapse;">
              <thead>
                <tr style="background:#f8f9fa;">
                  <th style="padding:8px;text-align:left;">Item</th>
                  <th style="padding:8px;text-align:center;">Qty</th>
                  <th style="padding:8px;text-align:right;">Price</th>
                </tr>
              </thead>
              <tbody>${itemsHtml}</tbody>
              <tfoot>
                <tr>
                  <td colspan="2" style="padding:12px 8px;font-weight:bold;text-align:right;">Total:</td>
                  <td style="padding:12px 8px;font-weight:bold;text-align:right;color:#0b6b57;font-size:18px;">৳${order.total.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
            <div style="background:#f8f9fa;padding:15px;border-radius:8px;margin:20px 0;">
              <p style="margin:5px 0;"><strong>📞 Phone:</strong> ${order.phone}</p>
              <p style="margin:5px 0;"><strong>📍 Address:</strong> ${order.address}</p>
            </div>
            <p style="color:#69737d;font-size:14px;text-align:center;margin-top:20px;">
              You can track your order status from your <a href="${process.env.APP_URL || 'http://localhost:10000'}" style="color:#0b6b57;text-decoration:none;">FoodHub account</a>.
            </p>
            <hr style="border:none;border-top:1px solid #e9ecef;margin:20px 0;">
            <p style="color:#9aa8b9;font-size:12px;text-align:center;margin:0;">FoodHub Restaurant • Fresh • Fast • Delicious</p>
          </div>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`Order confirmation email sent for order #${order.id}`);
    return true;
  } catch (error) {
    console.error('Error sending order confirmation email:', error);
    return false;
  }
}

async function sendOrderStatusUpdateEmail(order, user, oldStatus, newStatus) {
  try {
    const statusColors = {
      'Pending': '#f39c12',
      'Confirmed': '#3498db',
      'Preparing': '#9b59b6',
      'Out for Delivery': '#e67e22',
      'Delivered': '#27ae60',
      'Cancelled': '#e74c3c'
    };

    const statusEmojis = {
      'Pending': '⏳',
      'Confirmed': '✅',
      'Preparing': '👨‍🍳',
      'Out for Delivery': '🛵',
      'Delivered': '🏠',
      'Cancelled': '❌'
    };

    const statusMessages = {
      'Pending': 'Your order has been received and is waiting for confirmation.',
      'Confirmed': 'Great news! Your order has been confirmed by the restaurant.',
      'Preparing': 'The chef is preparing your delicious meal right now! 🍳',
      'Out for Delivery': 'Your food is on the way! The delivery person will arrive soon. 🚀',
      'Delivered': 'Your order has been delivered. Enjoy your meal! 🎉',
      'Cancelled': 'Your order has been cancelled.'
    };

    const mailOptions = {
      from: `"FoodHub Restaurant" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: `📦 Order #${order.id} Status Update - ${newStatus}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f8f9fa;border-radius:10px;">
          <div style="background:#0b6b57;padding:20px;border-radius:10px 10px 0 0;text-align:center;">
            <h1 style="color:white;margin:0;">🍽️ FoodHub</h1>
            <p style="color:rgba(255,255,255,0.9);margin:5px 0 0;">Order Status Update</p>
          </div>
          <div style="background:white;padding:25px;border-radius:0 0 10px 10px;">
            <h2 style="color:#17202a;margin:0 0 10px;">Order Status Updated! ${statusEmojis[newStatus] || '📦'}</h2>
            <p style="color:#69737d;">Hi <strong>${user.name}</strong>, your order status has been updated.</p>
            <div style="background:#f8f9fa;padding:15px;border-radius:8px;margin:15px 0;">
              <p style="margin:5px 0;"><strong>Order #:</strong> ${order.id}</p>
              <p style="margin:5px 0;">
                <strong>Status:</strong> 
                <span style="color:${statusColors[newStatus] || '#17202a'};font-weight:bold;">
                  ${statusEmojis[newStatus] || ''} ${newStatus}
                </span>
              </p>
              <p style="margin:10px 0 0;color:#69737d;">${statusMessages[newStatus] || 'Your order status has been updated.'}</p>
            </div>
            <div style="background:#f8f9fa;padding:15px;border-radius:8px;margin:20px 0;text-align:center;">
              <p style="margin:0;font-size:14px;color:#69737d;">
                <strong>Order Progress:</strong> 
                ${['Pending','Confirmed','Preparing','Out for Delivery','Delivered'].map((s, i) => {
                  const isCompleted = ['Pending','Confirmed','Preparing','Out for Delivery','Delivered'].indexOf(newStatus) >= i;
                  return `${isCompleted ? '✅' : '⬜'} ${s}`;
                }).join(' → ')}
              </p>
            </div>
            <p style="color:#69737d;font-size:14px;text-align:center;margin-top:20px;">
              Track your order <a href="${process.env.APP_URL || 'http://localhost:10000'}" style="color:#0b6b57;text-decoration:none;">here</a>
            </p>
            <hr style="border:none;border-top:1px solid #e9ecef;margin:20px 0;">
            <p style="color:#9aa8b9;font-size:12px;text-align:center;margin:0;">FoodHub Restaurant • Fresh • Fast • Delicious</p>
          </div>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`Order status update email sent for order #${order.id}`);
    return true;
  } catch (error) {
    console.error('Error sending status update email:', error);
    return false;
  }
}

async function sendPasswordResetEmail(user, resetToken) {
  try {
    const resetLink = `${process.env.APP_URL || 'http://localhost:10000'}/reset-password?token=${resetToken}`;

    const mailOptions = {
      from: `"FoodHub Restaurant" <${process.env.EMAIL_USER}>`,
      to: user.email,
      subject: '🔑 Password Reset Request - FoodHub',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f8f9fa;border-radius:10px;">
          <div style="background:#0b6b57;padding:20px;border-radius:10px 10px 0 0;text-align:center;">
            <h1 style="color:white;margin:0;">🍽️ FoodHub</h1>
            <p style="color:rgba(255,255,255,0.9);margin:5px 0 0;">Password Reset</p>
          </div>
          <div style="background:white;padding:25px;border-radius:0 0 10px 10px;">
            <h2 style="color:#17202a;margin:0 0 10px;">Reset Your Password 🔑</h2>
            <p style="color:#69737d;">Hi <strong>${user.name}</strong>,</p>
            <p style="color:#69737d;">We received a request to reset your password for your FoodHub account.</p>
            <div style="background:#f8f9fa;padding:20px;border-radius:8px;margin:20px 0;text-align:center;">
              <p style="margin:0 0 15px;color:#69737d;">Click the button below to reset your password:</p>
              <a href="${resetLink}" style="display:inline-block;background:#0b6b57;color:white;padding:12px 30px;border-radius:8px;text-decoration:none;font-weight:bold;">Reset Password</a>
            </div>
            <p style="color:#69737d;font-size:14px;">Or copy and paste this link in your browser:</p>
            <p style="color:#9aa8b9;font-size:13px;word-break:break-all;background:#f8f9fa;padding:10px;border-radius:5px;">${resetLink}</p>
            <div style="background:#fff3cd;padding:12px;border-radius:8px;margin:20px 0;border-left:4px solid #ffc107;">
              <p style="margin:0;color:#856404;font-size:13px;">⏰ This link will expire in 1 hour. If you didn't request this, please ignore this email.</p>
            </div>
            <hr style="border:none;border-top:1px solid #e9ecef;margin:20px 0;">
            <p style="color:#9aa8b9;font-size:12px;text-align:center;margin:0;">FoodHub Restaurant • Fresh • Fast • Delicious</p>
          </div>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`Password reset email sent to ${user.email}`);
    return true;
  } catch (error) {
    console.error('Error sending password reset email:', error);
    return false;
  }
}

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

function makeToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function auth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Authentication required." });
  }
  try {
    req.user = jwt.verify(header.slice(7), JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token." });
  }
}

function adminOnly(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ message: "Admin access required." });
  }
  next();
}

async function ensureChat(userId) {
  const existing = await pool.query("select id from public.chats where user_id = $1 limit 1", [userId]);
  if (existing.rows[0]) return existing.rows[0].id;
  const created = await pool.query("insert into public.chats(user_id) values($1) returning id", [userId]);
  return created.rows[0].id;
}

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("select 1");
    res.json({ ok: true, database: "connected" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ ok: false, database: "disconnected" });
  }
});

// ===== AUTH =====
app.post("/api/auth/signup", async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    if (!name || !email || !password) return res.status(400).json({ message: "Name, email and password are required." });
    if (password.length < 6) return res.status(400).json({ message: "Password must be at least 6 characters." });
    const exists = await pool.query("select id from public.users where email = $1 limit 1", [email]);
    if (exists.rows[0]) return res.status(409).json({ message: "An account with this email already exists." });
    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query(`insert into public.users(name,email,password_hash,role) values($1,$2,$3,'customer') returning id,name,email,role`, [name, email, passwordHash]);
    const user = result.rows[0];
    res.status(201).json({ message: "Account created.", token: makeToken(user), user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    const result = await pool.query("select * from public.users where email = $1 limit 1", [email]);
    const user = result.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ message: "Invalid email or password." });
    }
    const safeUser = { id: user.id, name: user.name, email: user.email, role: user.role };
    res.json({ message: "Login successful.", token: makeToken(safeUser), user: safeUser });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

app.get("/api/me", auth, async (req, res) => {
  try {
    const result = await pool.query("select id,name,email,role,created_at from public.users where id = $1", [req.user.id]);
    if (!result.rows[0]) return res.status(404).json({ message: "User not found." });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

// ===== PASSWORD RESET =====
app.post("/api/auth/forgot-password", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ message: "Email is required." });
    const result = await pool.query("select id, name, email from public.users where email = $1", [email]);
    if (!result.rows[0]) return res.status(404).json({ message: "No account found with this email." });
    const user = result.rows[0];
    const resetToken = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: "1h" });
    await sendPasswordResetEmail(user, resetToken);
    res.json({ message: "Password reset link sent to your email. Please check your inbox." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not process request." });
  }
});

app.post("/api/auth/reset-password", async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ message: "Token and new password are required." });
    if (newPassword.length < 6) return res.status(400).json({ message: "Password must be at least 6 characters." });
    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(400).json({ message: "Invalid or expired token." });
    }
    const passwordHash = await bcrypt.hash(newPassword, 12);
    const result = await pool.query("UPDATE public.users SET password_hash = $1 WHERE id = $2 RETURNING id, email", [passwordHash, decoded.id]);
    if (!result.rows[0]) return res.status(404).json({ message: "User not found." });
    res.json({ message: "Password reset successfully. You can now login with your new password." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not reset password." });
  }
});

// ===== RESET PASSWORD PAGE =====
app.get("/reset-password", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ===== CATEGORIES =====
app.get("/api/categories", async (req, res) => {
  try {
    const result = await pool.query(`SELECT c.*, COUNT(f.id) as food_count FROM categories c LEFT JOIN foods f ON f.category_id = c.id GROUP BY c.id ORDER BY c.name`);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not load categories." });
  }
});

app.post("/api/admin/categories", auth, adminOnly, async (req, res) => {
  try {
    const { name, icon, description } = req.body;
    if (!name || name.trim().length === 0) return res.status(400).json({ message: "Category name is required." });
    const result = await pool.query(`INSERT INTO categories (name, icon, description) VALUES ($1, $2, $3) RETURNING *`, [name.trim(), icon || '📁', description || '']);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    if (err.code === '23505') return res.status(409).json({ message: "Category with this name already exists." });
    res.status(500).json({ message: "Could not create category." });
  }
});

app.put("/api/admin/categories/:id", auth, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, icon, description } = req.body;
    if (!name || name.trim().length === 0) return res.status(400).json({ message: "Category name is required." });
    const result = await pool.query(`UPDATE categories SET name = $1, icon = $2, description = $3, updated_at = NOW() WHERE id = $4 RETURNING *`, [name.trim(), icon || '📁', description || '', id]);
    if (result.rows.length === 0) return res.status(404).json({ message: "Category not found." });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    if (err.code === '23505') return res.status(409).json({ message: "Category with this name already exists." });
    res.status(500).json({ message: "Could not update category." });
  }
});

app.delete("/api/admin/categories/:id", auth, adminOnly, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id } = req.params;
    await client.query("BEGIN");
    const checkResult = await client.query("SELECT COUNT(*) FROM foods WHERE category_id = $1", [id]);
    if (parseInt(checkResult.rows[0].count) > 0) {
      await client.query("UPDATE foods SET category_id = NULL WHERE category_id = $1", [id]);
    }
    const result = await client.query("DELETE FROM categories WHERE id = $1 RETURNING *", [id]);
    if (result.rows.length === 0) { await client.query("ROLLBACK"); return res.status(404).json({ message: "Category not found." }); }
    await client.query("COMMIT");
    res.json({ message: "Category deleted successfully." });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error(err);
    res.status(500).json({ message: "Could not delete category." });
  } finally {
    client.release();
  }
});

// ===== FOODS =====
app.get("/api/foods", async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT f.id, f.name, f.description, f.price::float, f.image, f.category_id, f.created_at,
        f.discount_percent, 
        CASE 
          WHEN f.discount_percent > 0 THEN (f.price - (f.price * f.discount_percent / 100))::float
          ELSE NULL 
        END as discount_price,
        c.name as category_name, c.icon as category_icon,
        COALESCE(ROUND(AVG(r.rating)::numeric, 1), 0) as rating,
        COUNT(DISTINCT r.id) as rating_count,
        COUNT(DISTINCT oi.order_id) as popularity
      FROM foods f
      LEFT JOIN categories c ON c.id = f.category_id
      LEFT JOIN reviews r ON r.food_id = f.id AND r.is_approved = true
      LEFT JOIN order_items oi ON oi.food_id = f.id
      GROUP BY f.id, c.id
      ORDER BY f.id DESC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error("Error loading foods:", err);
    res.status(500).json({ message: "Could not load menu." });
  }
});

app.post("/api/admin/foods", auth, adminOnly, async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const description = String(req.body.description || "").trim();
    const image = String(req.body.image || "").trim();
    const price = Number(req.body.price);
    const category_id = req.body.category_id || null;
    const discount_percent = Number(req.body.discount_percent) || 0;
    
    if (!name || !description || !image || !Number.isFinite(price) || price < 0) {
      return res.status(400).json({ message: "Name, description, valid price and image are required." });
    }
    
    if (discount_percent < 0 || discount_percent > 100) {
      return res.status(400).json({ message: "Discount must be between 0 and 100." });
    }
    
    if (category_id) {
      const catCheck = await pool.query("SELECT id FROM categories WHERE id = $1", [category_id]);
      if (!catCheck.rows[0]) {
        return res.status(400).json({ message: "Selected category does not exist." });
      }
    }
    
    const discount_price = discount_percent > 0 ? price - (price * discount_percent / 100) : null;
    
    const result = await pool.query(
      `INSERT INTO foods(name, description, price, image, category_id, discount_percent, discount_price) 
       VALUES($1, $2, $3, $4, $5, $6, $7) 
       RETURNING id, name, description, price::float, image, category_id, discount_percent, discount_price::float`,
      [name, description, price, image, category_id, discount_percent, discount_price]
    );
    res.status(201).json({ food: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not add food." });
  }
});

app.put("/api/admin/foods/:id", auth, adminOnly, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid food ID" });
    }
    
    const name = String(req.body.name || "").trim();
    const description = String(req.body.description || "").trim();
    const image = String(req.body.image || "").trim();
    const price = Number(req.body.price);
    const category_id = req.body.category_id || null;
    const discount_percent = Number(req.body.discount_percent) || 0;
    
    if (!name || !description || !image || !Number.isFinite(price) || price < 0) {
      return res.status(400).json({ message: "Name, description, valid price and image are required." });
    }
    
    if (discount_percent < 0 || discount_percent > 100) {
      return res.status(400).json({ message: "Discount must be between 0 and 100." });
    }
    
    if (category_id) {
      const catCheck = await pool.query("SELECT id FROM categories WHERE id = $1", [category_id]);
      if (!catCheck.rows[0]) {
        return res.status(400).json({ message: "Selected category does not exist." });
      }
    }
    
    const discount_price = discount_percent > 0 ? price - (price * discount_percent / 100) : null;
    
    const result = await pool.query(
      `UPDATE foods 
       SET name=$1, description=$2, price=$3, image=$4, category_id=$5, 
           discount_percent=$6, discount_price=$7
       WHERE id=$8 
       RETURNING id, name, description, price::float, image, category_id, discount_percent, discount_price::float`,
      [name, description, price, image, category_id, discount_percent, discount_price, id]
    );
    
    if (!result.rows[0]) {
      return res.status(404).json({ message: "Food not found." });
    }
    
    res.json({ food: result.rows[0] });
  } catch (err) {
    console.error("Error updating food:", err);
    res.status(500).json({ message: "Could not update food.", error: err.message });
  }
});

app.delete("/api/admin/foods/:id", auth, adminOnly, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ message: "Invalid food ID" });
    }
    
    const used = await pool.query("SELECT COUNT(*)::int as count FROM order_items WHERE food_id=$1", [id]);
    if (used.rows[0].count > 0) {
      return res.status(400).json({ 
        message: "This food exists in past orders, so edit it instead of deleting it." 
      });
    }
    
    const result = await pool.query("DELETE FROM foods WHERE id=$1 RETURNING id", [id]);
    if (!result.rows[0]) {
      return res.status(404).json({ message: "Food not found." });
    }
    
    res.json({ message: "Food deleted successfully." });
  } catch (err) {
    console.error("Error deleting food:", err);
    res.status(500).json({ message: "Could not delete food." });
  }
});

// ===== REVIEWS =====

// রিভিউ তৈরি করুন
app.post("/api/reviews", auth, async (req, res) => {
  try {
    const { foodId, orderId, rating, comment } = req.body;
    
    if (!foodId || !rating) {
      return res.status(400).json({ message: "Food ID and rating are required." });
    }
    
    if (rating < 1 || rating > 5) {
      return res.status(400).json({ message: "Rating must be between 1 and 5." });
    }
    
    // ইউজার এই খাবারটি অর্ডার করেছে কিনা চেক করুন
    if (orderId) {
      const orderCheck = await pool.query(
        `SELECT id, status FROM orders 
         WHERE id = $1 AND user_id = $2 AND status = 'Delivered'`,
        [orderId, req.user.id]
      );
      
      if (!orderCheck.rows[0]) {
        return res.status(403).json({ 
          message: "You can only review delivered orders." 
        });
      }
    }
    
    // ইতিমধ্যে রিভিউ দিয়েছে কিনা চেক করুন
    const existing = await pool.query(
      `SELECT id FROM reviews WHERE user_id = $1 AND food_id = $2 AND (order_id = $3 OR ($3 IS NULL AND order_id IS NULL))`,
      [req.user.id, foodId, orderId || null]
    );
    
    if (existing.rows[0]) {
      return res.status(409).json({ message: "You already reviewed this item." });
    }
    
    // রিভিউ সেভ করুন
    const result = await pool.query(
      `INSERT INTO reviews (user_id, food_id, order_id, rating, comment, is_approved)
       VALUES ($1, $2, $3, $4, $5, false)
       RETURNING id, rating, comment, created_at`,
      [req.user.id, foodId, orderId || null, rating, comment || null]
    );
    
    res.status(201).json({ 
      message: "Review submitted! Waiting for admin approval.", 
      review: result.rows[0] 
    });
  } catch (err) {
    console.error("Error creating review:", err);
    res.status(500).json({ message: "Could not submit review." });
  }
});

// খাবারের রিভিউ দেখুন (পাবলিক)
app.get("/api/foods/:id/reviews", async (req, res) => {
  try {
    const foodId = parseInt(req.params.id);
    
    if (isNaN(foodId)) {
      return res.status(400).json({ message: "Invalid food ID." });
    }
    
    const result = await pool.query(
      `SELECT r.id, r.rating, r.comment, r.created_at, 
              u.name as user_name, u.id as user_id
       FROM reviews r
       JOIN users u ON u.id = r.user_id
       WHERE r.food_id = $1 AND r.is_approved = true
       ORDER BY r.created_at DESC
       LIMIT 50`,
      [foodId]
    );
    
    const stats = await pool.query(
      `SELECT 
        COUNT(*)::integer as total,
        COALESCE(AVG(rating)::numeric, 0) as avg_rating,
        COUNT(CASE WHEN rating = 5 THEN 1 END)::integer as five_star,
        COUNT(CASE WHEN rating = 4 THEN 1 END)::integer as four_star,
        COUNT(CASE WHEN rating = 3 THEN 1 END)::integer as three_star,
        COUNT(CASE WHEN rating = 2 THEN 1 END)::integer as two_star,
        COUNT(CASE WHEN rating = 1 THEN 1 END)::integer as one_star
       FROM reviews 
       WHERE food_id = $1 AND is_approved = true`,
      [foodId]
    );
    
    res.json({
      reviews: result.rows,
      stats: stats.rows[0] || { total: 0, avg_rating: 0, five_star: 0, four_star: 0, three_star: 0, two_star: 0, one_star: 0 }
    });
  } catch (err) {
    console.error("Error loading reviews:", err);
    res.status(500).json({ message: "Could not load reviews." });
  }
});

// ইউজারের রিভিউ দেখুন
app.get("/api/user/reviews", auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.id, r.rating, r.comment, r.created_at, r.is_approved,
              f.id as food_id, f.name as food_name, f.image as food_image
       FROM reviews r
       JOIN foods f ON f.id = r.food_id
       WHERE r.user_id = $1
       ORDER BY r.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error loading user reviews:", err);
    res.status(500).json({ message: "Could not load your reviews." });
  }
});

// ===== ADMIN REVIEW MANAGEMENT =====

// সব রিভিউ দেখুন (অ্যাডমিন)
app.get("/api/admin/reviews", auth, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT r.id, r.rating, r.comment, r.created_at, r.is_approved,
              u.name as user_name, u.email as user_email,
              f.id as food_id, f.name as food_name
       FROM reviews r
       JOIN users u ON u.id = r.user_id
       JOIN foods f ON f.id = r.food_id
       ORDER BY r.created_at DESC
       LIMIT 100`
    );
    res.json(result.rows);
  } catch (err) {
    console.error("Error loading admin reviews:", err);
    res.status(500).json({ message: "Could not load reviews." });
  }
});

// রিভিউ অ্যাপ্রুভ/রিজেক্ট (অ্যাডমিন)
app.patch("/api/admin/reviews/:id", auth, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    const { is_approved } = req.body;
    
    if (typeof is_approved !== 'boolean') {
      return res.status(400).json({ message: "is_approved must be boolean." });
    }
    
    const result = await pool.query(
      `UPDATE reviews 
       SET is_approved = $1, updated_at = NOW() 
       WHERE id = $2 
       RETURNING id, is_approved, user_id, food_id`,
      [is_approved, id]
    );
    
    if (!result.rows[0]) {
      return res.status(404).json({ message: "Review not found." });
    }
    
    res.json({ 
      message: `Review ${is_approved ? 'approved' : 'rejected'} successfully.`,
      review: result.rows[0] 
    });
  } catch (err) {
    console.error("Error updating review:", err);
    res.status(500).json({ message: "Could not update review." });
  }
});

// রিভিউ ডিলিট (অ্যাডমিন)
app.delete("/api/admin/reviews/:id", auth, adminOnly, async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(
      `DELETE FROM reviews WHERE id = $1 RETURNING id`,
      [id]
    );
    
    if (!result.rows[0]) {
      return res.status(404).json({ message: "Review not found." });
    }
    
    res.json({ message: "Review deleted successfully." });
  } catch (err) {
    console.error("Error deleting review:", err);
    res.status(500).json({ message: "Could not delete review." });
  }
});

// ===== ORDERS =====
// ===== ORDERS =====
app.post("/api/orders", auth, async (req, res) => {
  const client = await pool.connect();
  try {
    const { 
      items, 
      customerName, 
      phone, 
      address, 
      instructions, 
      paymentMethod, 
      latitude, 
      longitude, 
      addressMode 
    } = req.body;
    
    // ===== VALIDATION =====
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Your cart is empty." });
    }
    
    if (!customerName || !customerName.trim()) {
      return res.status(400).json({ message: "Customer name is required." });
    }
    
    if (!phone || !phone.trim()) {
      return res.status(400).json({ message: "Phone number is required." });
    }
    
    if (!address || !address.trim()) {
      return res.status(400).json({ message: "Delivery address is required." });
    }
    
    // Phone number validation (Bangladesh format)
    const phoneRegex = /^(01|8801)[0-9]{9}$/;
    if (!phoneRegex.test(phone.trim())) {
      return res.status(400).json({ 
        message: "Please enter a valid phone number (e.g., 01XXXXXXXXX)." 
      });
    }
    
    await client.query("BEGIN");
    
    let total = 0;
    const cleanItems = [];
    
    // ===== PROCESS EACH ITEM =====
    for (const item of items) {
      const foodId = Number(item.foodId);
      const quantity = Number(item.quantity);
      
      if (!Number.isInteger(foodId) || foodId < 1) {
        throw new Error("Invalid food item ID.");
      }
      
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
        throw new Error("Invalid quantity. Please select between 1 and 99.");
      }
      
      // Get food details from database
      const result = await client.query(
        "SELECT id, name, price::float, discount_percent, discount_price::float FROM foods WHERE id = $1",
        [foodId]
      );
      
      const food = result.rows[0];
      if (!food) {
        throw new Error(`Food item with ID ${foodId} no longer exists.`);
      }
      
      // Calculate price with discount
      let itemPrice = Number(food.price);
      if (food.discount_percent && food.discount_percent > 0) {
        itemPrice = Number(food.discount_price) || itemPrice;
      }
      
      total += itemPrice * quantity;
      cleanItems.push({ 
        foodId: food.id, 
        name: food.name, 
        price: itemPrice, 
        quantity 
      });
    }
    
    // ===== INSERT ORDER =====
    const orderResult = await client.query(
      `INSERT INTO orders(
        user_id, 
        customer_name, 
        phone, 
        address, 
        total, 
        status,
        instructions,
        payment_method,
        latitude,
        longitude,
        address_mode
      ) 
      VALUES($1, $2, $3, $4, $5, 'Pending', $6, $7, $8, $9, $10) 
      RETURNING id, total::float, status, created_at`,
      [
        req.user.id,
        customerName.trim(),
        phone.trim(),
        address.trim(),
        total,
        instructions || '',
        paymentMethod || 'cash',
        latitude ? parseFloat(latitude) : null,
        longitude ? parseFloat(longitude) : null,
        addressMode || 'manual'
      ]
    );
    
    const order = orderResult.rows[0];
    const orderId = order.id;
    
    // ===== INSERT ORDER STATUS HISTORY =====
    await client.query(
      `INSERT INTO order_status_history (order_id, status, created_at) 
       VALUES ($1, 'Pending', NOW())`,
      [orderId]
    );
    
    // ===== INSERT ORDER ITEMS =====
    for (const item of cleanItems) {
      await client.query(
        `INSERT INTO order_items(
          order_id, 
          food_id, 
          food_name, 
          price, 
          quantity
        ) 
        VALUES($1, $2, $3, $4, $5)`,
        [orderId, item.foodId, item.name, item.price, item.quantity]
      );
    }
    
    await client.query("COMMIT");
    
    // ===== SEND CONFIRMATION EMAIL =====
    try {
      const userResult = await pool.query(
        "SELECT id, name, email FROM users WHERE id = $1",
        [req.user.id]
      );
      const user = userResult.rows[0];
      
      if (user && user.email) {
        // Send email in background (don't wait for it)
        sendOrderConfirmationEmail(order, user, cleanItems);
      }
    } catch (emailErr) {
      console.error('Email sending error:', emailErr);
      // Don't fail the order if email fails
    }
    
    // ===== RETURN SUCCESS RESPONSE =====
    res.status(201).json({ 
      message: "Order placed successfully!", 
      orderId: orderId,
      total: total,
      status: order.status,
      created_at: order.created_at
    });
    
  } catch (err) {
    await client.query("ROLLBACK");
    console.error('Order creation error:', err);
    
    // Send appropriate error message
    if (err.message.includes("no longer exists")) {
      return res.status(400).json({ 
        message: err.message,
        code: 'ITEM_NOT_FOUND'
      });
    }
    
    if (err.message.includes("Invalid")) {
      return res.status(400).json({ 
        message: err.message,
        code: 'INVALID_INPUT'
      });
    }
    
    res.status(500).json({ 
      message: "Could not place order. Please try again.",
      code: 'SERVER_ERROR'
    });
    
  } finally {
    client.release();
  }
});

app.get("/api/orders", auth, async (req, res) => {
  try {
    const orders = await pool.query(`SELECT id, customer_name, phone, address, total::float, status, created_at FROM orders WHERE user_id = $1 ORDER BY id DESC`, [req.user.id]);
    for (const order of orders.rows) {
      const items = await pool.query(`SELECT food_id, food_name, price::float, quantity FROM order_items WHERE order_id = $1 ORDER BY id`, [order.id]);
      order.items = items.rows;
    }
    res.json(orders.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not load orders." });
  }
});

// ===== ORDER TRACKING =====
app.get("/api/orders/track/:orderId", async (req, res) => {
  try {
    const orderId = req.params.orderId;
    const orderResult = await pool.query(`SELECT o.id, o.customer_name, o.phone, o.address, o.total::float, o.status, o.created_at, u.id as user_id, u.email as user_email FROM orders o LEFT JOIN users u ON u.id = o.user_id WHERE o.id = $1`, [orderId]);
    if (orderResult.rows.length === 0) return res.status(404).json({ message: "Order not found." });
    const order = orderResult.rows[0];
    const itemsResult = await pool.query(`SELECT food_id, food_name, price::float, quantity FROM order_items WHERE order_id = $1 ORDER BY id`, [orderId]);
    order.items = itemsResult.rows;
    const statusHistory = await pool.query(`SELECT status, created_at FROM order_status_history WHERE order_id = $1 ORDER BY created_at ASC`, [orderId]);
    if (statusHistory.rows.length > 0) {
      const statusTimes = {};
      statusHistory.rows.forEach(row => { statusTimes[row.status.toLowerCase()] = row.created_at; });
      order.status_times = statusTimes;
    }
    res.json(order);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not load order tracking." });
  }
});

// ===== CHAT =====
app.get("/api/chat", auth, async (req, res) => {
  try {
    const chatId = await ensureChat(req.user.id);
    const result = await pool.query(`SELECT id, sender_id, sender_role, message, created_at FROM messages WHERE chat_id = $1 ORDER BY id ASC`, [chatId]);
    res.json({ chatId, messages: result.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not load chat." });
  }
});

app.post("/api/chat/messages", auth, async (req, res) => {
  try {
    const message = String(req.body.message || "").trim();
    if (!message) return res.status(400).json({ message: "Message cannot be empty." });
    if (message.length > 2000) return res.status(400).json({ message: "Message is too long." });
    const chatId = await ensureChat(req.user.id);
    const result = await pool.query(`INSERT INTO messages(chat_id, sender_id, sender_role, message) VALUES($1, $2, $3, $4) RETURNING id, sender_id, sender_role, message, created_at`, [chatId, req.user.id, req.user.role, message]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not send message." });
  }
});

// ===== ADMIN =====
app.get("/api/admin/stats", auth, adminOnly, async (req, res) => {
  try {
    const [foods, orders, customers, revenue] = await Promise.all([
      pool.query("SELECT COUNT(*)::int as count FROM foods"),
      pool.query("SELECT COUNT(*)::int as count FROM orders"),
      pool.query("SELECT COUNT(*)::int as count FROM users WHERE role='customer'"),
      pool.query("SELECT COALESCE(SUM(total),0)::float as total FROM orders WHERE status <> 'Cancelled'")
    ]);
    res.json({ foods: foods.rows[0].count, orders: orders.rows[0].count, customers: customers.rows[0].count, revenue: revenue.rows[0].total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not load dashboard." });
  }
});

app.get("/api/admin/users", auth, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(`SELECT u.id, u.name, u.email, u.role, u.created_at, COUNT(DISTINCT o.id)::int as order_count, COALESCE(SUM(CASE WHEN o.status <> 'Cancelled' THEN o.total ELSE 0 END),0)::float as total_spent, COUNT(DISTINCT m.id)::int as message_count FROM users u LEFT JOIN orders o ON o.user_id = u.id LEFT JOIN chats c ON c.user_id = u.id LEFT JOIN messages m ON m.chat_id = c.id GROUP BY u.id ORDER BY u.created_at DESC`);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not load users." });
  }
});

app.get("/api/admin/orders", auth, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(`SELECT o.id, o.customer_name, o.phone, o.address, o.total::float, o.status, o.created_at, u.email as customer_email FROM orders o JOIN users u ON u.id = o.user_id ORDER BY o.id DESC`);
    for (const order of result.rows) {
      const items = await pool.query(`SELECT food_id, food_name, price::float, quantity FROM order_items WHERE order_id=$1 ORDER BY id`, [order.id]);
      order.items = items.rows;
    }
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not load orders." });
  }
});

// ===== UPDATE ORDER STATUS =====
app.patch("/api/admin/orders/:id/status", auth, adminOnly, async (req, res) => {
  const allowed = ["Pending", "Confirmed", "Preparing", "Out for Delivery", "Delivered", "Cancelled"];
  if (!allowed.includes(req.body.status)) return res.status(400).json({ message: "Invalid order status." });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const currentOrder = await client.query("SELECT status, user_id FROM orders WHERE id = $1", [req.params.id]);
    if (!currentOrder.rows[0]) { await client.query("ROLLBACK"); return res.status(404).json({ message: "Order not found." }); }
    const oldStatus = currentOrder.rows[0].status;
    const userId = currentOrder.rows[0].user_id;
    await client.query("UPDATE orders SET status=$1 WHERE id=$2 RETURNING id", [req.body.status, req.params.id]);
    await client.query(`INSERT INTO order_status_history (order_id, status, created_at) VALUES ($1, $2, NOW())`, [req.params.id, req.body.status]);
    await client.query("COMMIT");
    if (oldStatus !== req.body.status) {
      try {
        const userResult = await pool.query("SELECT id, name, email FROM users WHERE id = $1", [userId]);
        const user = userResult.rows[0];
        if (user && user.email) {
          const orderResult = await pool.query("SELECT id, total::float, status FROM orders WHERE id = $1", [req.params.id]);
          const order = orderResult.rows[0];
          if (order) sendOrderStatusUpdateEmail(order, user, oldStatus, req.body.status);
        }
      } catch (emailErr) {
        console.error('Email sending error:', emailErr);
      }
    }
    res.json({ message: "Order status updated successfully.", status: req.body.status });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Error updating order status:", err);
    res.status(500).json({ message: "Could not update order status.", error: err.message });
  } finally {
    client.release();
  }
});

// ===== ADMIN CHATS =====
app.get("/api/admin/chats", auth, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(`SELECT u.id as user_id, u.name, u.email, MAX(m.created_at) as last_message_at, (SELECT m2.message FROM messages m2 JOIN chats c2 ON c2.id = m2.chat_id WHERE c2.user_id = u.id ORDER BY m2.id DESC LIMIT 1) as last_message FROM users u JOIN chats c ON c.user_id = u.id LEFT JOIN messages m ON m.chat_id = c.id GROUP BY u.id ORDER BY last_message_at DESC NULLS LAST, u.created_at DESC`);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not load chats." });
  }
});

app.get("/api/admin/chats/:userId", auth, adminOnly, async (req, res) => {
  try {
    const user = await pool.query("SELECT id, name, email FROM users WHERE id=$1", [req.params.userId]);
    if (!user.rows[0]) return res.status(404).json({ message: "Customer not found." });
    const chat = await pool.query("SELECT id FROM chats WHERE user_id=$1 LIMIT 1", [req.params.userId]);
    if (!chat.rows[0]) return res.json({ user: user.rows[0], chatId: null, messages: [] });
    const messages = await pool.query(`SELECT id, sender_id, sender_role, message, created_at FROM messages WHERE chat_id=$1 ORDER BY id ASC`, [chat.rows[0].id]);
    res.json({ user: user.rows[0], chatId: chat.rows[0].id, messages: messages.rows });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not load conversation." });
  }
});

app.post("/api/admin/chats/:userId/messages", auth, adminOnly, async (req, res) => {
  try {
    const message = String(req.body.message || "").trim();
    if (!message) return res.status(400).json({ message: "Message cannot be empty." });
    if (message.length > 2000) return res.status(400).json({ message: "Message is too long." });
    const chatId = await ensureChat(req.params.userId);
    const result = await pool.query(`INSERT INTO messages(chat_id, sender_id, sender_role, message) VALUES($1, $2, 'admin', $3) RETURNING id, sender_id, sender_role, message, created_at`, [chatId, req.user.id, message]);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not send reply." });
  }
});

app.get("/admin", (req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));

app.listen(PORT, () => {
  console.log(`FoodHub server running on port ${PORT}`);
});
// ===== ORDER HISTORY =====

// ইউজারের সব অর্ডার (ফিল্টার + সার্চ সহ)
app.get("/api/orders/history", auth, async (req, res) => {
  try {
    const { status, search, page = 1, limit = 10 } = req.query;
    const userId = req.user.id;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    let query = `
      SELECT 
        o.id, o.customer_name, o.phone, o.address, 
        o.total::float, o.status, o.created_at,
        (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) as item_count
      FROM orders o
      WHERE o.user_id = $1
    `;
    
    const params = [userId];
    let paramIndex = 2;
    
    // স্ট্যাটাস ফিল্টার
    if (status && status !== 'all') {
      query += ` AND o.status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }
    
    // সার্চ (অর্ডার আইডি দিয়ে)
    if (search && !isNaN(search)) {
      query += ` AND o.id::text LIKE $${paramIndex}`;
      params.push(`%${search}%`);
      paramIndex++;
    }
    
    // সাজানো (নতুন প্রথম)
    query += ` ORDER BY o.created_at DESC`;
    
    // পেজিনেশন
    query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
    params.push(parseInt(limit), offset);
    
    const result = await pool.query(query, params);
    
    // টোটাল কাউন্ট
    let countQuery = `
      SELECT COUNT(*)::integer as total 
      FROM orders o 
      WHERE o.user_id = $1
    `;
    const countParams = [userId];
    let countIndex = 2;
    
    if (status && status !== 'all') {
      countQuery += ` AND o.status = $${countIndex}`;
      countParams.push(status);
      countIndex++;
    }
    
    if (search && !isNaN(search)) {
      countQuery += ` AND o.id::text LIKE $${countIndex}`;
      countParams.push(`%${search}%`);
      countIndex++;
    }
    
    const countResult = await pool.query(countQuery, countParams);
    const total = countResult.rows[0].total;
    
    // প্রতিটি অর্ডারের আইটেম লোড করুন
    for (const order of result.rows) {
      const items = await pool.query(
        `SELECT food_id, food_name, price::float, quantity 
         FROM order_items 
         WHERE order_id = $1 
         ORDER BY id`,
        [order.id]
      );
      order.items = items.rows;
    }
    
    res.json({
      orders: result.rows,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (err) {
    console.error("Error loading order history:", err);
    res.status(500).json({ message: "Could not load order history." });
  }
});

// অর্ডার স্ট্যাটাস সামারি (ড্যাশবোর্ডের জন্য)
app.get("/api/orders/summary", auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        COUNT(*)::integer as total_orders,
        COUNT(CASE WHEN status = 'Pending' THEN 1 END)::integer as pending,
        COUNT(CASE WHEN status = 'Confirmed' THEN 1 END)::integer as confirmed,
        COUNT(CASE WHEN status = 'Preparing' THEN 1 END)::integer as preparing,
        COUNT(CASE WHEN status = 'Out for Delivery' THEN 1 END)::integer as out_for_delivery,
        COUNT(CASE WHEN status = 'Delivered' THEN 1 END)::integer as delivered,
        COUNT(CASE WHEN status = 'Cancelled' THEN 1 END)::integer as cancelled,
        COALESCE(SUM(CASE WHEN status <> 'Cancelled' THEN total ELSE 0 END), 0)::float as total_spent
       FROM orders 
       WHERE user_id = $1`,
      [req.user.id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error("Error loading order summary:", err);
    res.status(500).json({ message: "Could not load order summary." });
  }
});

// ===== NEWSLETTER SUBSCRIPTION =====
app.post('/api/subscribe', async (req, res) => {
  try {
    const { email, name } = req.body;
    
    // ইমেইল ভ্যালিডেশন
    if (!email || !email.trim()) {
      return res.status(400).json({ message: 'Email is required.' });
    }
    
    // ইমেইল ফরম্যাট চেক
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return res.status(400).json({ message: 'Please enter a valid email address.' });
    }
    
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name ? name.trim() : null;
    
    // চেক করুন ইমেইল ইতিমধ্যে আছে কিনা
    const existing = await pool.query(
      'SELECT id, is_active FROM public.subscribers WHERE email = $1',
      [cleanEmail]
    );
    
    if (existing.rows[0]) {
      if (existing.rows[0].is_active === false) {
        // ইনঅ্যাকটিভ হলে আবার অ্যাকটিভ করুন
        await pool.query(
          'UPDATE public.subscribers SET is_active = true, updated_at = NOW() WHERE email = $1',
          [cleanEmail]
        );
        return res.json({ 
          message: 'Welcome back! You have been resubscribed successfully.' 
        });
      }
      return res.status(409).json({ 
        message: 'This email is already subscribed to our newsletter.' 
      });
    }
    
    // নতুন সাবস্ক্রাইবার যোগ করুন
    await pool.query(
      'INSERT INTO public.subscribers (email, name) VALUES ($1, $2)',
      [cleanEmail, cleanName]
    );
    
    // (অপশনাল) ওয়েলকাম ইমেইল পাঠান
    try {
      await sendWelcomeEmail(cleanEmail, cleanName);
    } catch (emailErr) {
      console.error('Welcome email error:', emailErr);
      // ইমেইল না গেলেও সাবস্ক্রিপশন সফল হবে
    }
    
    res.status(201).json({ 
      message: '🎉 Thank you for subscribing to our newsletter! Check your email for confirmation.' 
    });
    
  } catch (err) {
    console.error('Subscription error:', err);
    if (err.code === '23505') {
      return res.status(409).json({ message: 'This email is already subscribed.' });
    }
    res.status(500).json({ message: 'Could not subscribe. Please try again later.' });
  }
});

// ===== GET SUBSCRIBER COUNT (অ্যাডমিন প্যানেলের জন্য) =====
// ===== GET SUBSCRIBER COUNT (অ্যাডমিন প্যানেলের জন্য) =====
app.get('/api/admin/subscribers/count', auth, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT COUNT(*)::int as total FROM public.subscribers WHERE is_active = true'
    );
    res.json({ total: result.rows[0].total });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not load subscriber count.' });
  }
});

// ===== GET ALL SUBSCRIBERS (অ্যাডমিন প্যানেলের জন্য) =====
app.get('/api/admin/subscribers', auth, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, email, name, is_active, created_at FROM public.subscribers ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Could not load subscribers.' });
  }
});

// ===== WELCOME EMAIL FUNCTION =====
async function sendWelcomeEmail(email, name) {
  try {
    const mailOptions = {
      from: `"FoodHub Restaurant" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: '🎉 Welcome to FoodHub Newsletter!',
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;background:#f8f9fa;border-radius:10px;">
          <div style="background:#0b6b57;padding:20px;border-radius:10px 10px 0 0;text-align:center;">
            <h1 style="color:white;margin:0;">🍽️ FoodHub</h1>
            <p style="color:rgba(255,255,255,0.9);margin:5px 0 0;">Newsletter</p>
          </div>
          <div style="background:white;padding:25px;border-radius:0 0 10px 10px;">
            <h2 style="color:#17202a;margin:0 0 10px;">Welcome to our community! 🎉</h2>
            <p style="color:#69737d;">Hi ${name || 'Foodie'},</p>
            <p style="color:#69737d;">Thank you for subscribing to FoodHub newsletter. You'll now receive:</p>
            <ul style="color:#69737d;line-height:2;">
              <li>🍕 Exclusive offers & discounts</li>
              <li>🔥 New menu updates</li>
              <li>🎉 Special event announcements</li>
              <li>💰 Surprise deals & coupons</li>
            </ul>
            <div style="background:#f8f9fa;padding:15px;border-radius:8px;margin:15px 0;text-align:center;">
              <p style="margin:0;color:#69737d;font-size:14px;">
                Use code <strong style="color:#f39c12;">WELCOME10</strong> for 10% off your first order!
              </p>
            </div>
            <hr style="border:none;border-top:1px solid #e9ecef;margin:20px 0;">
            <p style="color:#9aa8b9;font-size:12px;text-align:center;margin:0;">
              FoodHub Restaurant • Fresh • Fast • Delicious
            </p>
          </div>
        </div>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log(`Welcome email sent to ${email}`);
    return true;
  } catch (error) {
    console.error('Error sending welcome email:', error);
    return false;
  }
}

// ===== GET SINGLE ORDER FOR INVOICE =====
app.get('/api/admin/orders/:id', auth, adminOnly, async (req, res) => {
  try {
    const orderId = req.params.id;
    
    const orderResult = await pool.query(
      `SELECT o.id, o.customer_name, o.phone, o.address, o.total::float, o.status, o.created_at, 
              u.email as customer_email 
       FROM orders o 
       JOIN users u ON u.id = o.user_id 
       WHERE o.id = $1`,
      [orderId]
    );
    
    if (orderResult.rows.length === 0) {
      return res.status(404).json({ message: 'Order not found' });
    }
    
    const order = orderResult.rows[0];
    
    const itemsResult = await pool.query(
      `SELECT food_id, food_name, price::float, quantity 
       FROM order_items 
       WHERE order_id = $1 
       ORDER BY id`,
      [orderId]
    );
    
    order.items = itemsResult.rows;
    
    res.json(order);
  } catch (err) {
    console.error('Error loading order:', err);
    res.status(500).json({ message: 'Could not load order' });
  }
});

// ===== CUSTOMER DETAILS (অ্যাডমিন) =====
app.get('/api/admin/customers/:id', auth, adminOnly, async (req, res) => {
  try {
    const userId = req.params.id;
    
    // ইউজার ইনফরমেশন
    const userResult = await pool.query(
      `SELECT id, name, email, role, created_at 
       FROM public.users 
       WHERE id = $1`,
      [userId]
    );
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ message: 'Customer not found' });
    }
    
    const user = userResult.rows[0];
    
    // অর্ডার সামারি
    const orderSummary = await pool.query(
      `SELECT 
        COUNT(*)::integer as total_orders,
        COUNT(CASE WHEN status = 'Pending' THEN 1 END)::integer as pending,
        COUNT(CASE WHEN status = 'Confirmed' THEN 1 END)::integer as confirmed,
        COUNT(CASE WHEN status = 'Preparing' THEN 1 END)::integer as preparing,
        COUNT(CASE WHEN status = 'Out for Delivery' THEN 1 END)::integer as out_for_delivery,
        COUNT(CASE WHEN status = 'Delivered' THEN 1 END)::integer as delivered,
        COUNT(CASE WHEN status = 'Cancelled' THEN 1 END)::integer as cancelled,
        COALESCE(SUM(CASE WHEN status <> 'Cancelled' THEN total ELSE 0 END), 0)::float as total_spent
       FROM orders 
       WHERE user_id = $1`,
      [userId]
    );
    
    // সব অর্ডার
    const ordersResult = await pool.query(
      `SELECT id, customer_name, phone, address, total::float, status, created_at 
       FROM orders 
       WHERE user_id = $1 
       ORDER BY id DESC`,
      [userId]
    );
    
    // প্রতিটি অর্ডারের আইটেম
    for (const order of ordersResult.rows) {
      const items = await pool.query(
        `SELECT food_name, price::float, quantity 
         FROM order_items 
         WHERE order_id = $1`,
        [order.id]
      );
      order.items = items.rows;
    }
    
    // চ্যাট মেসেজ কাউন্ট
    const chatResult = await pool.query(
      `SELECT COUNT(*)::integer as message_count 
       FROM messages m
       JOIN chats c ON c.id = m.chat_id
       WHERE c.user_id = $1`,
      [userId]
    );
    
    res.json({
      user: user,
      summary: orderSummary.rows[0],
      orders: ordersResult.rows,
      message_count: chatResult.rows[0].message_count
    });
    
  } catch (err) {
    console.error('Error loading customer details:', err);
    res.status(500).json({ message: 'Could not load customer details' });
  }
});

// ===== FAQ API =====

// Get all active FAQs (public)
app.get('/api/faqs', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, question, answer, category, display_order 
       FROM public.faqs 
       WHERE is_active = true 
       ORDER BY display_order ASC, id ASC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error loading FAQs:', err);
    res.status(500).json({ message: 'Could not load FAQs' });
  }
});

// Get all FAQs (admin)
app.get('/api/admin/faqs', auth, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, question, answer, category, display_order, is_active, created_at, updated_at 
       FROM public.faqs 
       ORDER BY display_order ASC, id ASC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error loading FAQs:', err);
    res.status(500).json({ message: 'Could not load FAQs' });
  }
});

// Create FAQ (admin)
app.post('/api/admin/faqs', auth, adminOnly, async (req, res) => {
  try {
    const { question, answer, category, display_order, is_active } = req.body;
    
    if (!question || !question.trim()) {
      return res.status(400).json({ message: 'Question is required' });
    }
    if (!answer || !answer.trim()) {
      return res.status(400).json({ message: 'Answer is required' });
    }
    
    const result = await pool.query(
      `INSERT INTO public.faqs (question, answer, category, display_order, is_active) 
       VALUES ($1, $2, $3, $4, $5) 
       RETURNING id, question, answer, category, display_order, is_active, created_at`,
      [question.trim(), answer.trim(), category || 'General', display_order || 0, is_active !== undefined ? is_active : true]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating FAQ:', err);
    res.status(500).json({ message: 'Could not create FAQ' });
  }
});

// Update FAQ (admin)
app.put('/api/admin/faqs/:id', auth, adminOnly, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { question, answer, category, display_order, is_active } = req.body;
    
    if (!question || !question.trim()) {
      return res.status(400).json({ message: 'Question is required' });
    }
    if (!answer || !answer.trim()) {
      return res.status(400).json({ message: 'Answer is required' });
    }
    
    const result = await pool.query(
      `UPDATE public.faqs 
       SET question = $1, answer = $2, category = $3, display_order = $4, is_active = $5, updated_at = NOW()
       WHERE id = $6 
       RETURNING id, question, answer, category, display_order, is_active, updated_at`,
      [question.trim(), answer.trim(), category || 'General', display_order || 0, is_active !== undefined ? is_active : true, id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'FAQ not found' });
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error updating FAQ:', err);
    res.status(500).json({ message: 'Could not update FAQ' });
  }
});

// Delete FAQ (admin)
app.delete('/api/admin/faqs/:id', auth, adminOnly, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    
    const result = await pool.query(
      `DELETE FROM public.faqs WHERE id = $1 RETURNING id`,
      [id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'FAQ not found' });
    }
    
    res.json({ message: 'FAQ deleted successfully' });
  } catch (err) {
    console.error('Error deleting FAQ:', err);
    res.status(500).json({ message: 'Could not delete FAQ' });
  }
});

// Get FAQ count (admin dashboard)
app.get('/api/admin/faqs/count', auth, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT COUNT(*)::integer as total FROM public.faqs WHERE is_active = true'
    );
    res.json({ total: result.rows[0].total });
  } catch (err) {
    console.error('Error loading FAQ count:', err);
    res.status(500).json({ message: 'Could not load FAQ count' });
  }
});

// ===== FAVORITE FOODS API =====

// Get user's favorites
app.get('/api/favorites', auth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT f.id, f.food_id, f.created_at,
              fd.id as food_id, fd.name, fd.description, fd.price::float, fd.image, fd.category_id,
              c.name as category_name, c.icon as category_icon
       FROM public.favorites f
       JOIN public.foods fd ON fd.id = f.food_id
       LEFT JOIN public.categories c ON c.id = fd.category_id
       WHERE f.user_id = $1
       ORDER BY f.created_at DESC`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error('Error loading favorites:', err);
    res.status(500).json({ message: 'Could not load favorites' });
  }
});

// Add favorite
app.post('/api/favorites', auth, async (req, res) => {
  try {
    const { food_id } = req.body;
    
    if (!food_id) {
      return res.status(400).json({ message: 'Food ID is required' });
    }
    
    // Check if food exists
    const foodCheck = await pool.query('SELECT id FROM public.foods WHERE id = $1', [food_id]);
    if (foodCheck.rows.length === 0) {
      return res.status(404).json({ message: 'Food not found' });
    }
    
    // Check if already favorited
    const existing = await pool.query(
      'SELECT id FROM public.favorites WHERE user_id = $1 AND food_id = $2',
      [req.user.id, food_id]
    );
    
    if (existing.rows.length > 0) {
      return res.status(409).json({ message: 'Already in favorites' });
    }
    
    const result = await pool.query(
      'INSERT INTO public.favorites (user_id, food_id) VALUES ($1, $2) RETURNING id, food_id, created_at',
      [req.user.id, food_id]
    );
    
    res.status(201).json({ 
      message: 'Added to favorites!', 
      favorite: result.rows[0] 
    });
  } catch (err) {
    console.error('Error adding favorite:', err);
    res.status(500).json({ message: 'Could not add to favorites' });
  }
});

// Remove favorite
app.delete('/api/favorites/:food_id', auth, async (req, res) => {
  try {
    const food_id = parseInt(req.params.food_id);
    
    const result = await pool.query(
      'DELETE FROM public.favorites WHERE user_id = $1 AND food_id = $2 RETURNING id',
      [req.user.id, food_id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Favorite not found' });
    }
    
    res.json({ message: 'Removed from favorites' });
  } catch (err) {
    console.error('Error removing favorite:', err);
    res.status(500).json({ message: 'Could not remove from favorites' });
  }
});

// Check if food is favorited
app.get('/api/favorites/check/:food_id', auth, async (req, res) => {
  try {
    const food_id = parseInt(req.params.food_id);
    
    const result = await pool.query(
      'SELECT id FROM public.favorites WHERE user_id = $1 AND food_id = $2',
      [req.user.id, food_id]
    );
    
    res.json({ isFavorited: result.rows.length > 0 });
  } catch (err) {
    console.error('Error checking favorite:', err);
    res.status(500).json({ message: 'Could not check favorite status' });
  }
});

// Get favorite count for admin
app.get('/api/admin/favorites/count', auth, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT 
        COUNT(*)::integer as total_favorites,
        COUNT(DISTINCT user_id)::integer as unique_users,
        (SELECT food_id FROM favorites GROUP BY food_id ORDER BY COUNT(*) DESC LIMIT 1) as most_favorited_food
       FROM public.favorites`
    );
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error loading favorite count:', err);
    res.status(500).json({ message: 'Could not load favorite count' });
  }
});