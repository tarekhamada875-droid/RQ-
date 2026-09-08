# El-Garage System: Security Audit & Technical Action Plan
**Author:** Senior Production Software Engineer  
**Date:** September 6, 2026  
**Status:** Under Review (Awaiting Tarek's First Confirmation / التأكيد الأول)  
**Production Readiness Verdict:** **28/100 (NOT PRODUCTION-READY)**

---

## Executive Summary

El-Garage System is an exceptionally well-conceived product with high real-world utility, a polished Arabic-first Egyptian license plate UI, precise digit normalization, and realistic financial rules. 

However, **the trust and security architecture is severely compromised**. Because the application was developed with client-side-only Firestore writes, it delegates absolute authority to the browser. Under this model, **any visitor can easily grant themselves Admin rights, read anyone's authentication PIN, modify their own account balances, and bypass subscription checks**. 

Furthermore, because the project must remain on the **Firebase Spark (Free) Plan**, Cloud Functions (which require a credit card and Blaze pricing) are not an option. 

### The Spark-Safe Solution (Architecture Pivot)
We do **not** need the Firebase Blaze Plan, nor do we need client-side insecurity. Since we run a Node.js/Express server (`server.ts`) inside this container (or on any free Express host like Render), **we must pivot to a full-stack, server-authoritative model**.
1. **Zero Client-Side Write Authority on Sessions and Balance**: The Express server will act as the single source of truth using a secure `Firebase Service Account` (which we can run for free).
2. **Server-Side Authentication & Mutation**: Actions like PIN validation, session creation, balance recharges, and subscription extensions will be moved entirely to Express API routes (`/api/auth/*` and `/api/transactions/*`).
3. **Strict Firestore Rules**: Firestore rules will be locked down so that clients can only write to non-sensitive collections (e.g. log entries and active parking inputs with limited bounds), while critical fields (`balance`, `subscriptionExpiry`, role status) can only be modified by the Server Admin SDK.

---

## Comprehensive Security Vulnerability Analysis (The Findings)

### 🚨 Critical Vulnerabilities (Severity: Critical)

#### **FIX-01: Self-Issued Admin Authority**
* **Vulnerability:** Under current Firestore rules, any signed-in user (including anonymous clients) can write to `admin_sessions/{uid}`. Because the rules define `isAdmin()` as `exists(/databases/$(database)/documents/admin_sessions/$(request.auth.uid))`, any attacker who writes a document with their UID into this collection becomes an Admin globally.
* **Before Code (Insecure client-side session write):**
  ```ts
  // Client App writes directly to firestore
  await setDoc(doc(db, "admin_sessions", user.uid), { entityId: "admin", createdAt: serverTimestamp() });
  ```
* **After Code (Secure server-side proxy):**
  ```ts
  // Client makes request to Express server; server validates PIN and writes session via Admin SDK
  app.post("/api/auth/login", async (req, res) => {
    const { pin, role } = req.body;
    const isValid = await verifyPin(pin, role);
    if (!isValid) return res.status(401).json({ error: "Invalid PIN" });
    const sessionToken = await createSecureSession(req.user.uid, role);
    res.json({ sessionToken });
  });
  ```

#### **FIX-02: Universal Entity Impersonation**
* **Vulnerability:** Similar to FIX-01, a malicious user can write directly to `delegate_sessions/{uid}`, `garage_sessions/{uid}`, or `staff_sessions/{uid}`. They can assign any entity's ID (such as another delegate or garage owner's UUID) to the `entityId` field in the session, allowing them to read and write that entity's private records.
* **Impact:** High probability of data tampering, where an attacker accesses all garages under a delegate's portfolio.

