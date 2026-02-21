# SplitExpense

A Splitwise-like expense splitting web app. Track shared expenses with friends and figure out who owes whom.

## Tech Stack

- **Frontend:** React + TypeScript + Tailwind CSS (Vite)
- **Backend:** Node.js + Express + TypeScript
- **Database:** PostgreSQL
- **Auth:** Email/password with bcrypt + JWT

## Features

- User registration and login (JWT auth)
- Create groups and add members
- Add expenses with multiple split types:
  - **Equal** - split evenly among selected members
  - **Exact** - specify exact dollar amounts per person
  - **Percentage** - split by percentage
  - **Shares** - split by share ratio
- View net balances per group
- Simplified debt suggestions (who pays whom to settle up)
- Delete expenses

## Setup

### Prerequisites

- Node.js 18+
- PostgreSQL running locally

### 1. Install dependencies

```bash
npm run install:all
```

### 2. Set up the database

Create a PostgreSQL database:

```bash
createdb splitexpense
```

Copy the env file and configure it:

```bash
cp server/.env.example server/.env
# Edit server/.env with your database URL and a strong JWT_SECRET
```

Run the migration:

```bash
cd server && npm run db:migrate
```

### 3. Start development servers

```bash
npm run dev
```

This starts:
- Backend API at `http://localhost:3001`
- Frontend at `http://localhost:5173`

The Vite dev server proxies `/api` requests to the backend automatically.

## Project Structure

```
├── client/                 # React frontend
│   ├── src/
│   │   ├── api/           # API client
│   │   ├── components/    # Reusable components
│   │   ├── context/       # Auth context
│   │   ├── pages/         # Page components
│   │   ├── App.tsx        # Router setup
│   │   └── main.tsx       # Entry point
│   └── ...
├── server/                 # Express backend
│   ├── src/
│   │   ├── db/            # Database pool, schema, migrations
│   │   ├── middleware/    # Auth middleware
│   │   ├── routes/        # API routes
│   │   ├── types/         # TypeScript types
│   │   └── index.ts       # Server entry point
│   └── ...
└── package.json            # Root workspace
```
