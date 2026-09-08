# Master System Architecture & Project Blueprint (`PROJECT_GUIDE.md`)

Welcome to the comprehensive technical documentation and system architecture guide for **El-Garage System (نظام الجراجات)**. This guide provides an in-depth, plain-English breakdown of every module, business logic edge case, security guardrail, and software pattern used throughout this repository.

---

## 🏛️ 1. System Ecosystem & User Roles

The application is structured around a three-tier operational hierarchy managing commercial parking garages, subscriptions, field delegates, and financial accounting.

```
                  ┌───────────────────────────────┐
                  │      ADMINISTRATOR PANEL      │
                  │ (Full Control & Financials)   │
                  └──────────────┬────────────────┘
                                 │
                 ┌───────────────┴───────────────┐
                 │                               │
  ┌──────────────▼──────────────┐ ┌──────────────▼──────────────┐
  │      DELEGATE DASHBOARD     │ │      GARAGE OWNER PORTAL    │
  │ (Field Sales & Collections) │ │ (Vehicle Logs & Subscriptions)│
  └─────────────────────────────┘ └─────────────────────────────┘
```

### 1.1 System Roles
1. **Admin (Super Administrator):**
   - Creates and manages garage accounts, delegates, and global packages.
   - Manages global financial configurations (referral fees, monthly subscriber flat fees, commission structures).
   - Audits global financial ledgers, delegate balance settlements, and system activity logs.
2. **Garage Owner (مدير الجراج):**
   - Manages day-to-day vehicle check-ins and check-outs via manual license plate entry or camera barcode/plate scanning.
   - Views current package subscription status, vehicle capacity limits, and expiry dates.
   - Requests subscription recharges via delegates or direct online payment.
3. **Delegate (المندوب Field Agent):**
   - Onboards new garages into the system and collects cash/bank payments for package recharges.
   - Earns dynamic commissions per package recharged based on garage classification (e.g., whether the garage has monthly subscribers).
   - Tracks cash collected, pending settlements with management, and personal earnings.

---

## 📁 2. Codebase Directory & Architecture Map

The project is built using **React 18 + TypeScript + Vite + Tailwind CSS** backed by **Firebase Firestore**.

```
/src
├── components/          # Modular UI components separated by domain
│   ├── admin/           # Super Admin views (Garages, Delegates, Packages, Financials)
│   ├── garage/          # Garage operational views (Check-in/out, History, Active Plan)
│   ├── delegate/        # Field Delegate views (Garage onboarding, Recharges, Ledger)
│   ├── modals/          # Reusable modal dialogs (Package selection, Payment breakdown)
│   └── common/          # Shared visual controls (License plate input, Status badges)
├── constants/           # Business defaults, default packages, and fallback constants
├── hooks/               # Custom React hooks for Firestore subscriptions & state management
├── types/               # TypeScript interfaces, types, and schema models
├── utils/               # Universal helper utilities (Formatting, Safe Data Parsers, Calculations)
└── App.tsx              # Root router, role authentication state, and main layout container
```

---

## 💰 3. Business Logic & Financial Calculation Engine

### 3.1 Package Pricing & Subscriptions Formula
When a garage recharges or subscribes to a package, the final price is calculated dynamically:

$$\text{Final Price} = \text{Base Package Price} + \text{Subscriber Flat Fee (if applicable)} + \text{Referral Fee (if applicable)}$$

- **Base Package Price:** Defined per package in the Admin Packages panel.
- **Subscriber Flat Fee (`useSystemSubscribersFlatFee`):** An additional operational surcharge applied if the garage handles long-term monthly subscribers.
- **Referral Fee (`useSystemReferralFee`):** Applied if the garage was onboarded via a referral link or field delegate.

### 3.2 Dynamic Duration Filter Tabs
Packages are categorized by duration in days ($1$, $7$, $15$, $30+$ days). The duration tabs shown in the UI (`1 Day`, `15 Days`, `30 Days`) are **dynamically extracted** from the currently active package list:
- If no 15-day packages exist in the database, the "15 Days" tab automatically hides itself.
- If custom duration packages (e.g., 7 days) are added by Admin, a new corresponding tab renders automatically.

---

## 🛡️ 4. Business Guardrails & Recharge Hierarchy Rules

To prevent accidental data corruption or invalid subscription states, the system enforces strict guardrails during package recharge:

### 4.1 Subscription Guardrail Rules
1. **Long-Term vs. Short-Term Protection:**
   - A garage with an active **30-day (monthly)** subscription **cannot** be recharged with a **1-day (daily)** package until the monthly package expires. This prevents accidentally downgrading long-term garages.
2. **Capacity Hierarchy Protection:**
   - A garage on an **Unlimited Vehicle** plan cannot be downgraded to a **Limited Vehicle** plan during an active subscription window.
3. **Rollover & Expiry Extension:**
   - If a garage recharges before their current plan expires, the new duration is **added onto the remaining days** (Expiry Extension).
   - If recharged after expiration, the subscription start time resets to the **current timestamp**.

---

## ⚡ 5. Technical Edge Cases & Safety Protocols ("Zero-Bug" Laws)

This codebase enforces strict defensive programming guidelines to eliminate runtime exceptions:

### 5.1 The `safeDate()` Protocol
Firestore stores timestamps as `Timestamp` objects, while JavaScript uses `Date` or `string` ISO representations. Directly calling `.toDate()` or `.getTime()` on an unvalidated date field will crash the application if the value is `null`, `undefined`, or a primitive number.

- **Solution:** All date manipulations pass through `safeDate(val)`:
```typescript
import { safeDate } from '../utils';

// Safe execution regardless of date format
const timestamp = safeDate(garage?.balanceExpiry).getTime();
```

### 5.2 Numeric Sanitization & Arabic/English Digit Normalization
Users entering numbers or license plates in Egypt frequently alternate between Arabic numerals (`١٢٣`) and standard English digits (`123`).
- All numeric input fields utilize `inputMode="numeric"` with `.replace(/\D/g, '')` in `onChange`.
- All text inputs pass through `normalizeDigits(str)` to convert standard/Eastern Arabic numerals into unified English digits for database querying.

### 5.3 Concurrency Protection (`runTransaction`)
Financial transactions—such as a delegate collecting cash to recharge a garage—involve multiple Firestore document updates:
1. Deducting/adding delegate balance.
2. Updating garage subscription status and expiry.
3. Logging an immutable financial transaction audit record.

These operations are executed using **Atomic Firestore Transactions** (`runTransaction`). If any step fails or internet connectivity drops, the entire transaction rolls back automatically, preventing partial state corruption.

### 5.4 Realistic Egyptian License Plate Component
Vehicle check-in uses a custom-styled UI component mimicking the exact visual layout of standard Egyptian vehicle license plates:
- Split into a **Numbers Section** (up to 4 digits) and a **Letters Section** (up to 3 Arabic characters).
- Formats input automatically and enforces character constraints (`getCleanPlate()`).

---

## 🛠️ 6. Maintenance & Modification Workflow

When extending or modifying this project, adhere to the following steps:

1. **Adding New Packages:**
   - Define package schema in `/src/types/index.ts`.
   - Update fallback defaults in `/src/constants/packages.ts`.
2. **Modifying Financial Formulas:**
   - Always adjust calculation utilities in `/src/utils/index.ts` (`calculateFinalPrice`) so all three portals (Admin, Garage, Delegate) stay synchronized.
3. **Verification:**
   - Run `npm run lint` and `npm run build` to verify 0 TypeScript compiler errors and clean asset bundles.

---
*Last Updated: September 2026 — El-Garage Architecture Reference.*
