# FoodHub Restaurant — Supabase + Render Ready

This project has been converted from SQLite to PostgreSQL so it can be deployed publicly.

## Stack
- Node.js + Express
- PostgreSQL on Supabase
- JWT authentication
- bcrypt password hashing
- Customer signup/login
- Menu, cart and orders
- Admin dashboard
- User list
- Customer/admin chat

## 1. Supabase
The required tables are already created in the Supabase project if you followed the setup steps.

If setting up a fresh project, run `supabase-schema.sql` in Supabase SQL Editor.
Because you already created the six tables in this chat, do **not** run the table-creation SQL again unless you are setting up another project. You may run `supabase-menu-seed.sql` if you want all six starter foods.

## 2. Get the database connection string
In Supabase click **Connect**. For a hosted Node/Express server, use the PostgreSQL connection string supplied by Supabase. If Supabase offers a **Session Pooler** connection, it is a good choice for server deployments.

Never publish this connection string.

## 3. Local setup
Create a `.env` file beside `server.js`:

```env
PORT=3000
DATABASE_URL=YOUR_SUPABASE_POSTGRES_CONNECTION_STRING
JWT_SECRET=YOUR_LONG_RANDOM_SECRET
```

Then in Command Prompt:

```bat
cd /d "D:\ek movies\bangla\restaurant-ordering-app"
npm install
npm start
```

Open:

```text
http://localhost:3000
```

Check the database connection:

```text
http://localhost:3000/api/health
```

You should see:

```json
{"ok":true,"database":"connected"}
```

## 4. Create the first admin
For security, this version does NOT contain a public hard-coded admin password.

First create a normal account from the website.

Then in Supabase SQL Editor run:

```sql
update public.users
set role = 'admin'
where email = 'YOUR_EMAIL@example.com';
```

Log out and log in again. Then open:

```text
http://localhost:3000/admin.html
```

## 5. GitHub
Before uploading:
- Keep `.env` local only.
- `.gitignore` already excludes `.env` and database files.
- Upload the project files to a new GitHub repository.

## 6. Render
Create a **Web Service** from the GitHub repository.

Build command:
```text
npm install
```

Start command:
```text
npm start
```

Environment variables:
```text
DATABASE_URL=your_supabase_postgres_connection_string
JWT_SECRET=your_long_random_secret
```

Use the Render URL as your public website.

## Important
Do not commit passwords, database connection strings or `.env` to GitHub.

This is a strong learning/deployment base, but before taking real payments or large traffic, add rate limiting, stronger validation, monitoring, backups and a real payment gateway with server-side verification.
