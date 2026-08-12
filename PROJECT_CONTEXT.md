# FoodHub Restaurant — Project Context

## Project
FoodHub is a full-stack restaurant ordering website.

## Current Status
The website is LIVE and working.

Live website:
https://foodhub-restaurant-udpp.onrender.com

Admin panel:
https://foodhub-restaurant-udpp.onrender.com/admin.html

## Local Project
D:\ek movies\bangla\restaurant-ordering-app

## GitHub
Repository:
https://github.com/EKMOVIES/foodhub-restaurant

Branch:
main

## Tech Stack
- Node.js
- Express
- HTML/CSS/JavaScript
- PostgreSQL via Supabase
- Render
- GitHub

## Database
Supabase PostgreSQL is connected successfully.

Tables:
- users
- foods
- orders
- order_items
- chats
- messages

The project uses DATABASE_URL for the Supabase PostgreSQL connection.

IMPORTANT:
- Never commit or share `.env`.
- `.env` contains sensitive database credentials.
- `.env.example` is safe to keep in GitHub.
- Never put the real database password in this file.

## Current Features

### Customer
- Signup
- Login
- Food menu
- Cart
- Place orders
- View orders / My Orders

### Admin
- Admin access/login
- Dashboard
- User list
- Food management
- Order management
- Customer chat

### Chat
- Customer ↔ Admin messaging is implemented.
- A previous message-input typing issue was addressed.

## Deployment Workflow

Always develop locally first.

Run locally:
```bash
npm install
npm start
```

Local URL:
http://localhost:10000

After changes:
```bash
git add .
git commit -m "Describe the change"
git push
```

Render deploys the GitHub `main` branch.

Render settings:
- Build Command: `npm install`
- Start Command: `node server.js`
- Environment variables:
  - `DATABASE_URL`
  - `JWT_SECRET`

## Important Development Rule

Do NOT edit the live website directly.

Use:
Local code → Test → Git commit → GitHub push → Render redeploy → Test live site

## How to Continue in a New Chat

If the previous ChatGPT conversation reaches its limit, start a new chat and provide this file/context.

Use a message like:

> Continue my FoodHub Restaurant project from this project context. The project is already live on Render and connected to Supabase. I want to add [FEATURE NAME]. Please inspect the existing project structure/code before changing anything and explain each step.

## Recommended Future Features
- Order tracking: Pending → Confirmed → Preparing → Out for Delivery → Delivered
- Better mobile responsiveness
- Food search/filter/sorting
- Customer reviews and ratings
- Coupon/discount system
- Delivery address management
- Payment integration
- Real-time chat
- Improved admin dashboard
- SEO/performance improvements
- Custom domain
- Production security hardening

## Security Reminder
If a password, API key, database URL, service-role key, or other secret is accidentally exposed, rotate it immediately.

Never paste real `.env` contents into GitHub or a public chat.
