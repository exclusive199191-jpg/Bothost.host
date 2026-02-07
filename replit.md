# NETRUNNER_V1 - Discord Self-Bot Manager

## Overview

This is a full-stack web application for managing Discord self-bot instances. It provides a cyberpunk/hacker-themed dashboard where users can deploy, configure, and monitor multiple Discord self-bot accounts. Each bot supports Rich Presence (RPC) customization, AFK mode with auto-responses, Nitro sniping, and "bully target" lists. The app is called "NETRUNNER_V1" and has a terminal/cyber aesthetic throughout the UI.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript, bundled by Vite
- **Routing**: Wouter (lightweight client-side router) with two main routes: Dashboard (`/`) and Bot Detail (`/bot/:id`)
- **State Management**: TanStack React Query for server state (fetching, caching, mutations)
- **Forms**: React Hook Form with Zod resolvers for validation
- **UI Components**: Shadcn/ui (new-york style) built on Radix UI primitives, heavily customized with a cyberpunk dark theme
- **Styling**: Tailwind CSS with CSS variables for theming. Custom neon green/purple color scheme. Custom fonts: JetBrains Mono (monospace), Orbitron (display headings), Rajdhani (body text)
- **Animations**: Framer Motion for transitions and terminal-style animations
- **Custom Components**: CyberButton, CyberInput, TerminalCard, BotStatusBadge — all styled with corner accents, neon glows, and a hacker aesthetic
- **Path aliases**: `@/` maps to `client/src/`, `@shared/` maps to `shared/`

### Backend Architecture
- **Runtime**: Node.js with Express
- **Language**: TypeScript, executed via `tsx` in development
- **API Pattern**: RESTful JSON API under `/api/` prefix. Routes defined in `server/routes.ts` with Zod validation
- **Route Definitions**: Shared route contracts in `shared/routes.ts` define method, path, input schema, and response schemas — used by both client and server
- **Bot Management**: `BotManager` service class (`server/services/botManager.ts`) manages Discord self-bot client instances in memory using `discord.js-selfbot-v13`. Bots auto-start on creation if `isRunning` is true. Supports RPC, AFK auto-reply, and self-message command handling (prefix: `.`)
- **Development**: Vite dev server with HMR proxied through Express. In production, static files served from `dist/public`
- **Build**: Custom build script using esbuild for server bundling and Vite for client bundling

### Data Storage
- **Database**: PostgreSQL via `DATABASE_URL` environment variable
- **ORM**: Drizzle ORM with `drizzle-zod` for automatic Zod schema generation from database tables
- **Schema Location**: `shared/schema.ts` — single source of truth for both DB schema and validation
- **Migrations**: Drizzle Kit with `drizzle-kit push` for schema synchronization
- **Storage Layer**: `server/storage.ts` implements `IStorage` interface with `DatabaseStorage` class wrapping Drizzle queries

### Database Schema
Single table `bot_configs`:
- `id` (serial, PK)
- `token` (text, unique, required) — Discord user token
- `name` (text, default "Unknown")
- `isRunning` (boolean, default true)
- RPC fields: `rpcTitle`, `rpcSubtitle`, `rpcAppName`, `rpcImage`, `rpcType` (PLAYING/STREAMING/LISTENING/WATCHING)
- Automation: `afkMessage`, `isAfk`, `nitroSniper`
- `bullyTargets` (text array) — list of Discord user IDs
- `lastSeen` (timestamp)

### API Endpoints
- `GET /api/bots` — List all bot configurations
- `GET /api/bots/:id` — Get single bot config
- `POST /api/bots` — Create new bot (auto-starts if isRunning)
- `PUT /api/bots/:id` — Update bot configuration
- `DELETE /api/bots/:id` — Delete bot
- `POST /api/bots/:id/start` — Start a bot instance
- `POST /api/bots/:id/stop` — Stop a bot instance
- `POST /api/bots/:id/restart` — Restart a bot instance

## External Dependencies

- **PostgreSQL**: Primary database, connected via `DATABASE_URL` environment variable. Uses `pg` (node-postgres) connection pool
- **discord.js-selfbot-v13**: Discord self-bot library for connecting user accounts, setting Rich Presence, listening to messages. Clients are managed in-memory by `BotManager`
- **Shadcn/ui + Radix UI**: Full suite of accessible UI primitives (dialog, dropdown, tabs, switch, toast, etc.)
- **Drizzle ORM + Drizzle Kit**: Database ORM and migration tooling for PostgreSQL
- **TanStack React Query**: Client-side data fetching and cache management
- **Framer Motion**: Animation library for UI transitions
- **React Hook Form + Zod**: Form management and schema validation
- **Vite**: Frontend build tool and dev server with HMR
- **Google Fonts**: JetBrains Mono, Orbitron, Rajdhani, Geist Mono, DM Sans, Fira Code, Architects Daughter