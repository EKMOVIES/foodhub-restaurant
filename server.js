require("dotenv").config();

const express = require("express");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;

if (!process.env.DATABASE_URL || !JWT_SECRET) {
  console.error("Missing DATABASE_URL or JWT_SECRET. Copy .env.example to .env and fill them in.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 5,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

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
  const existing = await pool.query(
    "select id from public.chats where user_id = $1 limit 1",
    [userId]
  );
  if (existing.rows[0]) return existing.rows[0].id;

  const created = await pool.query(
    "insert into public.chats(user_id) values($1) returning id",
    [userId]
  );
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

// ---------------- AUTH ----------------
app.post("/api/auth/signup", async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email and password are required." });
    }
    if (password.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters." });
    }

    const exists = await pool.query(
      "select id from public.users where email = $1 limit 1",
      [email]
    );
    if (exists.rows[0]) {
      return res.status(409).json({ message: "An account with this email already exists." });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      `insert into public.users(name,email,password_hash,role)
       values($1,$2,$3,'customer')
       returning id,name,email,role`,
      [name, email, passwordHash]
    );

    const user = result.rows[0];
    res.status(201).json({
      message: "Account created.",
      token: makeToken(user),
      user
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

app.post("/api/auth/login", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    const result = await pool.query(
      "select * from public.users where email = $1 limit 1",
      [email]
    );
    const user = result.rows[0];

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const safeUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    };

    res.json({
      message: "Login successful.",
      token: makeToken(safeUser),
      user: safeUser
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

app.get("/api/me", auth, async (req, res) => {
  try {
    const result = await pool.query(
      "select id,name,email,role,created_at from public.users where id = $1",
      [req.user.id]
    );
    if (!result.rows[0]) return res.status(404).json({ message: "User not found." });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error." });
  }
});

// ---------------- FOODS ----------------
app.get("/api/foods", async (req, res) => {
  try {
    const result = await pool.query(
      "select id,name,description,price::float,image from public.foods order by id desc"
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not load menu." });
  }
});

// ---------------- CUSTOMER ORDERS ----------------
app.post("/api/orders", auth, async (req, res) => {
  const client = await pool.connect();
  try {
    const { items, customerName, phone, address } = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "Your cart is empty." });
    }
    if (!customerName || !phone || !address) {
      return res.status(400).json({
        message: "Customer name, phone and address are required."
      });
    }

    await client.query("begin");

    let total = 0;
    const cleanItems = [];

    for (const item of items) {
      const foodId = Number(item.foodId);
      const quantity = Number(item.quantity);

      if (!Number.isInteger(foodId) || !Number.isInteger(quantity) || quantity < 1 || quantity > 99) {
        throw new Error("Invalid food or quantity.");
      }

      const result = await client.query(
        "select id,name,price::float from public.foods where id = $1",
        [foodId]
      );
      const food = result.rows[0];

      if (!food) throw new Error("A selected food no longer exists.");

      total += Number(food.price) * quantity;
      cleanItems.push({
        foodId: food.id,
        name: food.name,
        price: Number(food.price),
        quantity
      });
    }

    const orderResult = await client.query(
      `insert into public.orders(user_id,customer_name,phone,address,total)
       values($1,$2,$3,$4,$5)
       returning id,total::float`,
      [
        req.user.id,
        String(customerName).trim(),
        String(phone).trim(),
        String(address).trim(),
        total
      ]
    );

    const orderId = orderResult.rows[0].id;

    for (const item of cleanItems) {
      await client.query(
        `insert into public.order_items(order_id,food_id,food_name,price,quantity)
         values($1,$2,$3,$4,$5)`,
        [orderId, item.foodId, item.name, item.price, item.quantity]
      );
    }

    await client.query("commit");

    res.status(201).json({
      message: "Order placed.",
      orderId,
      total
    });
  } catch (err) {
    await client.query("rollback");
    console.error(err);
    res.status(400).json({ message: err.message || "Could not place order." });
  } finally {
    client.release();
  }
});

app.get("/api/orders", auth, async (req, res) => {
  try {
    const orders = await pool.query(
      `select id,customer_name,phone,address,total::float,status,created_at
       from public.orders
       where user_id = $1
       order by id desc`,
      [req.user.id]
    );

    for (const order of orders.rows) {
      const items = await pool.query(
        `select food_id,food_name,price::float,quantity
         from public.order_items where order_id = $1 order by id`,
        [order.id]
      );
      order.items = items.rows;
    }

    res.json(orders.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not load orders." });
  }
});

// ---------------- CUSTOMER CHAT ----------------
app.get("/api/chat", auth, async (req, res) => {
  try {
    const chatId = await ensureChat(req.user.id);
    const result = await pool.query(
      `select id,sender_id,sender_role,message,created_at
       from public.messages where chat_id = $1 order by id asc`,
      [chatId]
    );
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
    const result = await pool.query(
      `insert into public.messages(chat_id,sender_id,sender_role,message)
       values($1,$2,$3,$4)
       returning id,sender_id,sender_role,message,created_at`,
      [chatId, req.user.id, req.user.role, message]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not send message." });
  }
});

// ---------------- ADMIN ----------------
app.get("/api/admin/stats", auth, adminOnly, async (req, res) => {
  try {
    const [foods, orders, customers, revenue] = await Promise.all([
      pool.query("select count(*)::int as count from public.foods"),
      pool.query("select count(*)::int as count from public.orders"),
      pool.query("select count(*)::int as count from public.users where role='customer'"),
      pool.query(
        "select coalesce(sum(total),0)::float as total from public.orders where status <> 'Cancelled'"
      )
    ]);

    res.json({
      foods: foods.rows[0].count,
      orders: orders.rows[0].count,
      customers: customers.rows[0].count,
      revenue: revenue.rows[0].total
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not load dashboard." });
  }
});

app.get("/api/admin/users", auth, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(`
      select
        u.id,u.name,u.email,u.role,u.created_at,
        count(distinct o.id)::int as order_count,
        coalesce(sum(case when o.status <> 'Cancelled' then o.total else 0 end),0)::float as total_spent,
        count(distinct m.id)::int as message_count
      from public.users u
      left join public.orders o on o.user_id = u.id
      left join public.chats c on c.user_id = u.id
      left join public.messages m on m.chat_id = c.id
      group by u.id
      order by u.created_at desc
    `);

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not load users." });
  }
});

app.get("/api/admin/orders", auth, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(`
      select o.id,o.customer_name,o.phone,o.address,o.total::float,o.status,o.created_at,
             u.email as customer_email
      from public.orders o
      join public.users u on u.id = o.user_id
      order by o.id desc
    `);

    for (const order of result.rows) {
      const items = await pool.query(
        `select food_id,food_name,price::float,quantity
         from public.order_items where order_id=$1 order by id`,
        [order.id]
      );
      order.items = items.rows;
    }

    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not load orders." });
  }
});

app.patch("/api/admin/orders/:id/status", auth, adminOnly, async (req, res) => {
  const allowed = [
    "Pending",
    "Confirmed",
    "Preparing",
    "Out for Delivery",
    "Delivered",
    "Cancelled"
  ];

  if (!allowed.includes(req.body.status)) {
    return res.status(400).json({ message: "Invalid order status." });
  }

  try {
    const result = await pool.query(
      "update public.orders set status=$1 where id=$2 returning id",
      [req.body.status, req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ message: "Order not found." });
    res.json({ message: "Order status updated." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not update order." });
  }
});

app.post("/api/admin/foods", auth, adminOnly, async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const description = String(req.body.description || "").trim();
    const image = String(req.body.image || "").trim();
    const price = Number(req.body.price);

    if (!name || !description || !image || !Number.isFinite(price) || price < 0) {
      return res.status(400).json({
        message: "Name, description, valid price and image are required."
      });
    }

    const result = await pool.query(
      `insert into public.foods(name,description,price,image)
       values($1,$2,$3,$4)
       returning id,name,description,price::float,image`,
      [name, description, price, image]
    );

    res.status(201).json({ food: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not add food." });
  }
});

app.put("/api/admin/foods/:id", auth, adminOnly, async (req, res) => {
  try {
    const name = String(req.body.name || "").trim();
    const description = String(req.body.description || "").trim();
    const image = String(req.body.image || "").trim();
    const price = Number(req.body.price);

    if (!name || !description || !image || !Number.isFinite(price) || price < 0) {
      return res.status(400).json({
        message: "Name, description, valid price and image are required."
      });
    }

    const result = await pool.query(
      `update public.foods set name=$1,description=$2,price=$3,image=$4
       where id=$5
       returning id,name,description,price::float,image`,
      [name, description, price, image, req.params.id]
    );

    if (!result.rows[0]) return res.status(404).json({ message: "Food not found." });
    res.json({ food: result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not update food." });
  }
});

app.delete("/api/admin/foods/:id", auth, adminOnly, async (req, res) => {
  try {
    const used = await pool.query(
      "select count(*)::int as count from public.order_items where food_id=$1",
      [req.params.id]
    );
    if (used.rows[0].count > 0) {
      return res.status(400).json({
        message: "This food exists in past orders, so edit it instead of deleting it."
      });
    }

    const result = await pool.query(
      "delete from public.foods where id=$1 returning id",
      [req.params.id]
    );
    if (!result.rows[0]) return res.status(404).json({ message: "Food not found." });
    res.json({ message: "Food deleted." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not delete food." });
  }
});

// Admin chat endpoints use customer user UUIDs, matching the frontend.
app.get("/api/admin/chats", auth, adminOnly, async (req, res) => {
  try {
    const result = await pool.query(`
      select
        u.id as user_id,
        u.name,
        u.email,
        max(m.created_at) as last_message_at,
        (
          select m2.message
          from public.messages m2
          join public.chats c2 on c2.id=m2.chat_id
          where c2.user_id=u.id
          order by m2.id desc limit 1
        ) as last_message
      from public.users u
      join public.chats c on c.user_id=u.id
      left join public.messages m on m.chat_id=c.id
      group by u.id
      order by last_message_at desc nulls last, u.created_at desc
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not load chats." });
  }
});

app.get("/api/admin/chats/:userId", auth, adminOnly, async (req, res) => {
  try {
    const user = await pool.query(
      "select id,name,email from public.users where id=$1",
      [req.params.userId]
    );
    if (!user.rows[0]) return res.status(404).json({ message: "Customer not found." });

    const chat = await pool.query(
      "select id from public.chats where user_id=$1 limit 1",
      [req.params.userId]
    );

    if (!chat.rows[0]) {
      return res.json({ user: user.rows[0], chatId: null, messages: [] });
    }

    const messages = await pool.query(
      `select id,sender_id,sender_role,message,created_at
       from public.messages where chat_id=$1 order by id asc`,
      [chat.rows[0].id]
    );

    res.json({
      user: user.rows[0],
      chatId: chat.rows[0].id,
      messages: messages.rows
    });
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
    const result = await pool.query(
      `insert into public.messages(chat_id,sender_id,sender_role,message)
       values($1,$2,'admin',$3)
       returning id,sender_id,sender_role,message,created_at`,
      [chatId, req.user.id, message]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Could not send reply." });
  }
});

// Fallback for SPA-like hosting; keep admin.html directly accessible.
app.get("/admin", (req, res) => res.sendFile(path.join(__dirname, "public", "admin.html")));

app.listen(PORT, () => {
  console.log(`FoodHub server running on port ${PORT}`);
});