#### **FIX-03: Plaintext & Exposed PINs**
* **Vulnerability:** Firebase rules allow clients to read documents in `garages`, `delegates`, and `supervisors`. Although we hardened `server.ts` to use cryptographic salts, many records still contain plaintext PINs or legacy un-salted hashes. Even with hashing, exposing the `pin` field to the client allows brute-force attacks on the local client machine, as PINs are typically short 4-digit numbers.
* **Impact:** 100% compromise of user PINs within seconds of network inspection.
* **Fix:** The browser must **never** be allowed to read the `pin` field or `pinLookupHash` field. These fields must be omitted from Firestore reads or completely isolated in a private sub-collection with rules denying all client reads.

#### **FIX-04: Arbitrary Client-Controlled Balances & Expiries**
* **Vulnerability:** When a garage is created or recharged, the browser writes to the `garages/{garageId}` document directly, setting `balance` and `balanceExpiry`. A garage operator can write a payload setting their balance to `999999` and extending their expiry to `2035`.
* **Impact:** Total loss of financial control and subscription enforcement.

#### **FIX-05: Missing PIN validation in `claim-admin-session`**
* **Vulnerability:** The API endpoint `POST /api/auth/claim-admin-session` in `server.ts` allows any client to obtain a valid admin session without providing or verifying a PIN.
* **Impact:** Exploitation requires zero effort.

#### **FIX-06: Firebase Cloud Functions Spark Limitation**
* **Vulnerability:** The system attempts to deploy Firebase Cloud Functions to handle security-critical tasks. On the Spark Plan, these deployments fail, leaving the client app to fall back to insecure client-side updates.
* **Fix:** Completely bypass Cloud Functions. Port all backend logic into the Express app (`server.ts`), which runs perfectly for free.

#### **FIX-07: Insecure Recharge Request Creation and Approval**
* **Vulnerability:** Any client can write a `topup_request` with state `"approved"` or have any delegate account approve a top-up request directly, modifying balances without real bank transactions.

---

## Technical Action Plan (Phased Execution)

### Phase 1: PIN-Only Unified Authentication & Dynamic Session Creation
We will unify all roles under a single PIN entry field with a highly sophisticated license plate style design.
- The user enters a PIN.
- The client makes a `POST /api/auth/verify-pin` call to our Express server.
- The server checks the PIN against database schemas (`admin_settings`, `supervisors`, `delegates`, `garages`) using `scrypt` matching with unique salts and `pinLookupHash`.
- If a match is found, the server writes a secure session token to the corresponding `_sessions/{uid}` document via the Firebase Admin SDK and returns the authorized role to the client.

### Phase 2: Server-Authoritative Balance and Subscription Engine
- **No Client Writes to Balances:** All balance recharges, commission calculations, and subscriptions must go through `POST /api/transactions/recharge`.
- **Transactions Safety:** Use atomic Firestore transactions (`runTransaction`) in `server.ts` to ensure concurrency protection, preventing duplicate recharges or race conditions.

### Phase 3: Lockdown Firestore Security Rules
- Modify `firestore.rules` to strictly deny client-side writes to sensitive paths:
  - Match `/admin_settings/{allPaths=**}`: `allow write: if false;`
  - Match `/admin_sessions/{allPaths=**}`: `allow write: if false;`
  - Match `/delegates/{allPaths=**}`: `allow write: if false;`
  - Match `/garages/{garageId}`: `allow write: if false;` (except for limited operator-level parameters like changing a rate or toggle if authorized).
- Only the Express Server (authenticated via Service Account SDK) will have write access to these documents.

---

## First Confirmation Requested (التأكيد الأول)

Tarek, please review this security audit and technical plan:
1. Do you agree with pivoting El-Garage to a **Server-Authoritative Express + Spark-Safe Model** so that we fix all critical security issues without needing a credit card?
2. Do you want me to proceed with implementing **Plan 1 (Unified PIN-Only Authentication)** and these security fixes?

Once you give me your **first confirmation (التأكيد الأول)**, I will present the concrete code draft and implementation file modifications for your **second confirmation (التأكيد الثاني / الضوء الأخضر)**. Communicating in English as requested.
