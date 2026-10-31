# Raft Board — Design System & UI Specification

> **Otter Software Systems (OSS)**  
> *"Building software like no otter."*

---

## 1. Brand Identity & Creative Direction

Raft Board is the internal progress game for the 6-member team at Otter Software Systems.
The aesthetic is **fresh, playful, high-velocity, and distinctly maritime/aquatic**. It avoids generic AI purple gradients and template cards in favor of a cohesive river-and-sea otter palette: deep oceanic slates, vibrant fresh-water blues, sunlit pebble backgrounds, and warm river-otter amber accents.

### Core Visual Principles
- **Friendly, Not Frivolous**: Playful otter mascots and badges grounded in clean, precise typography and software-craft polish.
- **Mobile-First Velocity**: Compact, thumb-friendly tap targets, sticky bottom navigation, instant visual status of who has logged their progress.
- **High Clarity**: Clear role badges (Executive vs. Lead), distinct level indicators, and unmistakable weekly status badges.
- **Strictly No Generic AI Templates**: Custom otter iconography, real Lucide icons, distinctive font pairing, and dedicated mobile PWA ergonomics.

---

## 2. Color Palette & Design Tokens

### Primary Palette (River & Ocean Blues)
- `--brand-ocean-dark`: `#071927` (Deep underwater header & dark surface tone)
- `--brand-river-deep`: `#0c4a6e` (Ocean 900 - dark accents, text emphasis)
- `--brand-primary`: `#0284c7` (Sky 600 - primary actions, active tabs, main brand)
- `--brand-primary-hover`: `#0369a1` (Sky 700 - hover / active states)
- `--brand-sky-light`: `#e0f2fe` (Sky 100 - soft badge backgrounds, highlights)
- `--brand-sky-surface`: `#f0f9ff` (Sky 50 - subtle panel backgrounds)

### Warm Accent Palette (Pebble & Otter Amber)
- `--accent-otter-amber`: `#d97706` (Amber 600 - streak highlights, badges, XP indicators)
- `--accent-otter-warm`: `#fef3c7` (Amber 100 - warm pill backgrounds)
- `--accent-otter-deep`: `#92400e` (Amber 800 - badge text)

### Neutral Palette (Pebble Slate)
- `--neutral-bg`: `#f8fafc` (Slate 50 - app canvas background)
- `--neutral-surface`: `#ffffff` (Card and sheet surfaces)
- `--neutral-border`: `#e2e8f0` (Slate 200 - subtle dividers and borders)
- `--neutral-border-subtle`: `#f1f5f9` (Slate 100 - inner group borders)
- `--neutral-text-strong`: `#0f172a` (Slate 900 - primary headings and body)
- `--neutral-text-muted`: `#64748b` (Slate 500 - captions, timestamps, subtitles)
- `--neutral-text-subtle`: `#94a3b8` (Slate 400 - placeholders, disabled states)

### Semantic Colors
- **Success (Updated / Goal Met)**: `#10b981` (Emerald 500) | Background: `#ecfdf5`
- **Pending (Not Yet Updated)**: `#f59e0b` (Amber 500) | Background: `#fffbeb`
- **Destructive / Alert**: `#ef4444` (Rose 500) | Background: `#fef2f2`
- **Rest Mode**: `#8b5cf6` (Purple 500) | Background: `#f5f3ff`

---

## 3. Typography & Font Pairing

- **Display & Headings**: `Outfit`, `sans-serif` (Warm, geometric, friendly rounded feel)
- **Body & Data**: `Plus Jakarta Sans`, `Inter`, `system-ui`, `sans-serif` (Crisp readability, high legibility for task numbers and names)
- **Monospace / Code**: `JetBrains Mono`, `ui-monospace`, `monospace` (For XP, time stamps, version numbers)

### Type Scale
- `text-xs`: 12px (0.75rem) — Badges, secondary metadata, bottom nav labels
- `text-sm`: 14px (0.875rem) — Body secondary, table rows, button secondary
- `text-base`: 16px (1rem) — Primary body copy, inputs, list titles
- `text-lg`: 18px (1.125rem) — Card section headers, prominent member names
- `text-xl`: 20px (1.25rem) — Page subsection headers
- `text-2xl`: 24px (1.5rem) — Top page titles, level milestone titles
- `text-3xl`: 30px (1.875rem) — Leaderboard rankings, score callouts

---

## 4. Spacing, Elevation & Radii Scale

- **Grid Base**: 4px
- **Spacing Units**:
  - `space-1` (4px), `space-2` (8px), `space-3` (12px), `space-4` (16px), `space-6` (24px), `space-8` (32px)
- **Border Radii**:
  - Small Elements (Badges, tags): `rounded-lg` (8px)
  - Cards & Inputs: `rounded-2xl` (16px)
  - Modals & Sheets: `rounded-3xl` (24px)
  - Nav Pills & Buttons: `rounded-full` (9999px)
- **Elevation / Shadows**:
  - Flat Card: `shadow-sm border border-slate-200/80`
  - Floating Action / Bottom Nav: `shadow-[0_-4px_20px_rgba(15,23,42,0.08)]`
  - Modal / Sheet: `shadow-2xl`

---

## 5. Component Specifications (Phase 1 Foundation)

1. **AppHeader**:
   - Otter mascot icon badge (`Raft Board`)
   - Tagline badge (`OSS`)
   - User profile avatar chip with role title
   - Quick meeting countdown pill ("Sat meeting in X days")

2. **BottomNavigation (Mobile-First Shell)**:
   - Fixed to viewport bottom with safe-area-inset padding for iOS/Android
   - 5 Tabs with Lucide icons:
     - `Home` (`Home` icon)
     - `My Week` (`CalendarCheck2` icon)
     - `Team` (`Users` icon)
     - `Leaderboard` (`Trophy` icon)
     - `Settings` (`Settings` icon)
   - Active indicator: Soft aquatic blue pill highlight with active color fill

3. **RoleBadge**:
   - `executive`: Deep slate/blue badge (`bg-sky-100 text-sky-900 border border-sky-300 font-semibold`)
   - `lead`: Crisp teal badge (`bg-teal-50 text-teal-800 border border-teal-200 font-medium`)
   - `super_admin`: Crown/shield indicator pill
   - `treasurer`: Coins indicator pill

4. **PWA Install Banner**:
   - Floats above bottom nav when `beforeinstallprompt` event fires
   - Friendly otter copy: "Add Raft Board to your Home Screen for instant access!"
   - Install and Dismiss buttons

5. **Auth Card & Password Reset Screen**:
   - Clean, centered on desktop, edge-to-edge friendly on mobile
   - Clear error notifications and password change enforcement
