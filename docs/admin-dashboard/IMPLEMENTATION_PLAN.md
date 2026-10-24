# SAMONA Admin Dashboard Implementation Plan

## Overview
Build a secure, scalable admin dashboard for SAMONA with Next.js frontend, extending the existing Express backend.

## Phase 1: Database Schema & Migrations
- [ ] Add AdminUser model (linked to Profile via profileId, has role, permissions, isActive)
- [ ] Add AdminRole enum (SUPER_ADMIN, OPERATIONS_ADMIN, FINANCE_ADMIN, SUPPORT_ADMIN)
- [ ] Add AdminSession model (for web sessions with tokens, device info, expiry)
- [ ] Add AdminLoginEvent model (track all login attempts for rate limiting/audit)
- [ ] Add AdminAuditLog model (comprehensive audit trail)
- [ ] Add relation to Profile model
- [ ] Generate and run migrations

## Phase 2: Backend - Admin Auth & Security Foundation
- [ ] Create admin domain structure (`server/src/admin/`)
- [ ] Admin auth service (OTP flow via Supabase, admin verification)
- [ ] Admin login rate limiting (3 failures / 1 hour, by IP, phone, deviceId) using Redis
- [ ] Admin session management (HttpOnly secure cookies)
- [ ] Admin middleware (requireAdmin, requirePermission)
- [ ] Admin audit logging service & middleware
- [ ] Provisioning script for creating admins (CLI)

## Phase 3: Backend - Admin API Routes
- [ ] Auth routes (`/api/v1/admin/auth/*`) - request-otp, verify-otp, logout, me
- [ ] Dashboard routes (`/api/v1/admin/dashboard/*`) - metrics, charts
- [ ] Customers routes (`/api/v1/admin/customers/*`) - CRUD, suspend/reactivate
- [ ] Professionals routes (`/api/v1/admin/professionals/*`) - verify, suspend, view details
- [ ] Jobs/Bookings routes (`/api/v1/admin/jobs/*`) - monitor, view details
- [ ] Services/Categories routes (`/api/v1/admin/categories/*`) - manage
- [ ] Payments routes (`/api/v1/admin/payments/*`) - reports, records
- [ ] Support routes (`/api/v1/admin/support/*`) - tickets
- [ ] Notifications routes (`/api/v1/admin/notifications/*`) - announcements
- [ ] Analytics routes (`/api/v1/admin/analytics/*`) - reports
- [ ] Admin management routes (`/api/v1/admin/admins/*`) - manage admins (super admin only)
- [ ] Audit logs routes (`/api/v1/admin/audit-logs/*`) - view logs
- [ ] Settings routes (`/api/v1/admin/settings/*`)
- [ ] Mount all routes in server/src/routes.ts
- [ ] Add to Services context

## Phase 4: Frontend - Next.js Admin App
- [ ] Create `apps/admin/` with Next.js 15 App Router
- [ ] Setup Tailwind CSS, shadcn/ui, dependencies
- [ ] Auth pages (login with phone OTP)
- [ ] Dashboard layout (sidebar, header)
- [ ] Dashboard overview page
- [ ] All management pages per routes
- [ ] API client integration
- [ ] Auth context/providers
- [ ] Route protection

## Phase 5: Testing & Finalization
- [ ] Type checking
- [ ] Linting
- [ ] Basic tests for critical paths
- [ ] Documentation

## Decisions Made
- Admin app: Next.js 15 in `apps/admin/` (separate web app)
- Auth: Admin web uses its own session system with HttpOnly cookies (separate from mobile JWT flow)
- Device ID: Client-generated UUID stored in cookie/localStorage for rate limiting
- RBAC: Roles on AdminUser + permission checking middleware, with SUPER_ADMIN having full access
- Provisioning: CLI script in server to create first admin + API for super admins to add more
- Rate limiting: Custom Redis-based for admin login (3 failures / 1 hour by IP+phone+device)
