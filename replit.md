# Programme de Révision - Accounting Audit Management System

## Overview

This is a web application for French accounting firms to manage audit revision programs ("Programme de Révision"). The system digitizes the accounting revision workflow, providing compliance tracking, document management, and multi-level approval workflows. It is designed with a layered architecture to enable future conversion to an offline desktop application via Electron/Tauri.

**Core Purpose:** Standardize and secure accounting audit documentation with role-based access, audit trails, and legal archiving compliance.

## Desktop Application (Electron)

The app can be packaged as a standalone desktop application (.exe / .dmg / AppImage). See `DESKTOP_BUILD.md` for full build instructions.

**Structure:**
- `electron/main.cjs` — Electron main process: starts Express server on a free port, opens a native window
- `electron/preload.cjs` — Context bridge exposing config read/write to renderer
- `electron/loading.html` — Splash screen shown while server boots
- `electron/setup.html` — First-run setup UI for DATABASE_URL configuration
- `electron/package.json` — electron + electron-builder dependencies and packaging config
- `DESKTOP_BUILD.md` — Step-by-step instructions to build the installer

**Build flow:** `npm run build` (web app) → `cd electron && npm install && npm run dist` → produces installer in `electron/release/`

**Key dependency change:** Replaced `bcrypt` (native module) with `bcryptjs` (pure JS) so the server bundle is fully portable without native `.node` binaries.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework:** React 18 with TypeScript, built using Vite
- **Routing:** Wouter for client-side routing
- **State Management:** TanStack React Query for server state caching and synchronization
- **UI Components:** shadcn/ui component library with Radix UI primitives
- **Styling:** TailwindCSS with CSS custom properties for theming (light/dark mode support)
- **Path Aliases:** `@/` maps to `client/src/`, `@shared/` maps to `shared/`

### Backend Architecture
- **Framework:** Express.js with TypeScript
- **Server:** Node.js with HTTP server, development uses Vite middleware for HMR
- **Session Management:** Express sessions with PostgreSQL session store (connect-pg-simple)
- **File Uploads:** Multer with disk storage to `uploads/` directory
- **API Pattern:** RESTful JSON API under `/api/` prefix

### Data Layer
- **ORM:** Drizzle ORM with PostgreSQL dialect
- **Schema Location:** `shared/schema.ts` - shared between frontend and backend
- **Migrations:** Drizzle Kit with output to `migrations/` directory
- **Validation:** Zod schemas generated from Drizzle schemas via drizzle-zod

### Authentication & Authorization
- **Authentication:** Session-based authentication with username/password
- **Roles:** Two user roles - `CHEF_MISSION` (Mission Chief) and `EXPERT_COMPTABLE` (Chartered Accountant)
- **Authorization:** Role-based access control enforced server-side

### Business Domain Entities
- **Users:** Role-based users (Chef de Mission, Expert-Comptable)
- **Clients:** Accounting firm clients with identifiers
- **Exercises:** Annual audit exercises per client with status workflow (DRAFT → IN_REVIEW → LOCKED)
- **Cycles:** Audit cycles within an exercise (ordered sections)
- **Questions:** Audit checklist questions within cycles
- **Answers:** Response status (OUI/NON/NA/PENDING) with mandatory comments for NON
- **Attachments:** File attachments (PDF/IMAGE/EXCEL) linked to answers
- **Approvals:** Two-tier approval workflow (Chef de Mission then Expert-Comptable)
- **LCB-FT Records:** Anti-money laundering compliance records per exercise
- **Audit Logs:** Immutable change tracking for compliance

### Key Business Rules (Server-Enforced)
1. Every question must have a status (OUI/NON/NA)
2. NON status requires mandatory comment
3. Cycle validation is two-step: Chef de Mission approval, then Expert-Comptable approval
4. After Expert-Comptable approval, cycle becomes read-only
5. Exercise locks when all cycles are validated by Expert-Comptable
6. No modifications allowed after LOCKED status (legal archiving)

### Build System
- **Development:** `tsx` for TypeScript execution with Vite dev server
- **Production Build:** Custom build script using esbuild for server bundling and Vite for client
- **Output:** `dist/` directory with `dist/public/` for static assets

## External Dependencies

### Database
- **PostgreSQL:** Primary database via `DATABASE_URL` environment variable
- **Session Store:** connect-pg-simple for session persistence

### File Storage
- **Local Storage:** Multer stores uploads in `uploads/` directory
- **Supported Types:** PDF, JPG, JPEG, PNG, XLSX, XLS (max 10MB)

### Development Tools
- **Replit Plugins:** Runtime error overlay, cartographer, dev banner (development only)
- **TypeScript:** Strict mode with module bundler resolution

### UI Dependencies
- **Radix UI:** Full suite of accessible primitives (dialog, dropdown, tabs, etc.)
- **Lucide React:** Icon library
- **date-fns:** Date formatting utilities
- **cmdk:** Command palette component
- **embla-carousel-react:** Carousel component
- **react-day-picker:** Calendar component
- **vaul:** Drawer component
- **react-resizable-panels:** Resizable panel layouts