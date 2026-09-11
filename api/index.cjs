var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// api/index.ts
var index_exports = {};
__export(index_exports, {
  default: () => index_default
});
module.exports = __toCommonJS(index_exports);

// server/app.ts
var import_express = __toESM(require("express"), 1);
var import_cors = __toESM(require("cors"), 1);

// server/firebaseAdmin.ts
var import_app = require("firebase-admin/app");
var import_firestore = require("firebase-admin/firestore");
var import_auth = require("firebase-admin/auth");
var import_fs = __toESM(require("fs"), 1);
var import_path = __toESM(require("path"), 1);
function loadFirebaseConfig() {
  const fallbackConfig = {
    projectId: "gen-lang-client-0091669619",
    appId: "1:841039846471:web:2499d21dd43c7af2652562",
    apiKey: "AIzaSyAlX0k1nFD1E53_Y8EVJCyEByD1pz92XdE",
    authDomain: "gen-lang-client-0091669619.firebaseapp.com",
    firestoreDatabaseId: "ai-studio-b470b79a-6ebe-4e99-9d28-d7bc08d72759",
    storageBucket: "gen-lang-client-0091669619.firebasestorage.app",
    messagingSenderId: "841039846471"
  };
  try {
    const configPath = import_path.default.resolve(process.cwd(), "firebase-applet-config.json");
    if (import_fs.default.existsSync(configPath)) {
      return JSON.parse(import_fs.default.readFileSync(configPath, "utf-8"));
    }
  } catch (e) {
    console.warn("[Server Auth] Error reading firebase-applet-config.json from fs, using embedded fallback:", e);
  }
  return fallbackConfig;
}
var firebaseConfig = loadFirebaseConfig();
var adminDb = null;
var adminAuth = null;
try {
  const existingApps = (0, import_app.getApps)();
  let adminApp = existingApps.find((a) => a.name === "admin-app");
  if (!adminApp) {
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      let sa;
      try {
        const rawSA = process.env.FIREBASE_SERVICE_ACCOUNT.trim();
        sa = JSON.parse(rawSA);
      } catch (parseErr) {
        console.error("[Server Auth] Failed to JSON.parse FIREBASE_SERVICE_ACCOUNT:", parseErr);
      }
      if (sa && typeof sa === "object") {
        adminApp = (0, import_app.initializeApp)({
          credential: (0, import_app.cert)(sa),
          projectId: sa.project_id || firebaseConfig.projectId
        }, "admin-app");
        console.log("[Server Auth] Initialized Firebase Admin SDK with service account credentials for project:", sa.project_id || firebaseConfig.projectId);
      }
    }
    if (!adminApp) {
      try {
        adminApp = (0, import_app.initializeApp)({
          projectId: firebaseConfig.projectId
        }, "admin-app");
        console.log("[Server Auth] Initialized Firebase Admin SDK with default environment credentials");
      } catch (adcErr) {
        console.warn("[Server Auth] No FIREBASE_SERVICE_ACCOUNT or Application Default Credentials found:", adcErr);
      }
    }
  }
  if (adminApp) {
    adminDb = (0, import_firestore.getFirestore)(adminApp, firebaseConfig.firestoreDatabaseId);
    adminAuth = (0, import_auth.getAuth)(adminApp);
  }
} catch (e) {
  console.warn("[Server Auth] Could not initialize Firebase Admin SDK:", e);
}

// server/utils.ts
var import_crypto = __toESM(require("crypto"), 1);
function normalizeDigits(str) {
  if (!str) return "";
  return String(str).replace(/[٠۰]/g, "0").replace(/[١۱]/g, "1").replace(/[٢۲]/g, "2").replace(/[٣۳]/g, "3").replace(/[٤۴]/g, "4").replace(/[٥۵]/g, "5").replace(/[٦۶]/g, "6").replace(/[٧۷]/g, "7").replace(/[٨۸]/g, "8").replace(/[٩۹]/g, "9");
}
function cleanPin(raw) {
  return normalizeDigits(String(raw || "")).replace(/\D/g, "");
}
var LEGACY_PIN_SALT = "ark_garage_secure_pin_salt_2026";
var PIN_LOOKUP_SALT = "ark_garage_secure_pin_lookup_salt_v2";
function hashPinWithUniqueSalt(cleanPinStr, saltHex) {
  if (!cleanPinStr) return "";
  const salt = saltHex ? Buffer.from(saltHex, "hex") : import_crypto.default.randomBytes(16);
  const actualSaltHex = salt.toString("hex");
  const N = 16384;
  const r = 8;
  const p = 1;
  const derived = import_crypto.default.scryptSync(cleanPinStr, salt, 32, { N, r, p }).toString("hex");
  return `$scrypt$N=${N},r=${r},p=${p}$${actualSaltHex}$${derived}`;
}
function computeLookupHash(cleanPinStr) {
  if (!cleanPinStr) return "";
  return import_crypto.default.scryptSync(cleanPinStr, PIN_LOOKUP_SALT, 32).toString("hex");
}
function legacyHashPin(cleanPinStr) {
  if (!cleanPinStr) return "";
  return import_crypto.default.scryptSync(cleanPinStr, LEGACY_PIN_SALT, 32).toString("hex");
}
function isHashedPin(pin) {
  if (!pin) return false;
  return typeof pin === "string" && pin.length === 64 && /^[0-9a-f]{64}$/i.test(pin);
}
function safeCompare(a, b) {
  if (!a || !b) return false;
  const bufA = Buffer.from(a.toLowerCase());
  const bufB = Buffer.from(b.toLowerCase());
  if (bufA.length !== bufB.length) return false;
  return import_crypto.default.timingSafeEqual(bufA, bufB);
}
function verifyScryptHash(inputCleanPin, scryptStr) {
  try {
    const parts = scryptStr.split("$");
    if (parts.length >= 5 && parts[1] === "scrypt") {
      const paramStr = parts[2];
      const saltHex = parts[3];
      const expectedHash = parts[4];
      const params = {};
      paramStr.split(",").forEach((p2) => {
        const [k, v] = p2.split("=");
        if (k && v) params[k] = parseInt(v, 10);
      });
      const N = params.N || 16384;
      const r = params.r || 8;
      const p = params.p || 1;
      const salt = Buffer.from(saltHex, "hex");
      const derived = import_crypto.default.scryptSync(inputCleanPin, salt, 32, { N, r, p }).toString("hex");
      return safeCompare(derived, expectedHash);
    }
  } catch (e) {
    console.error("[Server Auth] Error verifying scrypt hash:", e);
  }
  return false;
}
function verifySingleFieldValue(inputCleanPin, storedVal) {
  if (!inputCleanPin || storedVal === void 0 || storedVal === null) return { matches: false, isLegacy: false };
  const strVal = String(storedVal).trim();
  if (!strVal) return { matches: false, isLegacy: false };
  if (strVal.startsWith("$scrypt$")) {
    if (verifyScryptHash(inputCleanPin, strVal)) {
      return { matches: true, isLegacy: false };
    }
  }
  if (isHashedPin(strVal)) {
    const inputLegacyHash = legacyHashPin(inputCleanPin);
    if (safeCompare(inputLegacyHash, strVal)) {
      return { matches: true, isLegacy: true };
    }
  }
  const cleanStored = cleanPin(strVal);
  if (cleanStored && safeCompare(cleanStored, inputCleanPin)) {
    return { matches: true, isLegacy: true };
  }
  return { matches: false, isLegacy: false };
}
function verifyPinMatch(inputCleanPin, storedPin) {
  return verifySingleFieldValue(inputCleanPin, storedPin);
}
function verifyDocMatch(inputCleanPin, docData) {
  if (!docData) return { matches: false, isLegacy: false };
  const candidateFields = [docData.pin, docData.ownerPin, docData.adminPin, docData.pinLookupHash];
  for (const fieldVal of candidateFields) {
    const check = verifySingleFieldValue(inputCleanPin, fieldVal);
    if (check.matches) {
      return check;
    }
  }
  return { matches: false, isLegacy: false };
}
async function saveEntityPin(collName, docId, cleanInputPin) {
  if (!cleanInputPin || !docId) return;
  const newScrypt = hashPinWithUniqueSalt(cleanInputPin);
  const lookupHash = computeLookupHash(cleanInputPin);
  const privatePinPayload = {
    pin: newScrypt,
    pinLookupHash: lookupHash,
    entityType: collName,
    entityId: docId,
    updatedAt: /* @__PURE__ */ new Date()
  };
  try {
    if (!adminDb) {
      throw new Error("ADMIN_SDK_NOT_INITIALIZED");
    }
    const pinDocId = collName === "admin_settings" ? "auth_pin" : docId;
    await adminDb.doc(`private_pins/${pinDocId}`).set(privatePinPayload, { merge: true });
  } catch (e) {
    console.error(`[Server Auth] Error saving private pin for ${collName}/${docId}:`, e);
    throw e;
  }
}
async function migratePinToHash(collName, docId, cleanInputPin) {
  try {
    if (!adminDb) {
      throw new Error("ADMIN_SDK_NOT_INITIALIZED");
    }
    await saveEntityPin(collName, docId, cleanInputPin);
    const targetDocRef = collName === "admin_settings" ? adminDb.doc("admin_settings/auth_pin") : adminDb.collection(collName).doc(docId);
    const docSnap = await targetDocRef.get();
    if (docSnap.exists) {
      const data = docSnap.data() || {};
      const updates = {};
      if ("pin" in data) updates.pin = null;
      if ("ownerPin" in data) updates.ownerPin = null;
      if ("adminPin" in data) updates.adminPin = null;
      if ("pinLookupHash" in data) updates.pinLookupHash = null;
      if (Object.keys(updates).length > 0) {
        await targetDocRef.set(updates, { merge: true });
      }
    }
    console.log(`[Server Auth] Auto-migrated credentials to private_pins for ${collName}/${docId}`);
  } catch (e) {
    console.error(`[Server Auth] Error auto-migrating PIN for ${collName}/${docId}:`, e);
  }
}
var RATE_LIMIT_WINDOW_MS = 6e4;
var RATE_LIMIT_MAX_ATTEMPTS = 20;
var memoryFallback = /* @__PURE__ */ new Map();
function checkRateLimitInMemory(ip) {
  const now = Date.now();
  const entry = memoryFallback.get(ip);
  if (!entry || now > entry.resetAt) {
    memoryFallback.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  if (entry.count >= RATE_LIMIT_MAX_ATTEMPTS) return false;
  entry.count += 1;
  return true;
}
async function checkRateLimit(ip) {
  if (!adminDb) return checkRateLimitInMemory(ip);
  const docId = import_crypto.default.createHash("sha256").update(ip).digest("hex");
  const ref = adminDb.doc(`rate_limits/${docId}`);
  try {
    return await adminDb.runTransaction(async (t) => {
      const snap = await t.get(ref);
      const now = Date.now();
      const data = snap.exists ? snap.data() || {} : null;
      if (!data || now > data.resetAt) {
        t.set(ref, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS, expiresAt: new Date(now + RATE_LIMIT_WINDOW_MS) });
        return true;
      }
      if (data.count >= RATE_LIMIT_MAX_ATTEMPTS) {
        return false;
      }
      t.update(ref, { count: data.count + 1 });
      return true;
    });
  } catch (e) {
    console.error("[Server Auth] Rate limit transaction failed, failing closed to in-memory:", e);
    return checkRateLimitInMemory(ip);
  }
}
async function resetRateLimit(ip) {
  memoryFallback.delete(ip);
  if (!adminDb) return;
  const docId = import_crypto.default.createHash("sha256").update(ip).digest("hex");
  try {
    await adminDb.doc(`rate_limits/${docId}`).delete();
  } catch (e) {
    console.error("[Server Auth] Failed to reset Firestore rate limit doc:", e);
  }
}
async function getAdminPin() {
  try {
    if (!adminDb) {
      throw new Error("ADMIN_SDK_NOT_INITIALIZED");
    }
    const privSnap = await adminDb.doc("private_pins/auth_pin").get();
    if (privSnap.exists && privSnap.data()?.pin) {
      return String(privSnap.data().pin);
    }
    const snap = await adminDb.doc("admin_settings/auth_pin").get();
    return snap.exists ? String(snap.data()?.pin || "") : "";
  } catch (e) {
    console.error("[Server Auth] Error reading admin pin:", e);
    return "";
  }
}
async function queryAccountWherePin(collName, normPin) {
  const lookupHash = computeLookupHash(normPin);
  const legacyHash = legacyHashPin(normPin);
  const matches = [];
  const seenIds = /* @__PURE__ */ new Set();
  try {
    if (!adminDb) {
      throw new Error("ADMIN_SDK_NOT_INITIALIZED");
    }
    try {
      const privSnap = await adminDb.collection("private_pins").where("entityType", "==", collName).where("pinLookupHash", "==", lookupHash).limit(5).get();
      for (const privDoc of privSnap.docs) {
        const privData = privDoc.data() || {};
        const entityId = privData.entityId || privDoc.id;
        const check = verifyDocMatch(normPin, privData);
        if (check.matches && !seenIds.has(entityId)) {
          seenIds.add(entityId);
          const entitySnap = await adminDb.collection(collName).doc(entityId).get();
          if (entitySnap.exists) {
            matches.push({ id: entityId, data: entitySnap.data(), isLegacyMatch: check.isLegacy });
          }
        }
      }
    } catch (privErr) {
    }
    if (matches.length > 0) {
      return matches;
    }
    const candidateQueries = [
      { field: "pinLookupHash", value: lookupHash },
      { field: "pin", value: legacyHash },
      { field: "pin", value: normPin }
    ];
    if (collName === "garages") {
      candidateQueries.push(
        { field: "ownerPin", value: normPin },
        { field: "adminPin", value: normPin }
      );
    }
    for (const { field, value } of candidateQueries) {
      if (!value) continue;
      try {
        const snap = await adminDb.collection(collName).where(field, "==", value).limit(5).get();
        for (const d of snap.docs) {
          if (!seenIds.has(d.id)) {
            const check = verifyDocMatch(normPin, d.data());
            if (check.matches) {
              seenIds.add(d.id);
              matches.push({ id: d.id, data: d.data(), isLegacyMatch: check.isLegacy });
            }
          }
        }
      } catch (e) {
      }
    }
    if (matches.length === 0) {
      try {
        const fallbackSnap = await adminDb.collection(collName).limit(50).get();
        for (const d of fallbackSnap.docs) {
          if (!seenIds.has(d.id)) {
            const check = verifyDocMatch(normPin, d.data());
            if (check.matches) {
              seenIds.add(d.id);
              matches.push({ id: d.id, data: d.data(), isLegacyMatch: check.isLegacy });
            }
          }
        }
      } catch (e) {
      }
    }
  } catch (e) {
    console.error(`[Server Auth] Error querying collection ${collName} where pin:`, e);
  }
  return matches;
}
async function queryDelegatesWherePhone(normPhone) {
  try {
    if (!adminDb) {
      throw new Error("ADMIN_SDK_NOT_INITIALIZED");
    }
    const snap = await adminDb.collection("delegates").where("phone", "==", normPhone).limit(5).get();
    return snap.docs.map((d) => ({ id: d.id, data: d.data() }));
  } catch (e) {
    console.error("[Server Auth] Error querying delegates where phone:", e);
    return [];
  }
}
async function checkPinAvailabilityAcrossAll(normPin, excludeId) {
  if (!normPin) return { taken: false };
  const adminPinStored = await getAdminPin();
  if (adminPinStored && verifyPinMatch(normPin, adminPinStored).matches) {
    if (!excludeId || excludeId !== "auth_pin") {
      return {
        taken: true,
        role: "\u0645\u0633\u0624\u0648\u0644 \u0627\u0644\u0646\u0638\u0627\u0645 (\u0627\u0644\u0622\u062F\u0645\u0646 \u0627\u0644\u0631\u0626\u064A\u0633\u064A)",
        roleKey: "admin",
        name: "\u0627\u0644\u0622\u062F\u0645\u0646",
        accountId: "auth_pin"
      };
    }
  }
  const collectionsToCheck = [
    { name: "supervisors", roleKey: "supervisor", label: "\u0645\u0634\u0631\u0641 \u0646\u0638\u0627\u0645" },
    { name: "delegates", roleKey: "delegate", label: "\u0645\u0646\u062F\u0648\u0628 \u0634\u062D\u0646" },
    { name: "staff", roleKey: "staff", label: "\u0645\u0648\u0638\u0641 \u062C\u0631\u0627\u062C" },
    { name: "garages", roleKey: "garage", label: "\u0635\u0627\u062D\u0628 \u062C\u0631\u0627\u062C" }
  ];
  for (const coll of collectionsToCheck) {
    try {
      const docs = await queryAccountWherePin(coll.name, normPin);
      for (const dDoc of docs) {
        if (excludeId && dDoc.id === excludeId) continue;
        const docData = dDoc.data || {};
        return {
          taken: true,
          role: coll.label,
          roleKey: coll.roleKey,
          name: docData.name || docData.ownerName || docData.garageName || "\u0645\u0633\u062A\u062E\u062F\u0645 \u0622\u062E\u0631",
          accountId: dDoc.id,
          account: docData
        };
      }
    } catch (e) {
      console.error(`[Server Auth] Error checking pin in collection ${coll.name}:`, e);
    }
  }
  return { taken: false };
}
function calculateVehicleCost(vehicleData, garageData, now = Date.now()) {
  if (vehicleData.isSubscriber) return 0;
  const entryTime = vehicleData.entryTime?.toDate ? vehicleData.entryTime.toDate() : new Date(vehicleData.entryTime);
  if (!entryTime || isNaN(entryTime.getTime())) return 0;
  const diffMs = now - entryTime.getTime();
  if (diffMs < 5 * 60 * 1e3) return 0;
  const type = vehicleData.type || "hourly";
  if (type === "overnight") {
    const overnightRate = Number(garageData.overnightRate || 0);
    const days = Math.max(1, Math.ceil(diffMs / (1e3 * 60 * 60 * 24)));
    return Number((days * overnightRate).toFixed(2));
  }
  const hourlyRate = Number(garageData.hourlyRate || 0);
  const hours = Math.max(1, Math.ceil(diffMs / (1e3 * 60 * 60)));
  return Number((hours * hourlyRate).toFixed(2));
}

// server/middleware.ts
var import_crypto2 = __toESM(require("crypto"), 1);

// server/validation.ts
var ValidationError = class extends Error {
  constructor(message, code = "INVALID_INPUT", statusCode = 400) {
    super(message);
    this.name = "ValidationError";
    this.code = code;
    this.statusCode = statusCode;
  }
};
function validateId(val, fieldName = "ID", required = true) {
  if (val === void 0 || val === null || val === "") {
    if (required) {
      throw new ValidationError(`${fieldName} is required`, `${fieldName.toUpperCase()}_REQUIRED`, 400);
    }
    return "";
  }
  if (typeof val !== "string") {
    throw new ValidationError(`Invalid ${fieldName}: must be a string`, `INVALID_${fieldName.toUpperCase()}`, 400);
  }
  const trimmed = val.trim();
  if (required && trimmed.length === 0) {
    throw new ValidationError(`${fieldName} cannot be empty`, `EMPTY_${fieldName.toUpperCase()}`, 400);
  }
  if (trimmed.length > 128) {
    throw new ValidationError(`${fieldName} exceeds maximum length of 128 characters`, `${fieldName.toUpperCase()}_TOO_LONG`, 400);
  }
  const safeIdRegex = /^[a-zA-Z0-9_\-\.\:\@\s]+$/;
  if (!safeIdRegex.test(trimmed)) {
    throw new ValidationError(`Invalid characters in ${fieldName}`, `INVALID_CHARS_${fieldName.toUpperCase()}`, 400);
  }
  return trimmed;
}
function validateNumber(val, fieldName = "Amount", options = {}) {
  const { min = 0, max = 1e7, integerOnly = false, required = true } = options;
  if (val === void 0 || val === null || val === "") {
    if (required) {
      throw new ValidationError(`${fieldName} is required`, `${fieldName.toUpperCase()}_REQUIRED`, 400);
    }
    return 0;
  }
  if (typeof val !== "number" && typeof val !== "string") {
    throw new ValidationError(`Invalid ${fieldName}: must be a number`, `INVALID_${fieldName.toUpperCase()}`, 400);
  }
  const parsed = Number(val);
  if (isNaN(parsed) || !isFinite(parsed)) {
    throw new ValidationError(`Invalid ${fieldName}: must be a finite number`, `INVALID_${fieldName.toUpperCase()}`, 400);
  }
  if (integerOnly && !Number.isInteger(parsed)) {
    throw new ValidationError(`${fieldName} must be an integer`, `INTEGER_REQUIRED_${fieldName.toUpperCase()}`, 400);
  }
  if (parsed < min) {
    throw new ValidationError(`${fieldName} cannot be less than ${min}`, `${fieldName.toUpperCase()}_TOO_LOW`, 400);
  }
  if (parsed > max) {
    throw new ValidationError(`${fieldName} cannot exceed ${max}`, `${fieldName.toUpperCase()}_TOO_HIGH`, 400);
  }
  return Math.round(parsed * 100) / 100;
}
function validateString(val, fieldName = "String", options = {}) {
  const { min = 0, max = 256, required = false, allowEmptyString = true, pattern } = options;
  if (val === void 0 || val === null) {
    if (required) {
      throw new ValidationError(`${fieldName} is required`, `${fieldName.toUpperCase()}_REQUIRED`, 400);
    }
    return "";
  }
  if (typeof val !== "string") {
    throw new ValidationError(`Invalid ${fieldName}: must be a string`, `INVALID_${fieldName.toUpperCase()}`, 400);
  }
  const trimmed = val.trim();
  if (required && trimmed.length === 0 && !allowEmptyString) {
    throw new ValidationError(`${fieldName} cannot be empty`, `EMPTY_${fieldName.toUpperCase()}`, 400);
  }
  if (trimmed.length < min) {
    throw new ValidationError(`${fieldName} must be at least ${min} characters`, `${fieldName.toUpperCase()}_TOO_SHORT`, 400);
  }
  if (trimmed.length > max) {
    throw new ValidationError(`${fieldName} exceeds maximum length of ${max} characters`, `${fieldName.toUpperCase()}_TOO_LONG`, 400);
  }
  if (pattern && !pattern.test(trimmed)) {
    throw new ValidationError(`Invalid format for ${fieldName}`, `INVALID_FORMAT_${fieldName.toUpperCase()}`, 400);
  }
  return trimmed;
}
function sanitizePayload(body, allowedKeys, rejectUnknown = true) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ValidationError("Request body must be a JSON object", "INVALID_BODY", 400);
  }
  const bodyKeys = Object.keys(body);
  if (rejectUnknown) {
    const unknownKeys = bodyKeys.filter((k) => !allowedKeys.includes(k));
    if (unknownKeys.length > 0) {
      throw new ValidationError(
        `Unexpected field(s) in request body: ${unknownKeys.join(", ")}`,
        "UNKNOWN_FIELDS_REJECTED",
        400
      );
    }
  }
  const sanitized = {};
  for (const key of allowedKeys) {
    if (body[key] !== void 0) {
      sanitized[key] = body[key];
    }
  }
  return sanitized;
}
function validateIdempotencyKey(key) {
  if (!key) return null;
  if (typeof key !== "string") {
    throw new ValidationError("Idempotency key must be a string", "INVALID_IDEMPOTENCY_KEY", 400);
  }
  const trimmed = key.trim();
  if (trimmed.length < 8 || trimmed.length > 128) {
    throw new ValidationError("Idempotency key must be between 8 and 128 characters", "INVALID_IDEMPOTENCY_KEY_LENGTH", 400);
  }
  if (!/^[a-zA-Z0-9_\-]+$/.test(trimmed)) {
    throw new ValidationError("Idempotency key contains invalid characters", "INVALID_IDEMPOTENCY_KEY_CHARS", 400);
  }
  return trimmed;
}

// server/middleware.ts
function sendApiError(res, statusCode, code, message, correlationId, details) {
  const payload = {
    success: false,
    error: message,
    code,
    statusCode,
    timestamp: (/* @__PURE__ */ new Date()).toISOString()
  };
  if (correlationId) {
    payload.correlationId = correlationId;
  }
  if (details) {
    payload.details = details;
  }
  return res.status(statusCode).json(payload);
}
var correlationMiddleware = (req, res, next) => {
  const headerId = req.headers["x-correlation-id"];
  const correlationId = typeof headerId === "string" && headerId.trim() ? headerId.trim() : import_crypto2.default.randomUUID();
  req.correlationId = correlationId;
  res.setHeader("X-Correlation-ID", correlationId);
  next();
};
var requestTimeoutMiddleware = (timeoutMs = 15e3) => {
  return (req, res, next) => {
    res.setTimeout(timeoutMs, () => {
      if (!res.headersSent) {
        const correlationId = req.correlationId;
        sendApiError(res, 504, "REQUEST_TIMEOUT", "REQUEST_TIMEOUT: Operation timed out on server", correlationId);
      }
    });
    next();
  };
};
var rateLimitMap = /* @__PURE__ */ new Map();
var financialRateLimiter = (maxRequests = 30, windowMs = 6e4) => {
  return async (req, res, next) => {
    const key = req.user?.uid || req.ip || req.headers["x-forwarded-for"]?.toString() || "unknown";
    const now = Date.now();
    if (!adminDb) {
      const entry = rateLimitMap.get(key);
      if (!entry || now > entry.resetAt) {
        rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
        return next();
      }
      if (entry.count >= maxRequests) {
        return sendApiError(
          res,
          429,
          "RATE_LIMIT_EXCEEDED",
          "TOO_MANY_REQUESTS: Rate limit exceeded. Please try again in 1 minute.",
          req.correlationId
        );
      }
      entry.count += 1;
      return next();
    }
    const docId = import_crypto2.default.createHash("sha256").update(`fin:${key}`).digest("hex");
    const ref = adminDb.doc(`rate_limits/${docId}`);
    try {
      const allowed = await adminDb.runTransaction(async (t) => {
        const snap = await t.get(ref);
        const data = snap.exists ? snap.data() || {} : null;
        if (!data || now > data.resetAt) {
          t.set(ref, { count: 1, resetAt: now + windowMs, expiresAt: new Date(now + windowMs) });
          return true;
        }
        if (data.count >= maxRequests) {
          return false;
        }
        t.update(ref, { count: data.count + 1 });
        return true;
      });
      if (!allowed) {
        return sendApiError(
          res,
          429,
          "RATE_LIMIT_EXCEEDED",
          "TOO_MANY_REQUESTS: Rate limit exceeded. Please try again in 1 minute.",
          req.correlationId
        );
      }
      next();
    } catch (e) {
      console.warn("[Financial Rate Limiter] Database transaction fallback to memory:", e);
      const entry = rateLimitMap.get(key);
      if (!entry || now > entry.resetAt) {
        rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
        return next();
      }
      if (entry.count >= maxRequests) {
        return sendApiError(
          res,
          429,
          "RATE_LIMIT_EXCEEDED",
          "TOO_MANY_REQUESTS: Rate limit exceeded. Please try again in 1 minute.",
          req.correlationId
        );
      }
      entry.count += 1;
      next();
    }
  };
};
async function requireFirebaseUser(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice("Bearer ".length).trim() : "";
  if (!token) {
    return sendApiError(
      res,
      401,
      "UNAUTHORIZED",
      "UNAUTHORIZED: Missing Firebase ID Token",
      req.correlationId
    );
  }
  if (!adminAuth) {
    return sendApiError(
      res,
      503,
      "SERVICE_UNAVAILABLE",
      "ADMIN_SDK_NOT_INITIALIZED",
      req.correlationId
    );
  }
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    req.user = { uid: decoded.uid, role: "anonymous" };
    next();
  } catch (err) {
    return sendApiError(
      res,
      401,
      "UNAUTHORIZED",
      "UNAUTHORIZED: Invalid token",
      req.correlationId
    );
  }
}
var requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    let token = "";
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.split("Bearer ")[1]?.trim();
    }
    if (!token) {
      return sendApiError(
        res,
        401,
        "UNAUTHORIZED",
        "UNAUTHORIZED: Missing Firebase ID Token",
        req.correlationId
      );
    }
    if (!adminAuth || !adminDb) {
      return sendApiError(
        res,
        500,
        "INTERNAL_ERROR",
        "ADMIN_SDK_NOT_INITIALIZED",
        req.correlationId
      );
    }
    const decoded = await adminAuth.verifyIdToken(token);
    const uid = decoded.uid;
    let foundRole = "";
    let assignedGarageId = "";
    let foundEntityId = "";
    let foundSessionId = "";
    let foundDisplayName = "";
    const secCollMap = [
      { role: "admin", coll: "admin_sessions" },
      { role: "supervisor", coll: "supervisor_sessions" },
      { role: "delegate", coll: "delegate_sessions" },
      { role: "garage", coll: "garage_sessions" },
      { role: "staff", coll: "staff_sessions" }
    ];
    const SESSION_TIMEOUT_MS = 15 * 60 * 1e3;
    for (const { role, coll } of secCollMap) {
      const secSnap = await adminDb.doc(`${coll}/${uid}`).get();
      if (secSnap.exists) {
        const secData = secSnap.data() || {};
        if (secData.isActive) {
          const rawLastActive = secData.lastActive;
          const lastActive = rawLastActive ? new Date(rawLastActive.toDate ? rawLastActive.toDate() : rawLastActive).getTime() : 0;
          if (lastActive > 0 && Date.now() - lastActive > SESSION_TIMEOUT_MS) {
            return sendApiError(
              res,
              401,
              "SESSION_EXPIRED",
              "SESSION_EXPIRED: Inactivity timeout",
              req.correlationId
            );
          }
          foundRole = role;
          foundEntityId = secData.entityId || "";
          foundSessionId = secData.sessionId || "";
          foundDisplayName = secData.displayName || "";
          if (role === "garage") {
            assignedGarageId = secData.garageId || secData.entityId || "";
          } else if (role === "staff") {
            assignedGarageId = secData.garageId || "";
            if (!assignedGarageId && secData.entityId) {
              const staffSnap = await adminDb.doc(`staff/${secData.entityId}`).get();
              if (staffSnap.exists) {
                const staffDocData = staffSnap.data() || {};
                assignedGarageId = staffDocData.garageId || "";
                if (!foundDisplayName && staffDocData.name) {
                  foundDisplayName = staffDocData.name;
                }
              }
            }
          }
          break;
        }
      }
    }
    if (!foundRole) {
      return sendApiError(
        res,
        401,
        "SESSION_REVOKED",
        "SESSION_REVOKED: No active session found",
        req.correlationId
      );
    }
    req.user = {
      uid,
      role: foundRole,
      garageId: assignedGarageId,
      entityId: foundEntityId,
      sessionId: foundSessionId,
      displayName: foundDisplayName
    };
    next();
  } catch (e) {
    console.warn("[Server Auth] Middleware validation failed:", e);
    return sendApiError(
      res,
      401,
      "UNAUTHORIZED",
      "UNAUTHORIZED: Invalid token or session",
      req.correlationId
    );
  }
};

// server/idempotency.ts
var import_crypto3 = __toESM(require("crypto"), 1);
var IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1e3;
function scopedKey(idempotencyKey, endpoint, actorUid) {
  const raw = `${endpoint}:${actorUid || "system"}:${idempotencyKey}`;
  return import_crypto3.default.createHash("sha256").update(raw).digest("hex");
}
async function checkIdempotencyInTransaction(t, idempotencyKey, endpoint, actorUid) {
  if (!idempotencyKey || !adminDb) {
    return { isDuplicate: false };
  }
  const docId = scopedKey(idempotencyKey, endpoint, actorUid);
  const keyRef = adminDb.doc(`idempotency_records/${docId}`);
  const keySnap = await t.get(keyRef);
  if (keySnap.exists) {
    const data = keySnap.data() || {};
    return {
      isDuplicate: true,
      cachedResult: data.result
    };
  }
  return { isDuplicate: false };
}
function storeIdempotencyInTransaction(t, idempotencyKey, result, endpoint, actorUid) {
  if (!idempotencyKey || !adminDb) return;
  const docId = scopedKey(idempotencyKey, endpoint, actorUid);
  const keyRef = adminDb.doc(`idempotency_records/${docId}`);
  const now = Date.now();
  t.set(keyRef, {
    result,
    endpoint,
    actorUid: actorUid || "system",
    createdAt: /* @__PURE__ */ new Date(),
    expiresAt: new Date(now + IDEMPOTENCY_TTL_MS)
  });
}

// server/unlimitedFairUse.ts
var FAIR_USE_CONFIGS = {
  daily: {
    tierType: "daily",
    initialAllowance: 200,
    stepAmount: 200,
    maxAllowance: 400,
    threshold: 20
  },
  biweekly: {
    tierType: "biweekly",
    initialAllowance: 500,
    stepAmount: 500,
    maxAllowance: 2500,
    threshold: 50
  },
  monthly: {
    tierType: "monthly",
    initialAllowance: 1e3,
    stepAmount: 1e3,
    maxAllowance: 5e3,
    threshold: 100
  }
};
var resolveTierType = (durationDays = 30, packageName = "") => {
  const normPkg = (packageName || "").trim().toLowerCase();
  if (normPkg.includes("\u064A\u0648\u0645\u064A") || normPkg.includes("\u064A\u0648\u0645 \u0648\u0627\u062D\u062F") || normPkg.includes("daily") || durationDays <= 1) {
    return "daily";
  }
  if (normPkg.includes("15") || normPkg.includes("\u0646\u0635\u0641") || normPkg.includes("biweekly") || durationDays <= 15) {
    return "biweekly";
  }
  return "monthly";
};
var getFairUseConfig = (durationDays = 30, packageName = "") => {
  const tierType = resolveTierType(durationDays, packageName);
  return FAIR_USE_CONFIGS[tierType];
};
var initializeFairUse = (durationDays = 30, packageName = "") => {
  const config = getFairUseConfig(durationDays, packageName);
  return {
    isActive: true,
    tierType: config.tierType,
    cycleCarsCount: 0,
    currentAllowance: config.initialAllowance,
    maxAllowance: config.maxAllowance,
    stepAmount: config.stepAmount,
    threshold: config.threshold,
    extensionsCount: 0,
    isNearMaxLimit: false,
    isMaxLimitReached: false
  };
};
var evaluateFairUseCheckIn = (currentFairUse, durationDays = 30, packageName = "") => {
  const config = getFairUseConfig(durationDays, packageName);
  const fairUse = {
    isActive: true,
    tierType: currentFairUse?.tierType || config.tierType,
    cycleCarsCount: Math.max(0, Number(currentFairUse?.cycleCarsCount || 0)),
    currentAllowance: Math.max(config.initialAllowance, Number(currentFairUse?.currentAllowance || config.initialAllowance)),
    maxAllowance: Math.max(config.maxAllowance, Number(currentFairUse?.maxAllowance || config.maxAllowance)),
    stepAmount: Number(currentFairUse?.stepAmount || config.stepAmount),
    threshold: Number(currentFairUse?.threshold || config.threshold),
    extensionsCount: Math.max(0, Number(currentFairUse?.extensionsCount || 0)),
    isNearMaxLimit: Boolean(currentFairUse?.isNearMaxLimit),
    isMaxLimitReached: Boolean(currentFairUse?.isMaxLimitReached)
  };
  const nextCount = fairUse.cycleCarsCount + 1;
  if (nextCount > fairUse.maxAllowance) {
    return {
      allowed: false,
      autoExtended: false,
      reason: "FAIR_USE_LIMIT_REACHED",
      updatedFairUse: {
        ...fairUse,
        isMaxLimitReached: true,
        isNearMaxLimit: true
      }
    };
  }
  let autoExtended = false;
  let newAllowance = fairUse.currentAllowance;
  let extensionsCount = fairUse.extensionsCount;
  const remainingInCurrentTier = newAllowance - nextCount;
  if (remainingInCurrentTier <= fairUse.threshold && newAllowance < fairUse.maxAllowance) {
    newAllowance = Math.min(fairUse.maxAllowance, newAllowance + fairUse.stepAmount);
    extensionsCount += 1;
    autoExtended = true;
  }
  const remainingToMax = fairUse.maxAllowance - nextCount;
  const isNearMaxLimit = remainingToMax <= fairUse.threshold;
  const isMaxLimitReached = nextCount >= fairUse.maxAllowance;
  return {
    allowed: true,
    autoExtended,
    updatedFairUse: {
      ...fairUse,
      cycleCarsCount: nextCount,
      currentAllowance: newAllowance,
      extensionsCount,
      isNearMaxLimit,
      isMaxLimitReached,
      lastExtendedAt: autoExtended ? /* @__PURE__ */ new Date() : fairUse.lastExtendedAt
    }
  };
};
var manualAdminExtendFairUse = (currentFairUse, extraCars = 0) => {
  const step = extraCars > 0 ? extraCars : currentFairUse.stepAmount;
  const newMax = currentFairUse.maxAllowance + step;
  const newCurrent = Math.max(currentFairUse.currentAllowance, currentFairUse.cycleCarsCount) + step;
  return {
    ...currentFairUse,
    maxAllowance: newMax,
    currentAllowance: newCurrent,
    extensionsCount: (currentFairUse.extensionsCount || 0) + 1,
    isMaxLimitReached: false,
    isNearMaxLimit: false,
    lastExtendedAt: /* @__PURE__ */ new Date()
  };
};

// server/app.ts
function mapDomainErrorToStatus(err) {
  if (err instanceof ValidationError) {
    return { statusCode: err.statusCode, code: err.code, message: err.message };
  }
  const errMsg = String(err?.message || err || "");
  if (errMsg.includes("GARAGE_NOT_FOUND") || errMsg.includes("VEHICLE_NOT_FOUND") || errMsg.includes("REQUEST_NOT_FOUND") || errMsg.includes("PACKAGE_NOT_FOUND")) {
    return { statusCode: 404, code: "NOT_FOUND", message: "The requested resource was not found." };
  }
  if (errMsg.includes("REQUEST_ALREADY_PROCESSED") || errMsg.includes("VEHICLE_ALREADY_INSIDE") || errMsg.includes("VEHICLE_ALREADY_OUTSIDE") || errMsg.includes("INSUFFICIENT_BALANCE") || errMsg.includes("CAPACITY_LIMIT_REACHED") || errMsg.includes("FAIR_USE_LIMIT_REACHED") || errMsg.includes("DAILY_DELETION_LIMIT_REACHED") || errMsg.includes("reached_daily_deletion_limit") || errMsg.includes("PIN_ALREADY_TAKEN") || errMsg.includes("MONTHLY_SUBSCRIBERS_PACKAGE_RESTRICTION") || errMsg.includes("NO_REFERRAL_REWARDS_AVAILABLE") || errMsg.includes("SUBSCRIPTION_EXPIRED")) {
    return { statusCode: 409, code: "CONFLICT", message: "The requested operation conflicts with the current state." };
  }
  if (errMsg.includes("FORBIDDEN") || errMsg.includes("UNAUTHORIZED_GARAGE_ACCESS") || errMsg.includes("GARAGE_SCOPE_MISMATCH") || errMsg.includes("ADMIN_ONLY") || errMsg.includes("GARAGE_CANNOT_RECHARGE_OTHERS") || errMsg.includes("ADMIN_OR_SUPERVISOR_ONLY")) {
    return { statusCode: 403, code: "FORBIDDEN", message: "You are not authorized to perform this operation." };
  }
  if (errMsg.includes("UNAUTHORIZED") || errMsg.includes("INVALID_ID_TOKEN") || errMsg.includes("SESSION_INACTIVE")) {
    return { statusCode: 401, code: "UNAUTHORIZED", message: "Authentication is required." };
  }
  return { statusCode: 500, code: "INTERNAL_ERROR", message: "An internal server error occurred." };
}
function isAllowedOrigin(origin) {
  if (!origin) return true;
  const normalizedOrigin = origin.replace(/\/+$/, "");
  if (process.env.ALLOWED_ORIGINS) {
    const customOrigins = process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim().replace(/\/+$/, "")).filter(Boolean);
    if (customOrigins.includes(normalizedOrigin)) return true;
  }
  if (process.env.APP_URL) {
    const canonicalAppUrl = process.env.APP_URL.replace(/\/+$/, "");
    if (normalizedOrigin === canonicalAppUrl) return true;
    const pairedAppUrl = canonicalAppUrl.includes("ais-dev-") ? canonicalAppUrl.replace("ais-dev-", "ais-pre-") : canonicalAppUrl.includes("ais-pre-") ? canonicalAppUrl.replace("ais-pre-", "ais-dev-") : "";
    if (pairedAppUrl && normalizedOrigin === pairedAppUrl) return true;
  }
  const exactOrigins = /* @__PURE__ */ new Set([
    "https://parqv2.vercel.app",
    "https://parq1.vercel.app",
    "https://aistudio.google.com",
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
    "http://127.0.0.1:5173"
  ]);
  if (exactOrigins.has(normalizedOrigin)) return true;
  try {
    const parsed = new URL(normalizedOrigin);
    const hostname = parsed.hostname.toLowerCase();
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}
function createApp() {
  const app2 = (0, import_express.default)();
  app2.set("trust proxy", 1);
  app2.use((0, import_cors.default)({
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: false,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Correlation-ID",
      "Idempotency-Key"
    ]
  }));
  app2.use(import_express.default.json());
  app2.use(correlationMiddleware);
  app2.use(requestTimeoutMiddleware(15e3));
  app2.get("/api/health", (_req, res) => {
    const isReady = !!(adminDb && adminAuth);
    if (!isReady) {
      return res.status(503).json({
        status: "error",
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        adminSdk: false
      });
    }
    res.json({
      status: "ok",
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      adminSdk: true
    });
  });
  app2.post("/api/auth/verify-pin", requireFirebaseUser, async (req, res) => {
    try {
      const clientIp = req.ip || req.headers["x-forwarded-for"]?.toString() || "unknown";
      if (!await checkRateLimit(clientIp)) {
        return sendApiError(
          res,
          429,
          "RATE_LIMIT_EXCEEDED",
          "\u062A\u0645 \u062A\u062C\u0627\u0648\u0632 \u0639\u062F\u062F \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0627\u062A \u0627\u0644\u0645\u0633\u0645\u0648\u062D \u0628\u0647\u0627\u060C \u064A\u0631\u062C\u0649 \u0627\u0644\u0627\u0646\u062A\u0638\u0627\u0631 \u0644\u0645\u062F\u0629 \u062F\u0642\u064A\u0642\u0629 \u0648\u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629 \u0645\u062C\u062F\u062F\u0627\u064B",
          req.correlationId
        );
      }
      const credentials = req.body || {};
      const rawInput = credentials.pin || credentials.input;
      const effectiveUid = req.user?.uid || "";
      if (!effectiveUid) {
        return sendApiError(
          res,
          401,
          "UNAUTHORIZED",
          "UNAUTHORIZED: Missing Firebase ID Token",
          req.correlationId
        );
      }
      if (credentials.uid && credentials.uid.trim() !== effectiveUid) {
        return sendApiError(
          res,
          401,
          "UNAUTHORIZED",
          "UID_MISMATCH",
          req.correlationId
        );
      }
      const sessionId = typeof credentials.sessionId === "string" ? credentials.sessionId.trim() : "";
      if (rawInput) {
        const normInputPin = cleanPin(rawInput);
        if (!normInputPin) {
          return res.json({ success: false, error: "\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u062F\u062E\u0648\u0644 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u0629" });
        }
        const matches = [];
        let adminPinStored = await getAdminPin();
        const adminCheck = verifyPinMatch(normInputPin, adminPinStored);
        if (adminCheck.matches) {
          matches.push({ role: "admin", id: "admin", isLegacyMatch: adminCheck.isLegacy });
          if (adminCheck.isLegacy) {
            migratePinToHash("admin_settings", "auth_pin", normInputPin);
          }
        }
        const collectionsToCheck = [
          { name: "garages", role: "garage" },
          { name: "staff", role: "staff" },
          { name: "delegates", role: "delegate" },
          { name: "supervisors", role: "supervisor" }
        ];
        for (const coll of collectionsToCheck) {
          try {
            const docs = await queryAccountWherePin(coll.name, normInputPin);
            for (const docSnap of docs) {
              const data = { ...docSnap.data };
              if (docSnap.isLegacyMatch) {
                migratePinToHash(coll.name, docSnap.id, normInputPin);
              }
              delete data.pin;
              delete data.ownerPin;
              delete data.adminPin;
              delete data.pinLookupHash;
              matches.push({
                role: coll.role,
                id: docSnap.id,
                account: { id: docSnap.id, ...data },
                isLegacyMatch: docSnap.isLegacyMatch
              });
            }
          } catch (e) {
            console.error(`[Server Auth] Query error in ${coll.name}:`, e);
          }
        }
        if (matches.length > 1) {
          return res.json({ success: false, error: "PIN_NOT_UNIQUE" });
        }
        if (matches.length === 1) {
          const match = matches[0];
          if (effectiveUid && sessionId && adminDb) {
            try {
              const entityCollMap = {
                admin: "admin_settings",
                supervisor: "supervisors",
                delegate: "delegates",
                garage: "garages",
                staff: "staff"
              };
              const secCollMap = {
                admin: "admin_sessions",
                supervisor: "supervisor_sessions",
                delegate: "delegate_sessions",
                garage: "garage_sessions",
                staff: "staff_sessions"
              };
              const entityColl = entityCollMap[match.role];
              const secColl = secCollMap[match.role];
              const entityDocId = match.role === "admin" ? "auth_pin" : match.id;
              if (entityColl && secColl && entityDocId) {
                const entityDocRef = adminDb.doc(`${entityColl}/${entityDocId}`);
                const secDocRef = adminDb.doc(`${secColl}/${effectiveUid}`);
                await adminDb.runTransaction(async (transaction) => {
                  const snap = await transaction.get(entityDocRef);
                  if (snap.exists) {
                    const data = snap.data() || {};
                    const activeSessionId = data.currentSessionId;
                    const rawLastActive = data.lastActive;
                    const lastActive = rawLastActive ? new Date(rawLastActive.toDate ? rawLastActive.toDate() : rawLastActive).getTime() : 0;
                    const SESSION_TIMEOUT_MS = 15 * 60 * 1e3;
                    const isAlive = activeSessionId && activeSessionId !== sessionId && lastActive > 0 && Date.now() - lastActive < SESSION_TIMEOUT_MS;
                    if (isAlive) {
                      throw new Error("SESSION_OCCUPIED");
                    }
                  }
                  transaction.set(entityDocRef, {
                    currentSessionId: sessionId,
                    lastActive: /* @__PURE__ */ new Date()
                  }, { merge: true });
                  const resolvedGarageId = match.role === "staff" ? snap.data()?.garageId || "" : match.role === "garage" ? entityDocId : "";
                  transaction.set(secDocRef, {
                    uid: effectiveUid,
                    role: match.role,
                    entityId: entityDocId,
                    garageId: resolvedGarageId,
                    displayName: match.account?.name || (match.role === "admin" ? "\u0645\u062F\u064A\u0631 \u0627\u0644\u0646\u0638\u0627\u0645" : match.role === "garage" ? match.account?.name || "\u0645\u062F\u064A\u0631 \u0627\u0644\u062C\u0631\u0627\u062C" : match.role),
                    sessionId,
                    isActive: true,
                    lastActive: /* @__PURE__ */ new Date(),
                    createdAt: /* @__PURE__ */ new Date()
                  }, { merge: true });
                });
                console.log(`[Server Auth] Successfully provisioned atomic ${match.role} session for UID: ${effectiveUid}`);
              }
            } catch (claimErr) {
              if (claimErr?.message === "SESSION_OCCUPIED") {
                return res.json({ success: false, error: "SESSION_OCCUPIED" });
              }
              console.error(`[Server Auth] Failed to provision ${match.role} session:`, claimErr);
              return res.status(500).json({ success: false, error: "\u062A\u0639\u0630\u0631 \u062A\u0647\u064A\u0626\u0629 \u0627\u0644\u062C\u0644\u0633\u0629 \u0627\u0644\u0622\u0645\u0646\u0629\u060C \u064A\u0631\u062C\u0649 \u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629" });
            }
          }
          await resetRateLimit(clientIp);
          return res.json({
            success: true,
            role: match.role,
            accountId: match.id,
            account: match.account,
            sessionClaimed: true
          });
        }
        return res.json({ success: false, error: "\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u062F\u062E\u0648\u0644 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u0629" });
      }
      const normPin = cleanPin(credentials.pin);
      const normPhone = cleanPin(credentials.phone);
      if (!normPin || !normPhone) {
        return res.json({ success: false, error: "\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u062F\u062E\u0648\u0644 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u0629" });
      }
      try {
        const delegateDocs = await queryDelegatesWherePhone(normPhone);
        for (const dDoc of delegateDocs) {
          const d = { ...dDoc.data };
          const { matches, isLegacy } = verifyDocMatch(normPin, d);
          if (matches) {
            if (isLegacy) {
              migratePinToHash("delegates", dDoc.id, normPin);
            }
            delete d.pin;
            delete d.ownerPin;
            delete d.adminPin;
            delete d.pinLookupHash;
            if (effectiveUid && sessionId && adminDb) {
              try {
                const entityDocRef = adminDb.doc(`delegates/${dDoc.id}`);
                const snap = await entityDocRef.get();
                if (snap.exists) {
                  const data = snap.data() || {};
                  const activeSessionId = data.currentSessionId;
                  const rawLastActive = data.lastActive;
                  const lastActive = rawLastActive ? new Date(rawLastActive.toDate ? rawLastActive.toDate() : rawLastActive).getTime() : 0;
                  const SESSION_TIMEOUT_MS = 15 * 60 * 1e3;
                  const isAlive = activeSessionId && activeSessionId !== sessionId && lastActive > 0 && Date.now() - lastActive < SESSION_TIMEOUT_MS;
                  if (isAlive) {
                    return res.json({ success: false, error: "SESSION_OCCUPIED" });
                  }
                }
                await entityDocRef.set({
                  currentSessionId: sessionId,
                  lastActive: /* @__PURE__ */ new Date()
                }, { merge: true });
                await adminDb.doc(`delegate_sessions/${effectiveUid}`).set({
                  uid: effectiveUid,
                  role: "delegate",
                  entityId: dDoc.id,
                  sessionId,
                  isActive: true,
                  lastActive: /* @__PURE__ */ new Date(),
                  createdAt: /* @__PURE__ */ new Date()
                }, { merge: true });
              } catch (sessErr) {
                console.error("[Server Auth] Error claiming delegate session during phone verification:", sessErr);
                return res.status(500).json({ success: false, error: "\u062A\u0639\u0630\u0631 \u062A\u0647\u064A\u0626\u0629 \u0627\u0644\u062C\u0644\u0633\u0629 \u0627\u0644\u0622\u0645\u0646\u0629\u060C \u064A\u0631\u062C\u0649 \u0625\u0639\u0627\u062F\u0629 \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629" });
              }
            }
            await resetRateLimit(clientIp);
            return res.json({
              success: true,
              role: "delegate",
              accountId: dDoc.id,
              account: { id: dDoc.id, ...d },
              sessionClaimed: true
            });
          }
        }
      } catch (e) {
        console.error("[Server Auth] Error searching delegates by phone:", e);
      }
      return res.json({ success: false, error: "\u0628\u064A\u0627\u0646\u0627\u062A \u0627\u0644\u062F\u062E\u0648\u0644 \u063A\u064A\u0631 \u0635\u062D\u064A\u062D\u0629" });
    } catch (error) {
      console.error("[Server Auth] Unexpected error in verify-pin:", error);
      return res.status(500).json({ success: false, error: "\u062D\u062F\u062B \u062E\u0637\u0623 \u0641\u064A \u0627\u0644\u0627\u062A\u0635\u0627\u0644 \u0628\u0627\u0644\u062E\u0627\u062F\u0645" });
    }
  });
  app2.post("/api/auth/check-pin-availability", requireFirebaseUser, financialRateLimiter(10, 6e4), async (req, res) => {
    try {
      const clientIp = req.ip || req.headers["x-forwarded-for"]?.toString() || "unknown";
      if (!await checkRateLimit(clientIp)) {
        return res.status(429).json({
          taken: false,
          error: "\u062A\u0645 \u062A\u062C\u0627\u0648\u0632 \u0639\u062F\u062F \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0627\u062A \u0627\u0644\u0645\u0633\u0645\u0648\u062D \u0628\u0647\u0627\u060C \u064A\u0631\u062C\u0649 \u0627\u0644\u0627\u0646\u062A\u0638\u0627\u0631 \u0644\u0645\u062F\u0629 \u062F\u0642\u064A\u0642\u0629 \u0648\u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629 \u0645\u062C\u062F\u062F\u0627\u064B"
        });
      }
      const { pin, excludeId } = req.body || {};
      const normPin = cleanPin(pin);
      if (!normPin) {
        return res.json({ taken: false });
      }
      const result = await checkPinAvailabilityAcrossAll(normPin, excludeId);
      return res.json({ taken: !!result.taken });
    } catch (error) {
      console.error("[Server Auth] Error in check-pin-availability:", error);
      return res.status(500).json({ taken: false });
    }
  });
  app2.post("/api/auth/verify-admin-pin", requireFirebaseUser, async (req, res) => {
    try {
      const clientIp = req.ip || req.headers["x-forwarded-for"]?.toString() || "unknown";
      if (!await checkRateLimit(clientIp)) {
        return res.status(429).json({
          valid: false,
          error: "\u062A\u0645 \u062A\u062C\u0627\u0648\u0632 \u0639\u062F\u062F \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0627\u062A \u0627\u0644\u0645\u0633\u0645\u0648\u062D \u0628\u0647\u0627\u060C \u064A\u0631\u062C\u0649 \u0627\u0644\u0627\u0646\u062A\u0638\u0627\u0631 \u0644\u0645\u062F\u0629 \u062F\u0642\u064A\u0642\u0629 \u0648\u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629 \u0645\u062C\u062F\u062F\u0627\u064B"
        });
      }
      const { pin } = req.body || {};
      const normInput = cleanPin(pin);
      if (!normInput) {
        return res.json({ valid: false });
      }
      let activeAdminPin = await getAdminPin();
      const { matches, isLegacy } = verifyPinMatch(normInput, activeAdminPin);
      if (matches && isLegacy) {
        migratePinToHash("admin_settings", "auth_pin", normInput);
      }
      if (matches) {
        await resetRateLimit(clientIp);
      }
      return res.json({ valid: matches });
    } catch (error) {
      return res.status(500).json({ valid: false });
    }
  });
  app2.post("/api/auth/claim-admin-session", requireFirebaseUser, async (req, res) => {
    try {
      const clientIp = req.ip || req.headers["x-forwarded-for"]?.toString() || "unknown";
      if (!await checkRateLimit(clientIp)) {
        return sendApiError(
          res,
          429,
          "RATE_LIMIT_EXCEEDED",
          "\u062A\u0645 \u062A\u062C\u0627\u0648\u0632 \u0639\u062F\u062F \u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0627\u062A \u0627\u0644\u0645\u0633\u0645\u0648\u062D \u0628\u0647\u0627\u060C \u064A\u0631\u062C\u0649 \u0627\u0644\u0627\u0646\u062A\u0638\u0627\u0631 \u0644\u0645\u062F\u0629 \u062F\u0642\u064A\u0642\u0629 \u0648\u0627\u0644\u0645\u062D\u0627\u0648\u0644\u0629 \u0645\u062C\u062F\u062F\u0627\u064B",
          req.correlationId
        );
      }
      const { uid, sessionId, pin } = req.body || {};
      if (!uid || !sessionId || typeof uid !== "string" || typeof sessionId !== "string") {
        return sendApiError(res, 400, "INVALID_INPUT", "\u0628\u064A\u0627\u0646\u0627\u062A \u063A\u064A\u0631 \u0635\u0627\u0644\u062D\u0629", req.correlationId);
      }
      if (!adminDb) {
        return sendApiError(res, 500, "SERVICE_UNAVAILABLE", "Admin DB \u063A\u064A\u0631 \u0645\u0647\u064A\u0623", req.correlationId);
      }
      const effectiveUid = req.user?.uid || "";
      if (!effectiveUid) {
        return sendApiError(res, 401, "UNAUTHORIZED", "UNAUTHORIZED: Missing Firebase ID Token", req.correlationId);
      }
      if (uid.trim() !== effectiveUid) {
        return sendApiError(res, 401, "UNAUTHORIZED", "UID_MISMATCH", req.correlationId);
      }
      let isAuthorized = false;
      const cleanInputPin = pin ? cleanPin(pin) : "";
      if (cleanInputPin) {
        const adminPinStored = await getAdminPin();
        if (verifyPinMatch(cleanInputPin, adminPinStored).matches) {
          isAuthorized = true;
          await resetRateLimit(clientIp);
        }
      }
      if (!isAuthorized) {
        const secSnap = await adminDb.doc(`admin_sessions/${effectiveUid}`).get();
        if (secSnap.exists) {
          const sData = secSnap.data() || {};
          if (sData.isActive && sData.sessionId === sessionId) {
            isAuthorized = true;
          }
        }
      }
      if (!isAuthorized) {
        return sendApiError(res, 403, "FORBIDDEN", "\u063A\u064A\u0631 \u0645\u0635\u0631\u062D: \u064A\u062A\u0637\u0644\u0628 \u0625\u062F\u062E\u0627\u0644 \u0627\u0644\u0631\u0642\u0645 \u0627\u0644\u0633\u0631\u064A", req.correlationId);
      }
      await adminDb.runTransaction(async (transaction) => {
        const entityDocRef = adminDb.doc("admin_settings/auth_pin");
        const secDocRef = adminDb.doc(`admin_sessions/${effectiveUid}`);
        const snap = await transaction.get(entityDocRef);
        if (snap.exists) {
          const data = snap.data() || {};
          const activeSessionId = data.currentSessionId;
          const rawLastActive = data.lastActive;
          const lastActive = rawLastActive ? new Date(rawLastActive.toDate ? rawLastActive.toDate() : rawLastActive).getTime() : 0;
          const SESSION_TIMEOUT_MS = 15 * 60 * 1e3;
          const isAlive = activeSessionId && activeSessionId !== sessionId && lastActive > 0 && Date.now() - lastActive < SESSION_TIMEOUT_MS;
          if (isAlive) {
            throw new Error("SESSION_OCCUPIED");
          }
        }
        transaction.set(entityDocRef, {
          currentSessionId: sessionId,
          lastActive: /* @__PURE__ */ new Date()
        }, { merge: true });
        transaction.set(secDocRef, {
          uid: effectiveUid,
          role: "admin",
          entityId: "auth_pin",
          sessionId,
          isActive: true,
          lastActive: /* @__PURE__ */ new Date(),
          createdAt: /* @__PURE__ */ new Date()
        }, { merge: true });
      });
      return res.json({ success: true, sessionClaimed: true });
    } catch (e) {
      if (e?.message === "SESSION_OCCUPIED") {
        return res.json({ success: false, error: "SESSION_OCCUPIED", code: "CONFLICT" });
      }
      console.error("[Server Auth] Error in claim-admin-session:", e);
      return sendApiError(res, 500, "INTERNAL_ERROR", "\u062D\u062F\u062B \u062E\u0637\u0623 \u0641\u064A \u0627\u0644\u062E\u0627\u062F\u0645", req.correlationId);
    }
  });
  app2.post("/api/auth/validate-or-refresh-session", requireFirebaseUser, async (req, res) => {
    try {
      const { uid, sessionId, role, entityId } = req.body || {};
      if (!uid || !sessionId || !role) {
        return res.status(400).json({ valid: false, error: "INVALID_PARAMS" });
      }
      if (!adminDb) {
        return res.status(503).json({ valid: false, error: "DATABASE_UNAVAILABLE" });
      }
      const effectiveUid = req.user?.uid || "";
      if (!effectiveUid) {
        return res.status(401).json({ valid: false, error: "UNAUTHORIZED: Missing Firebase ID Token" });
      }
      if (typeof uid === "string" && uid.trim() !== effectiveUid) {
        return res.status(401).json({ valid: false, error: "UID_MISMATCH" });
      }
      const secCollMap = {
        admin: "admin_sessions",
        supervisor: "supervisor_sessions",
        delegate: "delegate_sessions",
        garage: "garage_sessions",
        staff: "staff_sessions"
      };
      const entityCollMap = {
        admin: "admin_settings",
        supervisor: "supervisors",
        delegate: "delegates",
        garage: "garages",
        staff: "staff"
      };
      const secColl = secCollMap[role];
      const entityColl = entityCollMap[role];
      if (!secColl || !entityColl) {
        return res.json({ success: false, valid: false, code: "INVALID_INPUT", error: "INVALID_ROLE" });
      }
      const secSnap = await adminDb.doc(`${secColl}/${effectiveUid}`).get();
      if (!secSnap.exists) {
        return res.json({ success: false, valid: false, code: "NOT_FOUND", error: "SESSION_NOT_FOUND" });
      }
      const secData = secSnap.data() || {};
      if (!secData.isActive || secData.sessionId !== sessionId) {
        return res.json({ success: false, valid: false, code: "SESSION_INVALID", error: "SESSION_INVALID" });
      }
      const rawLastActive = secData.lastActive;
      const lastActive = rawLastActive ? new Date(rawLastActive.toDate ? rawLastActive.toDate() : rawLastActive).getTime() : 0;
      const SESSION_TIMEOUT_MS = 15 * 60 * 1e3;
      if (lastActive > 0 && Date.now() - lastActive > SESSION_TIMEOUT_MS) {
        await adminDb.doc(`${secColl}/${effectiveUid}`).update({ isActive: false }).catch(() => {
        });
        return res.json({ success: false, valid: false, code: "SESSION_EXPIRED", error: "SESSION_EXPIRED" });
      }
      const targetEntityId = role === "admin" ? "auth_pin" : entityId;
      if (targetEntityId) {
        const entitySnap = await adminDb.doc(`${entityColl}/${targetEntityId}`).get();
        if (entitySnap.exists) {
          const entityData = entitySnap.data() || {};
          if (entityData.currentSessionId && entityData.currentSessionId !== sessionId) {
            await adminDb.doc(`${secColl}/${effectiveUid}`).update({ isActive: false }).catch(() => {
            });
            return res.json({ success: false, valid: false, code: "SESSION_REVOKED", error: "SESSION_REVOKED" });
          }
        }
      }
      const now = /* @__PURE__ */ new Date();
      await adminDb.doc(`${secColl}/${effectiveUid}`).set({ lastActive: now }, { merge: true });
      if (targetEntityId) {
        await adminDb.doc(`${entityColl}/${targetEntityId}`).set({ lastActive: now }, { merge: true });
      }
      return res.json({ success: true, valid: true });
    } catch (error) {
      console.error("[Server Auth] Error validating session:", error);
      return res.status(500).json({ success: false, valid: false, code: "INTERNAL_ERROR", error: "SERVER_ERROR" });
    }
  });
  app2.post("/api/auth/release-session", requireFirebaseUser, async (req, res) => {
    try {
      const { uid, sessionId, role, entityId } = req.body || {};
      const verifiedUid = req.user?.uid || "";
      if (!uid || !sessionId || !role) {
        return sendApiError(res, 400, "INVALID_INPUT", "MISSING_PARAMETERS", req.correlationId);
      }
      if (!adminDb) {
        return sendApiError(res, 500, "SERVICE_UNAVAILABLE", "ADMIN_SDK_NOT_INITIALIZED", req.correlationId);
      }
      if (!verifiedUid) {
        return sendApiError(res, 401, "UNAUTHORIZED", "UNAUTHORIZED: Missing token", req.correlationId);
      }
      let isAuthorized = verifiedUid === uid;
      if (!isAuthorized) {
        const adminSnap = await adminDb.doc(`admin_sessions/${verifiedUid}`).get();
        const supSnap = await adminDb.doc(`supervisor_sessions/${verifiedUid}`).get();
        if (adminSnap.exists && adminSnap.data()?.isActive || supSnap.exists && supSnap.data()?.isActive) {
          isAuthorized = true;
        }
      }
      if (!isAuthorized) {
        return sendApiError(res, 403, "FORBIDDEN", "FORBIDDEN: Unauthorized session release", req.correlationId);
      }
      const secCollMap = {
        admin: "admin_sessions",
        supervisor: "supervisor_sessions",
        delegate: "delegate_sessions",
        garage: "garage_sessions",
        staff: "staff_sessions"
      };
      const entityCollMap = {
        admin: "admin_settings",
        supervisor: "supervisors",
        delegate: "delegates",
        garage: "garages",
        staff: "staff"
      };
      const secColl = secCollMap[role];
      const entityColl = entityCollMap[role];
      const targetEntityId = role === "admin" ? "auth_pin" : entityId;
      if (entityColl && targetEntityId) {
        const entitySnap = await adminDb.doc(`${entityColl}/${targetEntityId}`).get();
        if (entitySnap.exists && entitySnap.data()?.currentSessionId === sessionId) {
          await adminDb.doc(`${entityColl}/${targetEntityId}`).update({
            currentSessionId: null
          });
        }
      }
      if (secColl && uid) {
        const secSnap = await adminDb.doc(`${secColl}/${uid}`).get();
        if (secSnap.exists && secSnap.data()?.sessionId === sessionId) {
          await adminDb.doc(`${secColl}/${uid}`).update({
            isActive: false,
            lastActive: /* @__PURE__ */ new Date()
          });
        }
      }
      return res.json({ success: true });
    } catch (e) {
      console.error("[Server Auth] Error in release-session:", e);
      return res.status(500).json({ success: false, error: "SERVER_ERROR" });
    }
  });
  app2.post("/api/auth/release-admin-session", requireFirebaseUser, async (req, res) => {
    try {
      const { uid, sessionId } = req.body || {};
      const verifiedUid = req.user?.uid || "";
      if (!uid || !sessionId) {
        return sendApiError(res, 400, "INVALID_INPUT", "MISSING_PARAMETERS", req.correlationId);
      }
      if (!adminDb) {
        return sendApiError(res, 500, "SERVICE_UNAVAILABLE", "ADMIN_SDK_NOT_INITIALIZED", req.correlationId);
      }
      if (!verifiedUid) {
        return sendApiError(res, 401, "UNAUTHORIZED", "UNAUTHORIZED: Missing token", req.correlationId);
      }
      if (verifiedUid !== uid) {
        return sendApiError(res, 403, "FORBIDDEN", "FORBIDDEN: Caller UID mismatch", req.correlationId);
      }
      const snap = await adminDb.doc("admin_settings/auth_pin").get();
      if (snap.exists && snap.data()?.currentSessionId === sessionId) {
        await adminDb.doc("admin_settings/auth_pin").update({
          currentSessionId: null
        });
      }
      const secSnap = await adminDb.doc(`admin_sessions/${uid}`).get();
      if (secSnap.exists && secSnap.data()?.sessionId === sessionId) {
        await adminDb.doc(`admin_sessions/${uid}`).update({
          isActive: false,
          lastActive: /* @__PURE__ */ new Date()
        });
      }
      return res.json({ success: true });
    } catch (e) {
      console.error("[Server Auth] Error in release-admin-session:", e);
      return res.status(500).json({ success: false, error: "SERVER_ERROR" });
    }
  });
  app2.post("/api/transactions/recharge-garage", requireAuth, financialRateLimiter(), async (req, res) => {
    const ALLOWED_ROLES = ["admin", "supervisor", "delegate"];
    if (!ALLOWED_ROLES.includes(req.user?.role || "")) {
      return sendApiError(res, 403, "FORBIDDEN", "ADMIN_SUPERVISOR_OR_OWNING_DELEGATE_ONLY", req.correlationId);
    }
    try {
      const sanitized = sanitizePayload(req.body, ["garageId", "packageId", "adminDetails", "idempotencyKey"], false);
      const garageId = validateId(sanitized.garageId, "garageId", true);
      const packageId = validateId(sanitized.packageId, "packageId", true);
      const idempotencyKey = validateIdempotencyKey(sanitized.idempotencyKey || req.headers["idempotency-key"]);
      const callerUid = req.user?.uid;
      const callerRole = req.user?.role || "";
      const adminDetails = sanitized.adminDetails || {};
      if (!adminDb) {
        return sendApiError(res, 500, "INTERNAL_ERROR", "ADMIN_SDK_NOT_INITIALIZED", req.correlationId);
      }
      if (callerRole === "delegate") {
        const delegateGarageSnap = await adminDb.doc(`garages/${garageId}`).get();
        const delegateGarageData = delegateGarageSnap.exists ? delegateGarageSnap.data() || {} : {};
        const ownsGarage = delegateGarageData.createdByDelegateId === req.user?.entityId || delegateGarageData.referrerId === req.user?.entityId;
        if (!ownsGarage) {
          return sendApiError(res, 403, "GARAGE_SCOPE_MISMATCH", "GARAGE_SCOPE_MISMATCH", req.correlationId);
        }
      }
      const pkgSnap = await adminDb.doc(`packages/${packageId}`).get();
      if (!pkgSnap.exists) {
        return sendApiError(res, 404, "NOT_FOUND", "PACKAGE_NOT_FOUND", req.correlationId);
      }
      const packageObj = { id: pkgSnap.id, ...pkgSnap.data() };
      const rawDays = Number(packageObj.durationDays || packageObj.vehiclesCount || 30);
      const durationDays = Math.max(1, Math.min(365, isNaN(rawDays) ? 30 : rawDays));
      const price = Math.max(0, Number(packageObj.price || packageObj.priceAmount || 0));
      const packageName = String(packageObj.name || packageObj.packageName || "\u0628\u0627\u0642\u0629 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643");
      const isUnlimited = Boolean(
        packageObj.isUnlimited || packageName.includes("\u0645\u0641\u062A\u0648\u062D") || packageName.includes("\u063A\u064A\u0631 \u0645\u062D\u062F\u0648\u062F") || packageName.includes("\u0628\u062F\u0648\u0646 \u062D\u062F\u0648\u062F")
      );
      const effCapacity = isUnlimited ? 0 : Math.max(1, Number(packageObj.dailyCapacity || packageObj.carsCount || 40));
      let resultData = null;
      await adminDb.runTransaction(async (t) => {
        const { isDuplicate, cachedResult } = await checkIdempotencyInTransaction(t, idempotencyKey, "/api/transactions/recharge-garage", callerUid);
        if (isDuplicate) {
          resultData = cachedResult;
          return;
        }
        const garageRef = adminDb.doc(`garages/${garageId}`);
        const garageSnap = await t.get(garageRef);
        if (!garageSnap.exists) {
          throw new Error("GARAGE_NOT_FOUND");
        }
        const garageData = garageSnap.data() || {};
        if (garageData.hasMonthlySubscribers === true && durationDays < 15) {
          throw new Error("MONTHLY_SUBSCRIBERS_PACKAGE_RESTRICTION");
        }
        let baseDate = /* @__PURE__ */ new Date();
        const currentExpiry = garageData.balanceExpiry;
        if (currentExpiry) {
          const currentExpDate = new Date(currentExpiry.toDate ? currentExpiry.toDate() : currentExpiry);
          if (!isNaN(currentExpDate.getTime()) && currentExpDate.getTime() > baseDate.getTime()) {
            baseDate = currentExpDate;
          }
        }
        baseDate.setDate(baseDate.getDate() + durationDays);
        const referrerGarageId = garageData.referredByGarageId;
        let referrerRef = null;
        let referrerSnap = null;
        const isEligibleForReferral = Boolean(referrerGarageId) && referrerGarageId !== garageId && price > 0 && durationDays > 1;
        if (isEligibleForReferral && referrerGarageId) {
          referrerRef = adminDb.doc(`garages/${referrerGarageId}`);
          referrerSnap = await t.get(referrerRef);
        }
        const newRevenue = Number(((garageData.totalAdminRevenue || 0) + price).toFixed(2));
        const updateData = {
          totalAdminRevenue: newRevenue,
          isLocked: false,
          isTrial: false,
          dailyCapacity: effCapacity,
          activePackageName: packageName,
          packageName,
          lastRechargeDate: /* @__PURE__ */ new Date(),
          lastRechargeAmount: price,
          lastRechargePackageName: packageName,
          balanceExpiry: baseDate,
          billingModel: "subscription",
          unlimitedFairUse: isUnlimited ? initializeFairUse(durationDays, packageName) : null
        };
        t.set(garageRef, updateData, { merge: true });
        const logRef = adminDb.collection("activity_logs").doc();
        const staffNameText = validateString(adminDetails.staffName, "staffName", { max: 128 }) || "\u0645\u062F\u064A\u0631 \u0627\u0644\u0646\u0638\u0627\u0645 (Admin)";
        t.set(logRef, {
          garageId,
          garageName: garageData.name || "",
          staffId: adminDetails.staffId ? validateId(adminDetails.staffId, "staffId") : callerUid || "admin",
          staffName: staffNameText,
          actionType: "recharge",
          plateNumber: `\u062A\u062C\u062F\u064A\u062F \u0627\u0634\u062A\u0631\u0627\u0643: ${packageName} (${durationDays} \u064A\u0648\u0645) - ${price} \u062C`,
          timestamp: /* @__PURE__ */ new Date(),
          amount: price,
          packageId: packageId || packageObj.id || "direct_recharge",
          details: {
            packageName,
            durationDays,
            carsCount: effCapacity,
            revenueAmount: price,
            originalRevenueAmount: price,
            discountAmount: 0,
            rechargedBy: staffNameText
          }
        });
        if (isEligibleForReferral && referrerRef && referrerSnap && referrerSnap.exists) {
          const referrerData = referrerSnap.data() || {};
          t.set(referrerRef, {
            totalReferralRewardDays: (referrerData.totalReferralRewardDays || 0) + 1,
            totalGaragesReferredCount: (referrerData.totalGaragesReferredCount || 0) + 1,
            lastReferralRewardAt: /* @__PURE__ */ new Date()
          }, { merge: true });
          const rewardLogRef = adminDb.collection("activity_logs").doc();
          t.set(rewardLogRef, {
            garageId: referrerGarageId,
            garageName: referrerData.name || "",
            staffId: null,
            staffName: "\u0627\u0644\u0646\u0638\u0627\u0645 \u2014 \u0645\u0643\u0627\u0641\u0623\u0629 \u0625\u062D\u0627\u0644\u0629",
            actionType: "recharge",
            plateNumber: `\u0645\u0643\u0627\u0641\u0623\u0629 \u0625\u062D\u0627\u0644\u0629 \u0645\u0646 ${garageData.name || ""} \u2014 \u0625\u0636\u0627\u0641\u0629 \u064A\u0648\u0645 \u0645\u062C\u0627\u0646\u064A \u0628\u0631\u0635\u064A\u062F \u0627\u0644\u0645\u0643\u0627\u0641\u0622\u062A`,
            timestamp: /* @__PURE__ */ new Date(),
            amount: 0,
            packageId: referrerData.packageId || "referral_reward",
            details: {
              type: "referral_reward",
              referrerGarageId,
              referredGarageId: garageId
            }
          });
        }
        resultData = {
          newExpiry: baseDate.toISOString(),
          totalAdminRevenue: newRevenue
        };
        storeIdempotencyInTransaction(t, idempotencyKey, resultData, "/api/transactions/recharge-garage", callerUid);
      });
      return res.json({ success: true, data: resultData });
    } catch (error) {
      console.error("[Server Transaction] Error in recharge-garage:", error);
      const { statusCode, code, message } = mapDomainErrorToStatus(error);
      return sendApiError(res, statusCode, code, message, req.correlationId);
    }
  });
  app2.post("/api/transactions/approve-recharge-request", requireAuth, financialRateLimiter(), async (req, res) => {
    if (req.user?.role !== "admin" && req.user?.role !== "supervisor") {
      return sendApiError(res, 403, "FORBIDDEN", "ADMIN_OR_SUPERVISOR_ONLY", req.correlationId);
    }
    const callerUid = req.user?.uid;
    try {
      const sanitized = sanitizePayload(req.body, ["requestId", "request", "idempotencyKey"], false);
      const reqId = validateId(sanitized.requestId || sanitized.request?.id, "requestId", true);
      const idempotencyKey = validateIdempotencyKey(sanitized.idempotencyKey || req.headers["idempotency-key"]);
      if (!adminDb) {
        return sendApiError(res, 500, "INTERNAL_ERROR", "ADMIN_SDK_NOT_INITIALIZED", req.correlationId);
      }
      let resultData = null;
      await adminDb.runTransaction(async (t) => {
        const { isDuplicate, cachedResult } = await checkIdempotencyInTransaction(t, idempotencyKey, "/api/transactions/approve-recharge-request", callerUid);
        if (isDuplicate) {
          resultData = cachedResult;
          return;
        }
        const requestRef = adminDb.doc(`recharge_requests/${reqId}`);
        const requestSnap = await t.get(requestRef);
        if (!requestSnap.exists) {
          throw new Error("REQUEST_NOT_FOUND");
        }
        const requestData = requestSnap.data() || {};
        if (requestData.status && requestData.status !== "pending") {
          throw new Error("REQUEST_ALREADY_PROCESSED");
        }
        const targetGarageId = requestData.garageId || sanitized.request && sanitized.request.garageId;
        if (!targetGarageId) {
          throw new Error("GARAGE_ID_MISSING");
        }
        const garageRef = adminDb.doc(`garages/${targetGarageId}`);
        const garageSnap = await t.get(garageRef);
        if (!garageSnap.exists) {
          throw new Error("GARAGE_NOT_FOUND");
        }
        const garageData = garageSnap.data() || {};
        const globalSettingsSnap = await t.get(adminDb.doc("system_config/global"));
        const legacySettingsSnap = await t.get(adminDb.doc("admin_settings/general"));
        const systemConfig = globalSettingsSnap.exists ? { ...legacySettingsSnap.exists ? legacySettingsSnap.data() : {}, ...globalSettingsSnap.data() } : legacySettingsSnap.exists ? legacySettingsSnap.data() : {};
        const delegateMonthlyCommission = Number(
          systemConfig?.delegateMonthlyCommission ?? systemConfig?.referralFeePerRenewal ?? 100
        );
        const subscriberFlatFee = systemConfig?.subscriberFlatFee !== void 0 ? Math.max(0, Number(systemConfig.subscriberFlatFee)) : systemConfig?.monthlySubscribersFlatFee !== void 0 ? Number(systemConfig.monthlySubscribersFlatFee) : 500;
        const delegateReferrerId = garageData.referrerId || garageData.createdByDelegateId || null;
        const referredByDelegate = Boolean(delegateReferrerId);
        const isBalanceTopup = requestData.requestType === "balance_topup" || requestData.packageId === "balance_topup";
        if (isBalanceTopup) {
          const topupAmount = Number(requestData.amount || requestData.revenueAmount || 0);
          const currentBalance = Number(garageData.balance || 0);
          const newGarageBalance = currentBalance + topupAmount;
          const targetDelegateId = delegateReferrerId || requestData.delegateId || null;
          let delegateRef = null;
          let delegateSnap = null;
          if (targetDelegateId) {
            delegateRef = adminDb.doc(`delegates/${targetDelegateId}`);
            delegateSnap = await t.get(delegateRef);
          }
          t.set(garageRef, {
            balance: newGarageBalance,
            totalAdminRevenue: (garageData.totalAdminRevenue || 0) + topupAmount,
            lastRechargeDate: /* @__PURE__ */ new Date(),
            lastRechargeAmount: topupAmount,
            lastRechargePackageName: `\u0634\u062D\u0646 \u0631\u0635\u064A\u062F \u0645\u062D\u0641\u0638\u0629 (${topupAmount} \u062C.\u0645)`
          }, { merge: true });
          t.set(requestRef, {
            status: "approved",
            amount: topupAmount,
            revenueAmount: topupAmount,
            originalRevenueAmount: topupAmount,
            resolvedAt: /* @__PURE__ */ new Date()
          }, { merge: true });
          if (delegateRef && delegateSnap && delegateSnap.exists) {
            const delData = delegateSnap.data() || {};
            t.set(delegateRef, {
              totalRechargedAmount: (delData.totalRechargedAmount || 0) + topupAmount
            }, { merge: true });
          }
          const logRef = adminDb.collection("activity_logs").doc();
          t.set(logRef, {
            garageId: targetGarageId,
            garageName: requestData.garageName || garageData.name || "",
            staffId: delegateReferrerId || requestData.delegateId || null,
            staffName: requestData.delegateName || null,
            actionType: "balance_topup",
            plateNumber: `\u0634\u062D\u0646 \u0631\u0635\u064A\u062F \u0645\u062D\u0641\u0638\u0629 (${topupAmount} \u062C.\u0645)`,
            timestamp: /* @__PURE__ */ new Date(),
            amount: topupAmount,
            details: {
              action: "balance_topup",
              amount: topupAmount,
              previousBalance: currentBalance,
              newBalance: newGarageBalance,
              delegateId: requestData.delegateId || null,
              delegateName: requestData.delegateName || null,
              requestId: reqId
            }
          });
          resultData = {
            requestId: reqId,
            status: "approved",
            newBalance: newGarageBalance,
            revenue: topupAmount
          };
        } else {
          const rawPackageData = requestData.packageData || {};
          let basePrice = Number(rawPackageData.price || rawPackageData.priceAmount || requestData.amount || 0);
          let durationDays = Number(requestData.durationDays || requestData.carsCount || 30);
          let pkgName = String(requestData.packageName || rawPackageData.name || "\u0628\u0627\u0642\u0629 \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643");
          let isUnlimitedPkg = pkgName.includes("\u0645\u0641\u062A\u0648\u062D") || pkgName.includes("\u063A\u064A\u0631 \u0645\u062D\u062F\u0648\u062F") || pkgName.includes("\u063A\u064A\u0631 \u0645\u062D\u062F\u0648\u062F\u0629") || pkgName.includes("\u0628\u062F\u0648\u0646 \u062D\u062F\u0648\u062F") || pkgName.includes("\u0633\u0639\u0629 \u0645\u0641\u062A\u0648\u062D\u0629");
          let effCapacity = isUnlimitedPkg ? 0 : Math.max(1, Number(requestData.dailyCapacity || 40));
          if (requestData.packageId) {
            const pkgRef = adminDb.doc(`packages/${requestData.packageId}`);
            const pkgSnap = await t.get(pkgRef);
            if (pkgSnap.exists) {
              const pData = pkgSnap.data() || {};
              if (pData.price !== void 0) {
                basePrice = Number(pData.price);
              }
              if (pData.durationDays !== void 0) {
                durationDays = Number(pData.durationDays);
              }
              if (pData.dailyCapacity !== void 0) {
                effCapacity = pData.isUnlimited ? 0 : Number(pData.dailyCapacity);
              }
              if (pData.name) {
                pkgName = String(pData.name);
              }
            }
          }
          const targetDelegateId = delegateReferrerId || requestData.delegateId || null;
          let delegateRef = null;
          let delegateSnap = null;
          if (targetDelegateId) {
            delegateRef = adminDb.doc(`delegates/${targetDelegateId}`);
            delegateSnap = await t.get(delegateRef);
          }
          let commission = 0;
          if (referredByDelegate && targetDelegateId) {
            const currentMonthKey = (/* @__PURE__ */ new Date()).toISOString().slice(0, 7);
            const monthlyStatsRef = adminDb.doc(`garage_monthly_stats/${targetGarageId}_${currentMonthKey}`);
            const monthlyStatsSnap = await t.get(monthlyStatsRef);
            const monthlyStatsData = monthlyStatsSnap.exists ? monthlyStatsSnap.data() : {};
            const prevDaysPurchased = Number(monthlyStatsData.totalDaysPurchased || 0);
            const newDaysPurchased = prevDaysPurchased + durationDays;
            const alreadyPaid = Boolean(monthlyStatsData.paid100EgpCommission);
            if (!alreadyPaid && (durationDays >= 30 || newDaysPurchased >= 10)) {
              commission = delegateMonthlyCommission > 0 ? delegateMonthlyCommission : 100;
            }
            t.set(monthlyStatsRef, {
              garageId: targetGarageId,
              delegateId: targetDelegateId,
              monthKey: currentMonthKey,
              totalDaysPurchased: newDaysPurchased,
              paid100EgpCommission: alreadyPaid || commission > 0,
              updatedAt: /* @__PURE__ */ new Date()
            }, { merge: true });
          }
          const effectiveOriginalRevenue = basePrice;
          const discountAmount = Number(requestData.discountAmount || 0);
          let effectiveRevenue = Math.max(0, basePrice - discountAmount);
          if (garageData.hasMonthlySubscribers === true) {
            effectiveRevenue += subscriberFlatFee;
          }
          let baseDate = /* @__PURE__ */ new Date();
          const currentExpiry = garageData.balanceExpiry;
          if (currentExpiry) {
            const expDate = new Date(currentExpiry.toDate ? currentExpiry.toDate() : currentExpiry);
            if (!isNaN(expDate.getTime()) && expDate.getTime() > baseDate.getTime()) {
              baseDate = expDate;
            }
          }
          baseDate.setDate(baseDate.getDate() + durationDays);
          t.set(garageRef, {
            balanceExpiry: baseDate,
            dailyCapacity: effCapacity,
            activePackageName: pkgName || requestData.packageName || "\u0627\u0644\u0628\u0627\u0642\u0629",
            packageName: pkgName || requestData.packageName || "\u0627\u0644\u0628\u0627\u0642\u0629",
            billingModel: "subscription",
            isLocked: false,
            isTrial: false,
            totalAdminRevenue: (garageData.totalAdminRevenue || 0) + effectiveRevenue,
            lastRechargeDate: /* @__PURE__ */ new Date(),
            lastRechargeAmount: effectiveRevenue,
            lastRechargePackageName: requestData.packageName || null,
            unlimitedFairUse: isUnlimitedPkg ? initializeFairUse(durationDays, pkgName || requestData.packageName || "") : null
          }, { merge: true });
          t.set(requestRef, {
            status: "approved",
            commission,
            referrerId: delegateReferrerId,
            amount: effectiveRevenue,
            revenueAmount: effectiveRevenue,
            originalRevenueAmount: effectiveOriginalRevenue,
            resolvedAt: /* @__PURE__ */ new Date()
          }, { merge: true });
          if (delegateRef && delegateSnap && delegateSnap.exists) {
            const delData = delegateSnap.data() || {};
            t.set(delegateRef, {
              totalRechargedAmount: (delData.totalRechargedAmount || 0) + effectiveRevenue,
              totalCommissionEarned: (delData.totalCommissionEarned || 0) + commission
            }, { merge: true });
          }
          const logRef = adminDb.collection("activity_logs").doc();
          t.set(logRef, {
            garageId: targetGarageId,
            garageName: requestData.garageName || garageData.name || "",
            staffId: delegateReferrerId || requestData.delegateId || null,
            staffName: requestData.delegateName || null,
            actionType: "recharge",
            plateNumber: `\u0634\u062D\u0646 ${requestData.packageName || "\u0627\u0644\u0628\u0627\u0642\u0629"} (${durationDays} \u064A\u0648\u0645 - ${effCapacity === 0 ? "\u0645\u0641\u062A\u0648\u062D" : `${effCapacity} \u0633\u064A\u0627\u0631\u0629`})`,
            timestamp: /* @__PURE__ */ new Date(),
            amount: effectiveRevenue,
            packageId: requestData.packageId || null,
            details: {
              packageName: requestData.packageName,
              durationDays,
              carsCount: effCapacity,
              revenueAmount: effectiveRevenue,
              commission,
              requestId: reqId
            }
          });
          resultData = {
            requestId: reqId,
            status: "approved",
            newExpiry: baseDate.toISOString(),
            revenue: effectiveRevenue,
            commission
          };
        }
        storeIdempotencyInTransaction(t, idempotencyKey, resultData, "/api/transactions/approve-recharge-request", callerUid);
      });
      return res.json({ success: true, data: resultData });
    } catch (error) {
      console.error("[Server Transaction] Error in approve-recharge-request:", error);
      const { statusCode, code, message } = mapDomainErrorToStatus(error);
      return sendApiError(res, statusCode, code, message, req.correlationId);
    }
  });
  app2.post("/api/transactions/reject-recharge-request", requireAuth, financialRateLimiter(), async (req, res) => {
    if (req.user?.role !== "admin" && req.user?.role !== "supervisor") {
      return sendApiError(res, 403, "FORBIDDEN", "ADMIN_OR_SUPERVISOR_ONLY", req.correlationId);
    }
    const callerUid = req.user?.uid;
    try {
      const sanitized = sanitizePayload(req.body, ["requestId", "idempotencyKey"], false);
      const requestId = validateId(sanitized.requestId, "requestId", true);
      const idempotencyKey = validateIdempotencyKey(sanitized.idempotencyKey || req.headers["idempotency-key"]);
      if (!adminDb) {
        return sendApiError(res, 500, "INTERNAL_ERROR", "ADMIN_SDK_NOT_INITIALIZED", req.correlationId);
      }
      await adminDb.runTransaction(async (t) => {
        const { isDuplicate } = await checkIdempotencyInTransaction(t, idempotencyKey, "/api/transactions/reject-recharge-request", callerUid);
        if (isDuplicate) {
          return;
        }
        const requestRef = adminDb.doc(`recharge_requests/${requestId}`);
        const requestSnap = await t.get(requestRef);
        if (!requestSnap.exists) {
          throw new Error("REQUEST_NOT_FOUND");
        }
        const currentStatus = requestSnap.data()?.status;
        if (currentStatus && currentStatus !== "pending") {
          throw new Error("REQUEST_ALREADY_PROCESSED");
        }
        t.set(requestRef, {
          status: "rejected",
          resolvedAt: /* @__PURE__ */ new Date()
        }, { merge: true });
        storeIdempotencyInTransaction(t, idempotencyKey, { success: true }, "/api/transactions/reject-recharge-request", callerUid);
      });
      return res.json({ success: true });
    } catch (error) {
      console.error("[Server Transaction] Error in reject-recharge-request:", error);
      const { statusCode, code, message } = mapDomainErrorToStatus(error);
      return sendApiError(res, statusCode, code, message, req.correlationId);
    }
  });
  app2.post("/api/transactions/admin-topup-balance", requireAuth, financialRateLimiter(), async (req, res) => {
    if (req.user?.role !== "admin") {
      return sendApiError(res, 403, "FORBIDDEN", "ADMIN_ONLY", req.correlationId);
    }
    const callerUid = req.user?.uid;
    try {
      const sanitized = sanitizePayload(req.body, ["garageId", "amount", "idempotencyKey"], false);
      const garageId = validateId(sanitized.garageId, "garageId", true);
      const numAmount = validateNumber(sanitized.amount, "amount", { min: 1, max: 1e6, integerOnly: true });
      const idempotencyKey = validateIdempotencyKey(sanitized.idempotencyKey || req.headers["idempotency-key"]);
      if (!adminDb) {
        return sendApiError(res, 500, "INTERNAL_ERROR", "ADMIN_SDK_NOT_INITIALIZED", req.correlationId);
      }
      let resultData = null;
      await adminDb.runTransaction(async (t) => {
        const { isDuplicate, cachedResult } = await checkIdempotencyInTransaction(t, idempotencyKey, "/api/transactions/admin-topup-balance", callerUid);
        if (isDuplicate) {
          resultData = cachedResult;
          return;
        }
        const garageRef = adminDb.doc(`garages/${garageId}`);
        const garageSnap = await t.get(garageRef);
        if (!garageSnap.exists) {
          throw new Error("GARAGE_NOT_FOUND");
        }
        const garageData = garageSnap.data() || {};
        const currentBalance = Number(garageData.balance || 0);
        const newBalance = currentBalance + numAmount;
        t.set(garageRef, {
          balance: newBalance,
          totalAdminRevenue: (garageData.totalAdminRevenue || 0) + numAmount,
          lastRechargeDate: /* @__PURE__ */ new Date(),
          lastRechargeAmount: numAmount,
          lastRechargePackageName: `\u0634\u062D\u0646 \u0631\u0635\u064A\u062F \u0645\u0628\u0627\u0634\u0631 (${numAmount} \u062C.\u0645)`
        }, { merge: true });
        const logRef = adminDb.collection("activity_logs").doc();
        t.set(logRef, {
          garageId,
          garageName: garageData.name || "",
          staffId: callerUid || "admin",
          staffName: "\u0645\u062F\u064A\u0631 \u0627\u0644\u0646\u0638\u0627\u0645 (Admin)",
          actionType: "balance_topup",
          plateNumber: `\u0634\u062D\u0646 \u0631\u0635\u064A\u062F \u0645\u0628\u0627\u0634\u0631 (${numAmount} \u062C.\u0645)`,
          timestamp: /* @__PURE__ */ new Date(),
          amount: numAmount,
          details: {
            action: "admin_balance_topup",
            amount: numAmount,
            previousBalance: currentBalance,
            newBalance
          }
        });
        resultData = { garageId, newBalance, addedAmount: numAmount };
        storeIdempotencyInTransaction(t, idempotencyKey, resultData, "/api/transactions/admin-topup-balance", callerUid);
      });
      return res.json({ success: true, data: resultData });
    } catch (error) {
      console.error("[Server Transaction] Error in admin-topup-balance:", error);
      const { statusCode, code, message } = mapDomainErrorToStatus(error);
      return sendApiError(res, statusCode, code, message, req.correlationId);
    }
  });
  app2.post("/api/transactions/garage-self-subscribe", requireAuth, financialRateLimiter(), async (req, res) => {
    const userRole = req.user?.role;
    const userGarageId = req.user?.garageId || req.user?.entityId;
    const callerUid = req.user?.uid;
    try {
      const sanitized = sanitizePayload(req.body, ["garageId", "packageId", "packageData", "idempotencyKey"], false);
      const bodyGarageId = validateId(sanitized.garageId, "garageId", false);
      const packageId = validateId(sanitized.packageId, "packageId", true);
      const idempotencyKey = validateIdempotencyKey(sanitized.idempotencyKey || req.headers["idempotency-key"]);
      const garageId = userRole === "garage" ? userGarageId : bodyGarageId || userGarageId;
      if (userRole === "garage" && userGarageId && bodyGarageId && userGarageId !== bodyGarageId) {
        return sendApiError(res, 403, "FORBIDDEN", "UNAUTHORIZED_GARAGE_ACCESS", req.correlationId);
      }
      if (!["garage", "admin", "supervisor"].includes(userRole || "")) {
        return sendApiError(res, 403, "FORBIDDEN", "FORBIDDEN: Role not authorized for self subscribe", req.correlationId);
      }
      if (!garageId) {
        return sendApiError(res, 400, "INVALID_INPUT", "GARAGE_ID_REQUIRED", req.correlationId);
      }
      if (!adminDb) {
        return sendApiError(res, 500, "INTERNAL_ERROR", "ADMIN_SDK_NOT_INITIALIZED", req.correlationId);
      }
      let resultData = null;
      await adminDb.runTransaction(async (t) => {
        const { isDuplicate, cachedResult } = await checkIdempotencyInTransaction(t, idempotencyKey, "/api/transactions/garage-self-subscribe", callerUid);
        if (isDuplicate) {
          resultData = cachedResult;
          return;
        }
        const garageRef = adminDb.doc(`garages/${garageId}`);
        const garageSnap = await t.get(garageRef);
        if (!garageSnap.exists) {
          throw new Error("GARAGE_NOT_FOUND");
        }
        const garageData = garageSnap.data() || {};
        const currentBalance = Number(garageData.balance || 0);
        const settingsSnap = await t.get(adminDb.doc("system_config/global"));
        const systemConfig = settingsSnap.exists ? settingsSnap.data() : {};
        const subscriberFlatFee = systemConfig?.subscriberFlatFee !== void 0 ? Math.max(0, Number(systemConfig.subscriberFlatFee)) : systemConfig?.monthlySubscribersFlatFee !== void 0 ? Number(systemConfig.monthlySubscribersFlatFee) : 500;
        const DEFAULT_PACKAGES_MAP = {
          daily_30: { id: "daily_30", name: "\u0628\u0627\u0642\u0629 30 \u0633\u064A\u0627\u0631\u0629/\u064A\u0648\u0645", price: 15, durationDays: 1, dailyCapacity: 30 },
          daily_50: { id: "daily_50", name: "\u0628\u0627\u0642\u0629 50 \u0633\u064A\u0627\u0631\u0629/\u064A\u0648\u0645", price: 25, durationDays: 1, dailyCapacity: 50 },
          daily_unlimited: { id: "daily_unlimited", name: "\u0628\u0627\u0642\u0629 \u0633\u0639\u0629 \u0645\u0641\u062A\u0648\u062D\u0629", price: 40, durationDays: 1, dailyCapacity: 0, isUnlimited: true },
          biweekly_30: { id: "biweekly_30", name: "\u0628\u0627\u0642\u0629 30 \u0633\u064A\u0627\u0631\u0629/\u064A\u0648\u0645", price: 120, durationDays: 15, dailyCapacity: 30 },
          biweekly_50: { id: "biweekly_50", name: "\u0628\u0627\u0642\u0629 50 \u0633\u064A\u0627\u0631\u0629/\u064A\u0648\u0645", price: 180, durationDays: 15, dailyCapacity: 50 },
          biweekly_unlimited: { id: "biweekly_unlimited", name: "\u0628\u0627\u0642\u0629 \u0633\u0639\u0629 \u0645\u0641\u062A\u0648\u062D\u0629", price: 280, durationDays: 15, dailyCapacity: 0, isUnlimited: true },
          monthly_30: { id: "monthly_30", name: "\u0628\u0627\u0642\u0629 30 \u0633\u064A\u0627\u0631\u0629/\u064A\u0648\u0645", price: 200, durationDays: 30, dailyCapacity: 30 },
          monthly_50: { id: "monthly_50", name: "\u0628\u0627\u0642\u0629 50 \u0633\u064A\u0627\u0631\u0629/\u064A\u0648\u0645", price: 300, durationDays: 30, dailyCapacity: 50 },
          monthly_unlimited: { id: "monthly_unlimited", name: "\u0628\u0627\u0642\u0629 \u0633\u0639\u0629 \u0645\u0641\u062A\u0648\u062D\u0629", price: 450, durationDays: 30, dailyCapacity: 0, isUnlimited: true }
        };
        let pkg = null;
        if (packageId) {
          const pkgRef = adminDb.doc(`packages/${packageId}`);
          const pkgSnap = await t.get(pkgRef);
          if (pkgSnap.exists) {
            pkg = { id: pkgSnap.id, ...pkgSnap.data() };
          } else if (DEFAULT_PACKAGES_MAP[packageId]) {
            pkg = { ...DEFAULT_PACKAGES_MAP[packageId] };
          } else if (sanitized.packageData && typeof sanitized.packageData === "object") {
            pkg = { id: packageId, ...sanitized.packageData };
          }
        }
        if (!pkg) {
          throw new Error("PACKAGE_NOT_FOUND");
        }
        const durationDays = Number(pkg.durationDays || pkg.vehiclesCount || 30);
        let basePrice = Number(pkg.price || 0);
        let discountAmount = 0;
        if (pkg.discountType === "percentage" && pkg.discountValue > 0) {
          discountAmount = Math.round(basePrice * Number(pkg.discountValue) / 100);
        } else if (pkg.discountType === "fixed" && pkg.discountValue > 0) {
          discountAmount = Math.min(basePrice, Number(pkg.discountValue));
        }
        let effectivePrice = Math.max(0, basePrice - discountAmount);
        if (garageData.hasMonthlySubscribers === true) {
          effectivePrice += subscriberFlatFee;
        }
        if (currentBalance < effectivePrice) {
          throw new Error(`INSUFFICIENT_BALANCE: \u0627\u0644\u0631\u0635\u064A\u062F \u0627\u0644\u0645\u062A\u0627\u062D (${currentBalance} \u062C.\u0645) \u063A\u064A\u0631 \u0643\u0627\u0641\u064D \u0644\u0644\u0627\u0634\u062A\u0631\u0627\u0643 \u0641\u064A \u0647\u0630\u0647 \u0627\u0644\u0628\u0627\u0642\u0629 (${effectivePrice} \u062C.\u0645)`);
        }
        const newBalance = currentBalance - effectivePrice;
        let baseDate = /* @__PURE__ */ new Date();
        const currentExpiry = garageData.balanceExpiry;
        if (currentExpiry) {
          const expDate = new Date(currentExpiry.toDate ? currentExpiry.toDate() : currentExpiry);
          if (!isNaN(expDate.getTime()) && expDate.getTime() > baseDate.getTime()) {
            baseDate = expDate;
          }
        }
        baseDate.setDate(baseDate.getDate() + durationDays);
        const pkgName = String(pkg.name || "\u0628\u0627\u0642\u0629 \u0627\u0634\u062A\u0631\u0627\u0643");
        const isUnlimitedPkg = pkgName.includes("\u0645\u0641\u062A\u0648\u062D") || pkgName.includes("\u063A\u064A\u0631 \u0645\u062D\u062F\u0648\u062F") || pkgName.includes("\u063A\u064A\u0631 \u0645\u062D\u062F\u0648\u062F\u0629") || pkgName.includes("\u0628\u062F\u0648\u0646 \u062D\u062F\u0648\u062F") || pkgName.includes("\u0633\u0639\u0629 \u0645\u0641\u062A\u0648\u062D\u0629") || pkg.dailyCapacity === 0;
        const effCapacity = isUnlimitedPkg ? 0 : Math.max(1, Number(pkg.dailyCapacity || 40));
        t.set(garageRef, {
          balance: newBalance,
          balanceExpiry: baseDate,
          dailyCapacity: effCapacity,
          activePackageName: pkgName,
          packageName: pkgName,
          billingModel: "subscription",
          isLocked: false,
          isTrial: false,
          lastRechargeDate: /* @__PURE__ */ new Date(),
          lastRechargeAmount: effectivePrice,
          lastRechargePackageName: pkgName,
          unlimitedFairUse: isUnlimitedPkg ? initializeFairUse(durationDays, pkgName) : null
        }, { merge: true });
        const logRef = adminDb.collection("activity_logs").doc();
        t.set(logRef, {
          garageId,
          garageName: garageData.name || "",
          staffId: callerUid || "owner",
          staffName: garageData.ownerName || "\u0645\u062F\u064A\u0631 \u0627\u0644\u062C\u0631\u0627\u062C",
          actionType: "self_subscribe",
          plateNumber: `\u062A\u0641\u0639\u064A\u0644 \u0628\u0627\u0642\u0629 \u0628\u0627\u0644\u0631\u0635\u064A\u062F: ${pkgName} (${durationDays} \u064A\u0648\u0645)`,
          timestamp: /* @__PURE__ */ new Date(),
          amount: effectivePrice,
          packageId: pkg.id || packageId,
          details: {
            packageName: pkgName,
            durationDays,
            carsCount: effCapacity,
            cost: effectivePrice,
            previousBalance: currentBalance,
            remainingBalance: newBalance
          }
        });
        resultData = {
          garageId,
          newBalance,
          newExpiry: baseDate.toISOString(),
          packageName: pkgName,
          deductedAmount: effectivePrice
        };
        storeIdempotencyInTransaction(t, idempotencyKey, resultData, "/api/transactions/garage-self-subscribe", callerUid);
      });
      return res.json({ success: true, data: resultData });
    } catch (error) {
      console.error("[Server Transaction] Error in garage-self-subscribe:", error);
      const { statusCode, code, message } = mapDomainErrorToStatus(error);
      return sendApiError(res, statusCode, code, message, req.correlationId);
    }
  });
  app2.post("/api/vehicles/check-in", requireAuth, async (req, res) => {
    try {
      const { garageId: bodyGarageId, plateNumber, plateRaw, type } = req.body || {};
      const callerRole = req.user?.role;
      let garageId = "";
      if (callerRole === "garage" || callerRole === "staff") {
        if (!req.user?.garageId) {
          return res.status(403).json({ success: false, error: "FORBIDDEN: Garage ID missing in session" });
        }
        if (bodyGarageId && bodyGarageId !== req.user.garageId) {
          return res.status(403).json({ success: false, error: "GARAGE_SCOPE_MISMATCH" });
        }
        garageId = req.user.garageId;
      } else if (callerRole === "admin") {
        garageId = bodyGarageId;
      } else {
        return res.status(403).json({ success: false, error: "FORBIDDEN: Role not authorized for vehicle operations" });
      }
      const staffId = req.user?.uid;
      if (!garageId || !plateNumber || !plateRaw) {
        return res.status(400).json({ success: false, error: "MISSING_PARAMETERS" });
      }
      if (!adminDb) return res.status(500).json({ success: false, error: "ADMIN_SDK_NOT_INITIALIZED" });
      const getCairoDateKey = () => {
        return new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(/* @__PURE__ */ new Date());
      };
      const today = getCairoDateKey();
      let isSubscriberAuthoritative = false;
      try {
        const subSnapRaw = await adminDb.collection(`garages/${garageId}/subscribers`).where("plateNumberRaw", "==", plateRaw).get();
        for (const doc of subSnapRaw.docs) {
          const subData = doc.data() || {};
          const startDate = subData.startDate || "";
          const endDate = subData.endDate || "";
          if (startDate && endDate && today >= startDate && today <= endDate) {
            isSubscriberAuthoritative = true;
            break;
          }
        }
        if (!isSubscriberAuthoritative) {
          const subSnapPlate = await adminDb.collection(`garages/${garageId}/subscribers`).where("plateNumber", "==", plateNumber).get();
          for (const doc of subSnapPlate.docs) {
            const subData = doc.data() || {};
            const startDate = subData.startDate || "";
            const endDate = subData.endDate || "";
            if (startDate && endDate && today >= startDate && today <= endDate) {
              isSubscriberAuthoritative = true;
              break;
            }
          }
        }
      } catch (subErr) {
        console.warn("[Server Check-In] Subscriber lookup warning:", subErr);
      }
      await adminDb.runTransaction(async (t) => {
        const garageRef = adminDb.doc(`garages/${garageId}`);
        const vehicleRef = adminDb.doc(`garages/${garageId}/vehicles/${plateRaw}`);
        const dailyStatsRef = adminDb.doc(`garages/${garageId}/daily_stats/${today}`);
        const [garageSnap, vehicleSnap, dailyStatsSnap] = await Promise.all([
          t.get(garageRef),
          t.get(vehicleRef),
          t.get(dailyStatsRef)
        ]);
        if (!garageSnap.exists) throw new Error("GARAGE_NOT_FOUND");
        const garageData = garageSnap.data() || {};
        const resolvedStaffName = req.user?.displayName || (callerRole === "admin" ? "\u0645\u062F\u064A\u0631 \u0627\u0644\u0646\u0638\u0627\u0645" : callerRole === "garage" ? garageData.name || "\u0645\u062F\u064A\u0631 \u0627\u0644\u062C\u0631\u0627\u062C" : "\u0645\u0648\u0638\u0641");
        const expDateRaw = garageData.balanceExpiry;
        if (!expDateRaw) throw new Error("SUBSCRIPTION_EXPIRED");
        const expDate = expDateRaw.toDate ? expDateRaw.toDate() : new Date(expDateRaw);
        if (isNaN(expDate.getTime()) || expDate.getTime() < Date.now()) {
          throw new Error("SUBSCRIPTION_EXPIRED");
        }
        const isNewDay = garageData.lastTransactionDate !== today;
        const capacity = Number(garageData.dailyCapacity || 0);
        const used = isNewDay ? 0 : Number(garageData.todayCount || 0);
        const isUnlimited = capacity === 0 || String(garageData.activePackageName || "").includes("\u0645\u0641\u062A\u0648\u062D");
        let updatedFairUse = null;
        let didAutoExtend = false;
        if (isUnlimited) {
          const evalResult = evaluateFairUseCheckIn(
            garageData.unlimitedFairUse,
            garageData.durationDays || 30,
            garageData.activePackageName || ""
          );
          if (!evalResult.allowed) {
            throw new Error("FAIR_USE_LIMIT_REACHED");
          }
          updatedFairUse = evalResult.updatedFairUse;
          didAutoExtend = evalResult.autoExtended;
        } else if (used >= capacity) {
          throw new Error("CAPACITY_LIMIT_REACHED");
        }
        if (vehicleSnap.exists && vehicleSnap.data()?.status === "inside") {
          throw new Error("VEHICLE_ALREADY_INSIDE");
        }
        t.set(vehicleRef, {
          id: plateRaw,
          plate: plateNumber,
          plateNumber,
          plateNumberRaw: plateRaw,
          type: type || "hourly",
          isSubscriber: isSubscriberAuthoritative,
          entryTime: /* @__PURE__ */ new Date(),
          status: "inside",
          staffId: staffId || null,
          staffName: resolvedStaffName,
          enteredByUid: req.user?.uid || null
        }, { merge: true });
        const garageUpdate = {
          carsInside: (garageData.carsInside || 0) + 1,
          todayCount: isNewDay ? 1 : used + 1,
          todayRevenue: isNewDay ? 0 : garageData.todayRevenue || 0,
          lastTransactionDate: today
        };
        if (updatedFairUse) {
          garageUpdate.unlimitedFairUse = updatedFairUse;
        }
        t.set(garageRef, garageUpdate, { merge: true });
        if (didAutoExtend && updatedFairUse) {
          const autoExtLogRef = adminDb.collection("activity_logs").doc();
          t.set(autoExtLogRef, {
            garageId,
            garageName: garageData.name || "",
            staffId: "system",
            staffName: "\u0646\u0638\u0627\u0645 \u0627\u0644\u0627\u0633\u062A\u062E\u062F\u0627\u0645 \u0627\u0644\u0639\u0627\u062F\u0644",
            actionType: "fair_use_auto_extended",
            plateNumber: `\u062A\u0645\u062F\u064A\u062F \u062A\u0644\u0642\u0627\u0626\u064A \u0644\u0633\u0639\u0629 \u0627\u0644\u0628\u0627\u0642\u0629 (+${updatedFairUse.stepAmount} \u0633\u064A\u0627\u0631\u0629)`,
            timestamp: /* @__PURE__ */ new Date(),
            details: {
              currentAllowance: updatedFairUse.currentAllowance,
              maxAllowance: updatedFairUse.maxAllowance,
              cycleCarsCount: updatedFairUse.cycleCarsCount,
              tierType: updatedFairUse.tierType
            }
          });
        }
        if (!dailyStatsSnap.exists) {
          t.set(dailyStatsRef, {
            dateId: today,
            count: 1,
            limit: isUnlimited ? 0 : capacity,
            revenue: 0,
            createdAt: /* @__PURE__ */ new Date()
          });
        } else {
          t.set(dailyStatsRef, { count: (dailyStatsSnap.data()?.count || 0) + 1 }, { merge: true });
        }
        const logRef = adminDb.collection("activity_logs").doc();
        t.set(logRef, {
          garageId,
          garageName: garageData.name || "",
          staffId: staffId || null,
          staffName: resolvedStaffName,
          actionType: "check_in",
          plateNumber,
          timestamp: /* @__PURE__ */ new Date(),
          amount: 0
        });
      });
      return res.json({ success: true, data: { isSubscriber: isSubscriberAuthoritative } });
    } catch (err) {
      console.error("[Server] Check-in error:", err);
      const { statusCode, message } = mapDomainErrorToStatus(err);
      return res.status(statusCode).json({ success: false, error: message });
    }
  });
  app2.post("/api/vehicles/check-out", requireAuth, async (req, res) => {
    try {
      const { garageId: bodyGarageId, vehicleId } = req.body || {};
      const callerRole = req.user?.role;
      let garageId = "";
      if (callerRole === "garage" || callerRole === "staff") {
        if (!req.user?.garageId) {
          return res.status(403).json({ success: false, error: "FORBIDDEN: Garage ID missing in session" });
        }
        if (bodyGarageId && bodyGarageId !== req.user.garageId) {
          return res.status(403).json({ success: false, error: "GARAGE_SCOPE_MISMATCH" });
        }
        garageId = req.user.garageId;
      } else if (callerRole === "admin") {
        garageId = bodyGarageId;
      } else {
        return res.status(403).json({ success: false, error: "FORBIDDEN: Role not authorized for vehicle operations" });
      }
      const staffId = req.user?.uid;
      if (!garageId || !vehicleId) {
        return res.status(400).json({ success: false, error: "MISSING_PARAMETERS" });
      }
      if (!adminDb) return res.status(500).json({ success: false, error: "ADMIN_SDK_NOT_INITIALIZED" });
      const getCairoDateKey = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(/* @__PURE__ */ new Date());
      let finalCost = 0;
      await adminDb.runTransaction(async (t) => {
        const garageRef = adminDb.doc(`garages/${garageId}`);
        const vehicleRef = adminDb.doc(`garages/${garageId}/vehicles/${vehicleId}`);
        const today = getCairoDateKey();
        const dailyStatsRef = adminDb.doc(`garages/${garageId}/daily_stats/${today}`);
        const [garageSnap, vehicleSnap, dailyStatsSnap] = await Promise.all([
          t.get(garageRef),
          t.get(vehicleRef),
          t.get(dailyStatsRef)
        ]);
        if (!garageSnap.exists) throw new Error("GARAGE_NOT_FOUND");
        if (!vehicleSnap.exists) throw new Error("VEHICLE_NOT_FOUND");
        const garageData = garageSnap.data() || {};
        const vehicleData = vehicleSnap.data() || {};
        const resolvedStaffName = req.user?.displayName || (callerRole === "admin" ? "\u0645\u062F\u064A\u0631 \u0627\u0644\u0646\u0638\u0627\u0645" : callerRole === "garage" ? garageData.name || "\u0645\u062F\u064A\u0631 \u0627\u0644\u062C\u0631\u0627\u062C" : "\u0645\u0648\u0638\u0641");
        if (vehicleData.status === "outside") {
          throw new Error("VEHICLE_ALREADY_OUTSIDE");
        }
        const cost = calculateVehicleCost(vehicleData, garageData);
        finalCost = cost;
        t.set(vehicleRef, {
          status: "outside",
          exitTime: /* @__PURE__ */ new Date(),
          totalCost: cost
        }, { merge: true });
        const isNewDay = garageData.lastTransactionDate !== today;
        t.set(garageRef, {
          totalRevenue: (garageData.totalRevenue || 0) + cost,
          totalVehiclesOut: (garageData.totalVehiclesOut || 0) + 1,
          todayRevenue: isNewDay ? cost : (garageData.todayRevenue || 0) + cost,
          todayCount: isNewDay ? 0 : garageData.todayCount || 0,
          lastTransactionDate: today,
          carsInside: Math.max(0, (garageData.carsInside || 0) - 1)
        }, { merge: true });
        if (!dailyStatsSnap.exists) {
          t.set(dailyStatsRef, {
            dateId: today,
            count: 0,
            revenue: cost,
            createdAt: /* @__PURE__ */ new Date()
          });
        } else {
          t.set(dailyStatsRef, { revenue: (dailyStatsSnap.data()?.revenue || 0) + cost }, { merge: true });
        }
        const logRef = adminDb.collection("activity_logs").doc();
        t.set(logRef, {
          garageId,
          garageName: garageData.name || "",
          staffId: staffId || null,
          staffName: resolvedStaffName,
          actionType: "check_out",
          plateNumber: vehicleData.plateNumber,
          plateNumberRaw: vehicleData.plateNumberRaw || vehicleId,
          entryTime: vehicleData.entryTime,
          type: vehicleData.type || "hourly",
          isSubscriber: !!vehicleData.isSubscriber,
          timestamp: /* @__PURE__ */ new Date(),
          amount: cost
        });
      });
      return res.json({ success: true, data: { cost: finalCost } });
    } catch (err) {
      console.error("[Server] Check-out error:", err);
      const { statusCode, message } = mapDomainErrorToStatus(err);
      return res.status(statusCode).json({ success: false, error: message });
    }
  });
  app2.post("/api/vehicles/delete", requireAuth, async (req, res) => {
    try {
      const { garageId: bodyGarageId, vehicleId, refundAmount } = req.body || {};
      const callerRole = req.user?.role;
      let garageId = "";
      if (callerRole === "garage" || callerRole === "staff") {
        if (!req.user?.garageId) {
          return res.status(403).json({ success: false, error: "FORBIDDEN: Garage ID missing in session" });
        }
        if (bodyGarageId && bodyGarageId !== req.user.garageId) {
          return res.status(403).json({ success: false, error: "GARAGE_SCOPE_MISMATCH" });
        }
        garageId = req.user.garageId;
      } else if (callerRole === "admin") {
        garageId = bodyGarageId;
      } else {
        return res.status(403).json({ success: false, error: "FORBIDDEN: Role not authorized for vehicle operations" });
      }
      const staffId = req.user?.uid;
      if (!garageId || !vehicleId) {
        return res.status(400).json({ success: false, error: "MISSING_PARAMETERS" });
      }
      if (!adminDb) return res.status(500).json({ success: false, error: "ADMIN_SDK_NOT_INITIALIZED" });
      const getCairoDateKey = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(/* @__PURE__ */ new Date());
      await adminDb.runTransaction(async (t) => {
        const todayYMD = getCairoDateKey();
        const garageRef = adminDb.doc(`garages/${garageId}`);
        const vehicleRef = adminDb.doc(`garages/${garageId}/vehicles/${vehicleId}`);
        const dailyStatsRef = adminDb.doc(`garages/${garageId}/daily_stats/${todayYMD}`);
        const [garageDoc, vehicleDoc, dailyStatsDoc] = await Promise.all([
          t.get(garageRef),
          t.get(vehicleRef),
          t.get(dailyStatsRef)
        ]);
        if (!garageDoc.exists) throw new Error("GARAGE_NOT_FOUND");
        if (!vehicleDoc.exists) throw new Error("VEHICLE_NOT_FOUND");
        const garageData = garageDoc.data() || {};
        const vehicleData = vehicleDoc.data() || {};
        const resolvedStaffName = req.user?.displayName || (callerRole === "admin" ? "\u0645\u062F\u064A\u0631 \u0627\u0644\u0646\u0638\u0627\u0645" : callerRole === "garage" ? garageData.name || "\u0645\u062F\u064A\u0631 \u0627\u0644\u062C\u0631\u0627\u062C" : "\u0645\u0648\u0638\u0641");
        if (callerRole !== "admin") {
          const entrantUid = vehicleData.enteredByUid || vehicleData.staffUid || vehicleData.staffId;
          const callerUid = req.user?.uid;
          const callerEntityId = req.user?.entityId;
          if (entrantUid && entrantUid !== callerUid && entrantUid !== callerEntityId) {
            throw new Error("CORRECTION_FORBIDDEN: Only the staff member who entered the vehicle can correct or delete it");
          }
        }
        const todayDeletions = garageData.lastDeletionDate === todayYMD ? garageData.dailyDeletionCount || 0 : 0;
        if (todayDeletions >= 3 && callerRole !== "admin") {
          throw new Error("reached_daily_deletion_limit");
        }
        const isSameRefundDay = garageData.lastRefundDate === todayYMD;
        const requestedRefund = Math.max(0, Number(refundAmount || 0));
        const maxEligibleRefund = vehicleData.status === "outside" && typeof vehicleData.totalCost === "number" ? Math.max(0, vehicleData.totalCost) : 0;
        const refundAmt = Math.min(requestedRefund, maxEligibleRefund);
        let enteredToday = false;
        if (vehicleData.status === "inside" && vehicleData.entryTime) {
          const entryTime = vehicleData.entryTime.toDate ? vehicleData.entryTime.toDate() : new Date(vehicleData.entryTime);
          if (!isNaN(entryTime.getTime())) {
            const entryDateKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo", year: "numeric", month: "2-digit", day: "2-digit" }).format(entryTime);
            enteredToday = entryDateKey === todayYMD;
          }
        }
        t.delete(vehicleRef);
        const updates = {
          isLocked: false,
          dailyDeletionCount: todayDeletions + 1,
          lastDeletionDate: todayYMD,
          dailyRefundCount: isSameRefundDay ? (garageData.dailyRefundCount || 0) + 1 : 1,
          lastRefundDate: todayYMD
        };
        if (refundAmt > 0) updates.balance = (garageData.balance || 0) + refundAmt;
        if (vehicleData.status === "inside") updates.carsInside = Math.max(0, (garageData.carsInside || 0) - 1);
        if (enteredToday) updates.todayCount = Math.max(0, (garageData.todayCount || 0) - 1);
        t.set(garageRef, updates, { merge: true });
        if (enteredToday && dailyStatsDoc.exists) {
          const prevCount = dailyStatsDoc.data()?.count || 0;
          if (prevCount > 0) t.set(dailyStatsRef, { count: prevCount - 1 }, { merge: true });
        }
        const logRef = adminDb.collection("activity_logs").doc();
        t.set(logRef, {
          garageId,
          garageName: garageData.name || "",
          staffId: staffId || vehicleData.staffId || null,
          staffName: resolvedStaffName,
          actionType: "delete_refund",
          plateNumber: `\u0645\u0633\u062D \u0644\u0648\u062D\u0629: ${vehicleData.plateNumber || vehicleId}`,
          timestamp: /* @__PURE__ */ new Date(),
          amount: refundAmt
        });
      });
      return res.json({ success: true });
    } catch (err) {
      console.error("[Server] Delete error:", err);
      const { statusCode, message } = mapDomainErrorToStatus(err);
      return res.status(statusCode).json({ success: false, error: message });
    }
  });
  app2.post("/api/admin/update-pin", requireAuth, async (req, res) => {
    try {
      if (req.user?.role !== "admin") {
        return res.status(403).json({ success: false, error: "FORBIDDEN: Admin role required" });
      }
      const { currentPin, newPin } = req.body || {};
      const normNewPin = cleanPin(newPin);
      if (!normNewPin || normNewPin.length < 4 || normNewPin.length > 6) {
        return res.status(400).json({ success: false, error: "INVALID_NEW_PIN: PIN must be 4 to 6 digits" });
      }
      const normCurrent = cleanPin(currentPin);
      if (!normCurrent) {
        return res.status(400).json({ success: false, error: "CURRENT_PIN_REQUIRED" });
      }
      if (!adminDb) {
        return res.status(500).json({ success: false, error: "ADMIN_SDK_NOT_INITIALIZED" });
      }
      const adminStoredPin = await getAdminPin();
      if (!adminStoredPin) {
        return res.status(500).json({ success: false, error: "ADMIN_PIN_NOT_CONFIGURED" });
      }
      const isMatch = verifyPinMatch(normCurrent, adminStoredPin);
      if (isMatch.matches !== true) {
        return res.status(400).json({ success: false, error: "CURRENT_PIN_INCORRECT" });
      }
      const pinCheck = await checkPinAvailabilityAcrossAll(normNewPin, "auth_pin");
      if (pinCheck.taken) {
        return res.status(400).json({
          success: false,
          error: "PIN_ALREADY_TAKEN",
          takenBy: { name: pinCheck.name || "", role: pinCheck.role }
        });
      }
      await saveEntityPin("admin_settings", "auth_pin", normNewPin);
      await adminDb.doc("admin_settings/auth_pin").set({
        pin: null,
        pinLookupHash: null,
        updatedAt: /* @__PURE__ */ new Date()
      }, { merge: true });
      return res.json({ success: true });
    } catch (e) {
      console.error("[Server Admin] Error in update-pin:", e);
      return res.status(500).json({ success: false, error: "SERVER_ERROR" });
    }
  });
  app2.post("/api/admin/update-system-config", requireAuth, async (req, res) => {
    try {
      if (req.user?.role !== "admin" && req.user?.role !== "supervisor") {
        return res.status(403).json({ success: false, error: "FORBIDDEN: Admin or Supervisor role required" });
      }
      if (!adminDb) {
        return res.status(500).json({ success: false, error: "ADMIN_SDK_NOT_INITIALIZED" });
      }
      const body = req.body || {};
      const updatePayload = {
        updatedAt: /* @__PURE__ */ new Date()
      };
      if (body.walletNumber !== void 0) {
        updatePayload.walletNumber = String(body.walletNumber).trim();
      }
      if (body.defaultTrialDays !== void 0) {
        updatePayload.defaultTrialDays = Number(body.defaultTrialDays) || 2;
      }
      if (body.warningDaysThreshold !== void 0) {
        updatePayload.warningDaysThreshold = Number(body.warningDaysThreshold) || 3;
      }
      if (body.monthlySubscribersFlatFee !== void 0) {
        updatePayload.monthlySubscribersFlatFee = Number(body.monthlySubscribersFlatFee) || 500;
      }
      if (body.monthlySubscribersSurchargePercent !== void 0) {
        updatePayload.monthlySubscribersSurchargePercent = Number(body.monthlySubscribersSurchargePercent) || 25;
      }
      if (body.referralFeePerRenewal !== void 0) {
        updatePayload.referralFeePerRenewal = Number(body.referralFeePerRenewal) || 100;
      }
      if (body.delegateMonthlyCommission !== void 0) {
        updatePayload.delegateMonthlyCommission = Number(body.delegateMonthlyCommission) || 100;
      }
      if (body.isMaintenanceMode !== void 0) {
        updatePayload.isMaintenanceMode = !!body.isMaintenanceMode;
      }
      if (body.maintenanceMessage !== void 0) {
        updatePayload.maintenanceMessage = String(body.maintenanceMessage).trim();
      }
      if (body.adminColor !== void 0) {
        updatePayload.adminColor = String(body.adminColor).trim();
      }
      if (body.subscriptionPrices !== void 0) {
        updatePayload.subscriptionPrices = body.subscriptionPrices;
      }
      await adminDb.doc("system_config/global").set(updatePayload, { merge: true });
      return res.json({ success: true });
    } catch (e) {
      console.error("[Server Admin] Error in update-system-config:", e);
      return res.status(500).json({ success: false, error: e?.message || "SERVER_ERROR" });
    }
  });
  app2.post("/api/admin/garages/:id/extend-fair-use", requireAuth, financialRateLimiter(), async (req, res) => {
    try {
      if (req.user?.role !== "admin") {
        return res.status(403).json({ success: false, error: "FORBIDDEN: Admin role required" });
      }
      const garageId = validateId(req.params.id, "garageId");
      const extraCars = Math.max(0, Number(req.body?.extraCars || 0));
      let resultFairUse = null;
      await adminDb.runTransaction(async (t) => {
        const garageRef = adminDb.doc(`garages/${garageId}`);
        const garageSnap = await t.get(garageRef);
        if (!garageSnap.exists) {
          throw new Error("GARAGE_NOT_FOUND");
        }
        const garageData = garageSnap.data() || {};
        const isUnlimited = Number(garageData.dailyCapacity || 0) === 0 || String(garageData.activePackageName || "").includes("\u0645\u0641\u062A\u0648\u062D");
        if (!isUnlimited) {
          throw new Error("NOT_AN_UNLIMITED_PACKAGE");
        }
        let fairUse = garageData.unlimitedFairUse;
        if (!fairUse || !fairUse.isActive) {
          fairUse = initializeFairUse(garageData.durationDays || 30, garageData.activePackageName || "");
        }
        resultFairUse = manualAdminExtendFairUse(fairUse, extraCars);
        t.set(garageRef, { unlimitedFairUse: resultFairUse }, { merge: true });
        const logRef = adminDb.collection("activity_logs").doc();
        t.set(logRef, {
          garageId,
          garageName: garageData.name || "",
          staffId: req.user?.uid || "admin",
          staffName: "\u0645\u062F\u064A\u0631 \u0627\u0644\u0646\u0638\u0627\u0645 (Admin)",
          actionType: "fair_use_admin_extended",
          plateNumber: `\u062A\u0645\u062F\u064A\u062F \u0627\u0633\u062A\u062B\u0646\u0627\u0626\u064A \u0644\u0644\u0627\u0633\u062A\u062E\u062F\u0627\u0645 \u0627\u0644\u0639\u0627\u062F\u0644 (+${extraCars > 0 ? extraCars : fairUse.stepAmount} \u0633\u064A\u0627\u0631\u0629)`,
          timestamp: /* @__PURE__ */ new Date(),
          details: {
            currentAllowance: resultFairUse.currentAllowance,
            maxAllowance: resultFairUse.maxAllowance,
            cycleCarsCount: resultFairUse.cycleCarsCount
          }
        });
      });
      return res.json({ success: true, unlimitedFairUse: resultFairUse });
    } catch (err) {
      console.error("[Server Admin] Error in extend-fair-use:", err);
      const { statusCode, message } = mapDomainErrorToStatus(err);
      return res.status(statusCode).json({ success: false, error: message });
    }
  });
  app2.post("/api/garages/create", requireAuth, financialRateLimiter(), async (req, res) => {
    try {
      const callerRole = req.user?.role;
      const callerUid = req.user?.uid;
      const callerName = req.user?.displayName || "";
      if (!callerRole || !["admin", "supervisor", "delegate"].includes(callerRole)) {
        return res.status(403).json({ success: false, error: "FORBIDDEN: Creation not permitted for role" });
      }
      const sanitized = sanitizePayload(req.body, ["name", "phone", "hourlyRate", "overnightRate", "pin", "billingModel", "isTrial", "trialDays", "defaultTrialDays", "dailyCapacity", "initialPackageId", "packages", "createdByDelegateId", "createdByDelegateName", "referrerId", "referrerName", "referredByGarageId", "referredByGarageName", "idempotencyKey"], false);
      const name = validateString(sanitized.name, "name", { min: 2, max: 100, required: true });
      const normPin = cleanPin(sanitized.pin);
      if (!normPin || normPin.length < 4 || normPin.length > 10) {
        return res.status(400).json({ success: false, error: "INVALID_PIN: PIN must be 4-10 digits" });
      }
      validateIdempotencyKey(sanitized.idempotencyKey || req.headers["idempotency-key"]);
      if (!adminDb) {
        return res.status(500).json({ success: false, error: "ADMIN_SDK_NOT_INITIALIZED" });
      }
      const pinCheck = await checkPinAvailabilityAcrossAll(normPin);
      if (pinCheck.taken) {
        return res.status(400).json({
          success: false,
          error: "PIN_ALREADY_TAKEN",
          takenBy: { name: pinCheck.name || "", role: pinCheck.role }
        });
      }
      const isTrial = sanitized.isTrial !== void 0 ? Boolean(sanitized.isTrial) : true;
      const rawTrialDays = sanitized.trialDays !== void 0 ? sanitized.trialDays : sanitized.defaultTrialDays;
      const trialDays = rawTrialDays !== void 0 ? validateNumber(rawTrialDays, "trialDays", { min: 1, max: 365, required: false }) : 15;
      const now = /* @__PURE__ */ new Date();
      let balanceExpiry;
      let dailyCapacity;
      let activePackageName;
      if (isTrial) {
        balanceExpiry = new Date(now.getTime() + (trialDays > 0 ? trialDays : 15) * 24 * 60 * 60 * 1e3);
        dailyCapacity = sanitized.dailyCapacity !== void 0 ? validateNumber(sanitized.dailyCapacity, "dailyCapacity", { min: 0, max: 1e4, required: false }) : 40;
        activePackageName = `\u0627\u0644\u0628\u0627\u0642\u0629 \u0627\u0644\u062A\u062C\u0631\u064A\u0628\u064A\u0629 (${trialDays} \u064A\u0648\u0645)`;
      } else {
        balanceExpiry = new Date(now.getTime() - 1e3);
        dailyCapacity = 0;
        activePackageName = "\u0628\u062F\u0648\u0646 \u0628\u0627\u0642\u0629";
      }
      const garageRef = adminDb.collection("garages").doc();
      const garageId = garageRef.id;
      await saveEntityPin("garages", garageId, normPin);
      const garageDoc = {
        name: name.trim(),
        phone: sanitized.phone ? String(sanitized.phone).trim() : "",
        hourlyRate: sanitized.hourlyRate !== void 0 ? validateNumber(sanitized.hourlyRate, "hourlyRate", { min: 0, max: 1e4, required: false }) : 0,
        overnightRate: sanitized.overnightRate !== void 0 ? validateNumber(sanitized.overnightRate, "overnightRate", { min: 0, max: 1e4, required: false }) : 0,
        billingModel: ["subscription", "trial"].includes(sanitized.billingModel) ? sanitized.billingModel : "subscription",
        status: callerRole === "delegate" || sanitized.createdByDelegateId || sanitized.isPending ? "pending" : "approved",
        hasMonthlySubscribers: false,
        createdAt: now,
        isTrial,
        dailyCapacity,
        activePackageName,
        packageName: activePackageName,
        balanceExpiry,
        balance: 0,
        carsInside: 0,
        carsInsideCount: 0,
        todayCount: 0,
        todayRevenue: 0,
        totalRevenue: 0,
        totalAdminRevenue: 0,
        totalVehiclesOut: 0,
        dailyDeletionCount: 0,
        dailyRefundCount: 0,
        totalReferralRewardDays: 0,
        totalGaragesReferredCount: 0,
        isLocked: false,
        isDeleting: false
      };
      if (callerRole === "delegate") {
        const delegateEntityId = req.user?.entityId || callerUid;
        garageDoc.createdByDelegateId = delegateEntityId;
        garageDoc.createdByDelegateName = sanitized.createdByDelegateName || callerName || "\u0627\u0644\u0645\u0646\u062F\u0648\u0628";
        garageDoc.referrerId = delegateEntityId;
        garageDoc.referrerName = sanitized.referrerName || sanitized.createdByDelegateName || callerName || "\u0627\u0644\u0645\u0646\u062F\u0648\u0628";
      } else if (sanitized.createdByDelegateId) {
        garageDoc.createdByDelegateId = sanitized.createdByDelegateId;
        garageDoc.createdByDelegateName = sanitized.createdByDelegateName || "\u0627\u0644\u0645\u0646\u062F\u0648\u0628";
        garageDoc.referrerId = sanitized.referrerId || sanitized.createdByDelegateId;
        garageDoc.referrerName = sanitized.referrerName || sanitized.createdByDelegateName || "\u0627\u0644\u0645\u0646\u062F\u0648\u0628";
      }
      if (sanitized.referredByGarageId) {
        garageDoc.referredByGarageId = sanitized.referredByGarageId;
        garageDoc.referredByGarageName = sanitized.referredByGarageName || "";
      }
      await garageRef.set(garageDoc);
      const logRef = adminDb.collection("activity_logs").doc();
      await logRef.set({
        garageId,
        garageName: garageDoc.name,
        staffId: callerUid || null,
        staffName: callerName || (isTrial ? "\u0627\u0644\u0646\u0638\u0627\u0645 (\u062A\u0641\u0639\u064A\u0644 \u062A\u062C\u0631\u064A\u0628\u064A)" : "\u0627\u0644\u0625\u062F\u0627\u0631\u0629 (\u0625\u0646\u0634\u0627\u0621 \u062C\u0631\u0627\u062C)"),
        actionType: isTrial ? "recharge" : "create",
        plateNumber: isTrial ? `\u062A\u0641\u0639\u064A\u0644 \u0627\u0644\u0628\u0627\u0642\u0629 \u0627\u0644\u062A\u062C\u0631\u064A\u0628\u064A\u0629 (${trialDays} \u064A\u0648\u0645)` : `\u0625\u0646\u0634\u0627\u0621 \u062D\u0633\u0627\u0628 \u062C\u0631\u0627\u062C \u062C\u062F\u064A\u062F (\u0628\u062F\u0648\u0646 \u0628\u0627\u0642\u0629)`,
        timestamp: now,
        amount: 0,
        details: {
          packageName: isTrial ? `\u0627\u0644\u0628\u0627\u0642\u0629 \u0627\u0644\u062A\u062C\u0631\u064A\u0628\u064A\u0629 (${trialDays} \u064A\u0648\u0645)` : activePackageName,
          durationDays: isTrial ? trialDays : 0,
          carsCount: dailyCapacity,
          revenueAmount: 0
        }
      });
      return res.json({ success: true, id: garageId });
    } catch (e) {
      console.error("[Server Garage] Error in create garage:", e);
      const { statusCode, message } = mapDomainErrorToStatus(e);
      return res.status(statusCode).json({ success: false, error: message });
    }
  });
  app2.post("/api/supervisors/create", requireAuth, async (req, res) => {
    try {
      if (req.user?.role !== "admin") {
        return res.status(403).json({ success: false, error: "FORBIDDEN: Admin role required" });
      }
      const { name, phone, pin, permissions } = req.body || {};
      const normName = validateString(name, "name", { min: 2, max: 100, required: true });
      const normPin = cleanPin(pin);
      if (!normPin || normPin.length < 4 || normPin.length > 10) {
        return res.status(400).json({ success: false, error: "INVALID_PIN: PIN must be 4-10 digits" });
      }
      if (!adminDb) {
        return res.status(500).json({ success: false, error: "ADMIN_SDK_NOT_INITIALIZED" });
      }
      const pinCheck = await checkPinAvailabilityAcrossAll(normPin);
      if (pinCheck.taken) {
        return res.status(400).json({
          success: false,
          error: "PIN_ALREADY_TAKEN",
          takenBy: { name: pinCheck.name || "", role: pinCheck.role }
        });
      }
      const supRef = adminDb.collection("supervisors").doc();
      const supId = supRef.id;
      await saveEntityPin("supervisors", supId, normPin);
      await supRef.set({
        name: normName.trim(),
        phone: phone ? String(phone).trim() : "",
        permissions: permissions || {},
        createdAt: /* @__PURE__ */ new Date()
      });
      return res.json({ success: true, id: supId });
    } catch (e) {
      console.error("[Server Supervisor] Error in create:", e);
      return res.status(500).json({ success: false, error: e?.message || "SERVER_ERROR" });
    }
  });
  app2.post("/api/delegates/create", requireAuth, async (req, res) => {
    try {
      if (req.user?.role !== "admin") {
        return res.status(403).json({ success: false, error: "FORBIDDEN: Admin role required" });
      }
      const { name, phone, pin, commissionRate, commissions, defaultTrialDays } = req.body || {};
      const normName = validateString(name, "name", { min: 2, max: 100, required: true });
      const normPhone = phone ? String(phone).trim() : "";
      const normPin = cleanPin(pin);
      if (!normPin || normPin.length < 4 || normPin.length > 10) {
        return res.status(400).json({ success: false, error: "INVALID_PIN: PIN must be 4-10 digits" });
      }
      if (!adminDb) {
        return res.status(500).json({ success: false, error: "ADMIN_SDK_NOT_INITIALIZED" });
      }
      const pinCheck = await checkPinAvailabilityAcrossAll(normPin);
      if (pinCheck.taken) {
        return res.status(400).json({
          success: false,
          error: "PIN_ALREADY_TAKEN",
          takenBy: { name: pinCheck.name || "", role: pinCheck.role }
        });
      }
      const delRef = adminDb.collection("delegates").doc();
      const delId = delRef.id;
      await saveEntityPin("delegates", delId, normPin);
      await delRef.set({
        name: normName.trim(),
        phone: normPhone,
        commissionRate: commissionRate !== void 0 ? Number(commissionRate) : 10,
        commissions: commissions || { daily: 5, weekly: 15, biweekly: 25, monthly: 50 },
        defaultTrialDays: defaultTrialDays !== void 0 ? Number(defaultTrialDays) : 15,
        balance: 0,
        totalEarned: 0,
        createdAt: /* @__PURE__ */ new Date()
      });
      return res.json({ success: true, id: delId });
    } catch (e) {
      console.error("[Server Delegate] Error in create:", e);
      return res.status(500).json({ success: false, error: e?.message || "SERVER_ERROR" });
    }
  });
  app2.post("/api/staff/create", requireAuth, async (req, res) => {
    try {
      const { name, phone, pin, garageId, role, permissions } = req.body || {};
      const callerRole = req.user?.role;
      const callerGarageId = req.user?.garageId || (callerRole === "garage" ? req.user?.entityId : null);
      if (callerRole !== "admin" && callerRole !== "supervisor" && (!callerGarageId || callerGarageId !== garageId)) {
        return res.status(403).json({ success: false, error: "FORBIDDEN: Cannot add staff to this garage" });
      }
      const normName = validateString(name, "name", { min: 2, max: 100, required: true });
      const normPin = cleanPin(pin);
      if (!normPin || normPin.length < 4 || normPin.length > 10) {
        return res.status(400).json({ success: false, error: "INVALID_PIN: PIN must be 4-10 digits" });
      }
      if (!adminDb) {
        return res.status(500).json({ success: false, error: "ADMIN_SDK_NOT_INITIALIZED" });
      }
      const pinCheck = await checkPinAvailabilityAcrossAll(normPin);
      if (pinCheck.taken) {
        return res.status(400).json({
          success: false,
          error: "PIN_ALREADY_TAKEN",
          takenBy: { name: pinCheck.name || "", role: pinCheck.role }
        });
      }
      const staffRef = adminDb.collection("staff").doc();
      const staffId = staffRef.id;
      await saveEntityPin("staff", staffId, normPin);
      await staffRef.set({
        name: normName.trim(),
        phone: phone ? String(phone).trim() : "",
        garageId,
        role: role || "worker",
        permissions: permissions || {},
        createdAt: /* @__PURE__ */ new Date()
      });
      return res.json({ success: true, id: staffId });
    } catch (e) {
      console.error("[Server Staff] Error in create:", e);
      return res.status(500).json({ success: false, error: e?.message || "SERVER_ERROR" });
    }
  });
  app2.post("/api/people/update-pin", requireAuth, async (req, res) => {
    try {
      const { entityType, entityId, newPin } = req.body || {};
      if (!entityType || !entityId || !["garages", "supervisors", "delegates", "staff"].includes(entityType)) {
        return res.status(400).json({ success: false, error: "INVALID_ENTITY_TYPE" });
      }
      const normNewPin = cleanPin(newPin);
      if (!normNewPin || normNewPin.length < 4 || normNewPin.length > 10) {
        return res.status(400).json({ success: false, error: "INVALID_NEW_PIN: PIN must be 4 to 10 digits" });
      }
      if (!adminDb) {
        return res.status(500).json({ success: false, error: "ADMIN_SDK_NOT_INITIALIZED" });
      }
      const callerRole = req.user?.role;
      const callerGarageId = req.user?.garageId || (callerRole === "garage" ? req.user?.entityId : null);
      if (callerRole !== "admin" && callerRole !== "supervisor") {
        if (entityType === "staff") {
          const targetStaffSnap = await adminDb.collection("staff").doc(entityId).get();
          if (!targetStaffSnap.exists || targetStaffSnap.data()?.garageId !== callerGarageId) {
            return res.status(403).json({ success: false, error: "FORBIDDEN: Cannot manage staff outside your garage" });
          }
        } else if (entityType === "garages" && entityId !== callerGarageId) {
          return res.status(403).json({ success: false, error: "FORBIDDEN: Cannot update PIN of other garages" });
        } else if (entityType !== "staff" && entityType !== "garages") {
          return res.status(403).json({ success: false, error: "FORBIDDEN: Insufficient permissions" });
        }
      }
      const pinCheck = await checkPinAvailabilityAcrossAll(normNewPin, entityId);
      if (pinCheck.taken) {
        return res.status(400).json({
          success: false,
          error: "PIN_ALREADY_TAKEN",
          takenBy: { name: pinCheck.name || "", role: pinCheck.role }
        });
      }
      await saveEntityPin(entityType, entityId, normNewPin);
      const targetDocRef = adminDb.collection(entityType).doc(entityId);
      const docSnap = await targetDocRef.get();
      if (docSnap.exists) {
        const data = docSnap.data() || {};
        const updates = { updatedAt: /* @__PURE__ */ new Date() };
        if ("pin" in data) updates.pin = null;
        if ("ownerPin" in data) updates.ownerPin = null;
        if ("adminPin" in data) updates.adminPin = null;
        if ("pinLookupHash" in data) updates.pinLookupHash = null;
        await targetDocRef.set(updates, { merge: true });
      }
      return res.json({ success: true });
    } catch (e) {
      console.error("[Server People] Error in update-pin:", e);
      return res.status(500).json({ success: false, error: e?.message || "SERVER_ERROR" });
    }
  });
  app2.post("/api/transactions/use-referral-reward", requireAuth, financialRateLimiter(), async (req, res) => {
    try {
      const sanitized = sanitizePayload(req.body, ["garageId", "idempotencyKey"], false);
      const garageId = validateId(sanitized.garageId, "garageId", true);
      const idempotencyKey = validateIdempotencyKey(sanitized.idempotencyKey || req.headers["idempotency-key"]);
      const callerUid = req.user?.uid;
      const callerRole = req.user?.role;
      const callerGarageId = req.user?.garageId || (callerRole === "garage" ? req.user?.entityId : null);
      if (callerRole === "garage" && callerGarageId !== garageId) {
        return sendApiError(res, 403, "FORBIDDEN", "FORBIDDEN: Cannot claim reward for another garage", req.correlationId);
      }
      if (callerRole === "staff") {
        return sendApiError(res, 403, "FORBIDDEN", "FORBIDDEN: Staff cannot claim referral rewards", req.correlationId);
      }
      if (!adminDb) {
        return sendApiError(res, 500, "INTERNAL_ERROR", "ADMIN_SDK_NOT_INITIALIZED", req.correlationId);
      }
      let claimedDays = 0;
      await adminDb.runTransaction(async (t) => {
        const { isDuplicate, cachedResult } = await checkIdempotencyInTransaction(t, idempotencyKey, "/api/transactions/use-referral-reward", callerUid);
        if (isDuplicate) {
          claimedDays = cachedResult?.daysClaimed || 0;
          return;
        }
        const garageRef = adminDb.doc(`garages/${garageId}`);
        const garageSnap = await t.get(garageRef);
        if (!garageSnap.exists) {
          throw new Error("GARAGE_NOT_FOUND");
        }
        const garageData = garageSnap.data() || {};
        const rewardDays = Math.max(0, Number(garageData.totalReferralRewardDays || 0));
        if (rewardDays <= 0) {
          throw new Error("NO_REFERRAL_REWARDS_AVAILABLE");
        }
        claimedDays = rewardDays;
        let baseDate = /* @__PURE__ */ new Date();
        const currentExpiry = garageData.balanceExpiry;
        if (currentExpiry) {
          const expDate = currentExpiry.toDate ? currentExpiry.toDate() : new Date(currentExpiry);
          if (expDate > baseDate) {
            baseDate = expDate;
          }
        }
        baseDate.setDate(baseDate.getDate() + rewardDays);
        t.update(garageRef, {
          balanceExpiry: baseDate,
          totalReferralRewardDays: 0,
          isLocked: false,
          lastReferralClaimAt: /* @__PURE__ */ new Date()
        });
        const logRef = adminDb.collection("activity_logs").doc();
        t.set(logRef, {
          garageId,
          garageName: garageData.name || "",
          staffId: callerUid || null,
          staffName: callerRole === "admin" ? "\u0627\u0644\u0625\u062F\u0627\u0631\u0629" : "\u0635\u0627\u062D\u0628 \u0627\u0644\u062C\u0631\u0627\u062C (\u0627\u0633\u062A\u062E\u062F\u0627\u0645 \u0631\u0635\u064A\u062F \u0627\u0644\u0645\u0643\u0627\u0641\u0622\u062A)",
          actionType: "recharge",
          plateNumber: `\u0627\u0633\u062A\u062E\u062F\u0627\u0645 \u0645\u0643\u0627\u0641\u0623\u0629 \u0625\u062D\u0627\u0644\u0629 \u2014 \u062A\u0645\u062F\u064A\u062F \u0627\u0644\u0627\u0634\u062A\u0631\u0627\u0643 +${rewardDays} ${rewardDays === 1 ? "\u064A\u0648\u0645 \u0645\u062C\u0627\u0646\u064A" : rewardDays === 2 ? "\u064A\u0648\u0645\u0627\u0646 \u0645\u062C\u0627\u0646\u064A\u0627\u0646" : "\u0623\u064A\u0627\u0645 \u0645\u062C\u0627\u0646\u064A\u0629"}`,
          timestamp: /* @__PURE__ */ new Date(),
          amount: 0,
          details: {
            type: "use_referral_reward",
            claimedDays: rewardDays,
            newExpiry: baseDate.toISOString()
          }
        });
        storeIdempotencyInTransaction(t, idempotencyKey, { daysClaimed: claimedDays }, "/api/transactions/use-referral-reward", callerUid);
      });
      return res.json({ success: true, daysClaimed: claimedDays });
    } catch (e) {
      console.error("[Server Reward] Error in use-referral-reward:", e);
      const { statusCode, code, message } = mapDomainErrorToStatus(e);
      return sendApiError(res, statusCode, code, message, req.correlationId);
    }
  });
  app2.post("/api/garages/delete", requireAuth, financialRateLimiter(), async (req, res) => {
    try {
      const callerRole = req.user?.role;
      if (!callerRole || !["admin", "supervisor"].includes(callerRole)) {
        return res.status(403).json({ success: false, error: "FORBIDDEN: Admin or Supervisor role required" });
      }
      const sanitized = sanitizePayload(req.body, ["garageId", "idempotencyKey"], false);
      const garageId = validateId(sanitized.garageId, "garageId", true);
      if (!adminDb) {
        return res.status(500).json({ success: false, error: "ADMIN_SDK_NOT_INITIALIZED" });
      }
      const garageRef = adminDb.doc(`garages/${garageId}`);
      const garageSnap = await garageRef.get();
      if (!garageSnap.exists) {
        return res.status(404).json({ success: false, error: "GARAGE_NOT_FOUND" });
      }
      const garageData = garageSnap.data() || {};
      const subcollections = ["vehicles", "subscribers", "daily_counts", "daily_stats"];
      for (const sub of subcollections) {
        const subCollRef = adminDb.collection(`garages/${garageId}/${sub}`);
        const subSnap = await subCollRef.get();
        if (!subSnap.empty) {
          const batch = adminDb.batch();
          subSnap.docs.forEach((d) => batch.delete(d.ref));
          await batch.commit();
        }
      }
      await garageRef.delete();
      const logRef = adminDb.collection("activity_logs").doc();
      await logRef.set({
        garageId,
        garageName: garageData.name || "",
        staffId: req.user?.uid || null,
        staffName: req.user?.displayName || "\u0627\u0644\u0625\u062F\u0627\u0631\u0629",
        actionType: "garage_delete",
        plateNumber: `\u062D\u0630\u0641 \u062C\u0631\u0627\u062C: ${garageData.name || garageId}`,
        timestamp: /* @__PURE__ */ new Date(),
        amount: 0,
        details: {
          deletedByRole: callerRole,
          deletedByUid: req.user?.uid || null
        }
      });
      return res.json({ success: true });
    } catch (e) {
      console.error("[Server Garage] Error in delete garage:", e);
      const { statusCode, message } = mapDomainErrorToStatus(e);
      return res.status(statusCode).json({ success: false, error: message });
    }
  });
  app2.post("/api/supervisors/update", requireAuth, async (req, res) => {
    try {
      if (req.user?.role !== "admin") {
        return res.status(403).json({ success: false, error: "FORBIDDEN: Admin role required" });
      }
      const { id, name, phone, permissions } = req.body || {};
      if (!id || !adminDb) return res.status(400).json({ success: false, error: "INVALID_REQUEST" });
      const updates = { updatedAt: /* @__PURE__ */ new Date() };
      if (name) updates.name = String(name).trim();
      if (phone !== void 0) updates.phone = String(phone).trim();
      if (permissions) updates.permissions = permissions;
      await adminDb.collection("supervisors").doc(id).update(updates);
      return res.json({ success: true });
    } catch (e) {
      console.error("[Server Supervisor] Error in update:", e);
      return res.status(500).json({ success: false, error: e?.message || "SERVER_ERROR" });
    }
  });
  app2.post("/api/supervisors/delete", requireAuth, async (req, res) => {
    try {
      if (req.user?.role !== "admin") {
        return res.status(403).json({ success: false, error: "FORBIDDEN: Admin role required" });
      }
      const { id } = req.body || {};
      if (!id || !adminDb) return res.status(400).json({ success: false, error: "INVALID_REQUEST" });
      await adminDb.collection("supervisors").doc(id).delete();
      return res.json({ success: true });
    } catch (e) {
      console.error("[Server Supervisor] Error in delete:", e);
      return res.status(500).json({ success: false, error: e?.message || "SERVER_ERROR" });
    }
  });
  app2.post("/api/delegates/update", requireAuth, async (req, res) => {
    try {
      if (!["admin", "supervisor"].includes(req.user?.role || "")) {
        return res.status(403).json({ success: false, error: "FORBIDDEN: Admin or Supervisor role required" });
      }
      const { id, name, phone, commissionRate, commissions, defaultTrialDays } = req.body || {};
      if (!id || !adminDb) return res.status(400).json({ success: false, error: "INVALID_REQUEST" });
      const updates = { updatedAt: /* @__PURE__ */ new Date() };
      if (name) updates.name = String(name).trim();
      if (phone !== void 0) updates.phone = String(phone).trim();
      if (commissionRate !== void 0) updates.commissionRate = Number(commissionRate);
      if (commissions) updates.commissions = commissions;
      if (defaultTrialDays !== void 0) updates.defaultTrialDays = Number(defaultTrialDays);
      await adminDb.collection("delegates").doc(id).update(updates);
      return res.json({ success: true });
    } catch (e) {
      console.error("[Server Delegate] Error in update:", e);
      return res.status(500).json({ success: false, error: e?.message || "SERVER_ERROR" });
    }
  });
  app2.post("/api/delegates/delete", requireAuth, async (req, res) => {
    try {
      if (!["admin", "supervisor"].includes(req.user?.role || "")) {
        return res.status(403).json({ success: false, error: "FORBIDDEN: Admin or Supervisor role required" });
      }
      const { id } = req.body || {};
      if (!id || !adminDb) return res.status(400).json({ success: false, error: "INVALID_REQUEST" });
      await adminDb.collection("delegates").doc(id).delete();
      return res.json({ success: true });
    } catch (e) {
      console.error("[Server Delegate] Error in delete:", e);
      return res.status(500).json({ success: false, error: e?.message || "SERVER_ERROR" });
    }
  });
  app2.post("/api/staff/update", requireAuth, async (req, res) => {
    try {
      const { id, name, phone, role, permissions } = req.body || {};
      if (!id || !adminDb) return res.status(400).json({ success: false, error: "INVALID_REQUEST" });
      const callerRole = req.user?.role;
      const callerGarageId = req.user?.garageId || (callerRole === "garage" ? req.user?.entityId : null);
      if (callerRole !== "admin" && callerRole !== "supervisor") {
        const targetStaffSnap = await adminDb.collection("staff").doc(id).get();
        if (!targetStaffSnap.exists || targetStaffSnap.data()?.garageId !== callerGarageId) {
          return res.status(403).json({ success: false, error: "FORBIDDEN: Cannot update staff outside your garage" });
        }
      }
      const updates = { updatedAt: /* @__PURE__ */ new Date() };
      if (name) updates.name = String(name).trim();
      if (phone !== void 0) updates.phone = String(phone).trim();
      if (role) updates.role = role;
      if (permissions) updates.permissions = permissions;
      await adminDb.collection("staff").doc(id).update(updates);
      return res.json({ success: true });
    } catch (e) {
      console.error("[Server Staff] Error in update:", e);
      return res.status(500).json({ success: false, error: e?.message || "SERVER_ERROR" });
    }
  });
  app2.post("/api/staff/delete", requireAuth, async (req, res) => {
    try {
      const { id } = req.body || {};
      if (!id || !adminDb) return res.status(400).json({ success: false, error: "INVALID_REQUEST" });
      const callerRole = req.user?.role;
      const callerGarageId = req.user?.garageId || (callerRole === "garage" ? req.user?.entityId : null);
      if (callerRole !== "admin" && callerRole !== "supervisor") {
        const targetStaffSnap = await adminDb.collection("staff").doc(id).get();
        if (!targetStaffSnap.exists || targetStaffSnap.data()?.garageId !== callerGarageId) {
          return res.status(403).json({ success: false, error: "FORBIDDEN: Cannot delete staff outside your garage" });
        }
      }
      await adminDb.collection("staff").doc(id).delete();
      return res.json({ success: true });
    } catch (e) {
      console.error("[Server Staff] Error in delete:", e);
      return res.status(500).json({ success: false, error: e?.message || "SERVER_ERROR" });
    }
  });
  app2.post("/api/garages/update", requireAuth, async (req, res) => {
    try {
      const { id, ...data } = req.body || {};
      if (!id || !adminDb) return res.status(400).json({ success: false, error: "INVALID_REQUEST" });
      const callerRole = req.user?.role;
      const callerGarageId = req.user?.garageId || (callerRole === "garage" ? req.user?.entityId : null);
      if (callerRole !== "admin" && callerRole !== "supervisor" && callerGarageId !== id) {
        return res.status(403).json({ success: false, error: "FORBIDDEN: Cannot update another garage" });
      }
      const updates = { updatedAt: /* @__PURE__ */ new Date() };
      const allowedKeys = [
        "name",
        "phone",
        "hourlyRate",
        "overnightRate",
        "monthlySubscriptionFee",
        "billingModel",
        "commissionPerVehicle",
        "status",
        "isLocked",
        "isMaintenanceMode",
        "maintenanceMessage",
        "warningDaysThreshold",
        "assignedDelegateId",
        "currentSessionId"
      ];
      for (const key of allowedKeys) {
        if (key in data && data[key] !== void 0) {
          updates[key] = data[key];
        }
      }
      await adminDb.collection("garages").doc(id).update(updates);
      return res.json({ success: true });
    } catch (e) {
      console.error("[Server Garage] Error in update:", e);
      return res.status(500).json({ success: false, error: e?.message || "SERVER_ERROR" });
    }
  });
  app2.post("/api/garages/recalculate-cars-inside", requireAuth, async (req, res) => {
    try {
      const { garageId } = req.body || {};
      if (!garageId || !adminDb) return res.status(400).json({ success: false, error: "INVALID_REQUEST" });
      const vehSnap = await adminDb.collection(`garages/${garageId}/vehicles`).where("status", "==", "inside").get();
      const actualCount = vehSnap.size;
      await adminDb.collection("garages").doc(garageId).update({ carsInside: actualCount });
      return res.json({ success: true, count: actualCount });
    } catch (e) {
      console.error("[Server Garage] Error in recalculate-cars-inside:", e);
      return res.status(500).json({ success: false, error: e?.message || "SERVER_ERROR" });
    }
  });
  app2.post("/api/admin/packages/create", requireAuth, async (req, res) => {
    try {
      if (req.user?.role !== "admin") {
        return res.status(403).json({ success: false, error: "FORBIDDEN: Admin role required" });
      }
      if (!adminDb) return res.status(500).json({ success: false, error: "ADMIN_SDK_NOT_INITIALIZED" });
      const pkgData = {
        ...req.body,
        isActive: true,
        createdAt: /* @__PURE__ */ new Date()
      };
      const docRef = await adminDb.collection("packages").add(pkgData);
      return res.json({ success: true, id: docRef.id });
    } catch (e) {
      console.error("[Server Packages] Error in create:", e);
      return res.status(500).json({ success: false, error: e?.message || "SERVER_ERROR" });
    }
  });
  app2.post("/api/admin/packages/delete", requireAuth, async (req, res) => {
    try {
      if (req.user?.role !== "admin") {
        return res.status(403).json({ success: false, error: "FORBIDDEN: Admin role required" });
      }
      const { id } = req.body || {};
      if (!id || !adminDb) return res.status(400).json({ success: false, error: "INVALID_REQUEST" });
      await adminDb.collection("packages").doc(id).update({ isActive: false });
      return res.json({ success: true });
    } catch (e) {
      console.error("[Server Packages] Error in delete:", e);
      return res.status(500).json({ success: false, error: e?.message || "SERVER_ERROR" });
    }
  });
  app2.post("/api/admin/announcements/create", requireAuth, async (req, res) => {
    try {
      if (req.user?.role !== "admin") {
        return res.status(403).json({ success: false, error: "FORBIDDEN: Admin role required" });
      }
      if (!adminDb) return res.status(500).json({ success: false, error: "ADMIN_SDK_NOT_INITIALIZED" });
      const data = {
        ...req.body,
        createdAt: /* @__PURE__ */ new Date()
      };
      const docRef = await adminDb.collection("announcements").add(data);
      return res.json({ success: true, id: docRef.id });
    } catch (e) {
      console.error("[Server Announcements] Error in create:", e);
      return res.status(500).json({ success: false, error: e?.message || "SERVER_ERROR" });
    }
  });
  app2.post("/api/admin/announcements/delete", requireAuth, async (req, res) => {
    try {
      if (req.user?.role !== "admin") {
        return res.status(403).json({ success: false, error: "FORBIDDEN: Admin role required" });
      }
      const { id } = req.body || {};
      if (!id || !adminDb) return res.status(400).json({ success: false, error: "INVALID_REQUEST" });
      await adminDb.collection("announcements").doc(id).delete();
      return res.json({ success: true });
    } catch (e) {
      console.error("[Server Announcements] Error in delete:", e);
      return res.status(500).json({ success: false, error: e?.message || "SERVER_ERROR" });
    }
  });
  app2.post("/api/admin/announcements/toggle", requireAuth, async (req, res) => {
    try {
      if (req.user?.role !== "admin") {
        return res.status(403).json({ success: false, error: "FORBIDDEN: Admin role required" });
      }
      const { id, isActive } = req.body || {};
      if (!id || !adminDb) return res.status(400).json({ success: false, error: "INVALID_REQUEST" });
      await adminDb.collection("announcements").doc(id).update({ isActive: Boolean(isActive) });
      return res.json({ success: true });
    } catch (e) {
      console.error("[Server Announcements] Error in toggle:", e);
      return res.status(500).json({ success: false, error: e?.message || "SERVER_ERROR" });
    }
  });
  app2.post("/api/admin/coupons/create", requireAuth, async (req, res) => {
    try {
      if (req.user?.role !== "admin") {
        return res.status(403).json({ success: false, error: "FORBIDDEN: Admin role required" });
      }
      if (!adminDb) return res.status(500).json({ success: false, error: "ADMIN_SDK_NOT_INITIALIZED" });
      const couponData = {
        ...req.body,
        usedCount: 0,
        createdAt: /* @__PURE__ */ new Date()
      };
      const docRef = await adminDb.collection("coupons").add(couponData);
      return res.json({ success: true, id: docRef.id });
    } catch (e) {
      console.error("[Server Coupons] Error in create:", e);
      return res.status(500).json({ success: false, error: e?.message || "SERVER_ERROR" });
    }
  });
  app2.post("/api/admin/coupons/update", requireAuth, async (req, res) => {
    try {
      if (req.user?.role !== "admin") {
        return res.status(403).json({ success: false, error: "FORBIDDEN: Admin role required" });
      }
      const { id, ...data } = req.body || {};
      if (!id || !adminDb) return res.status(400).json({ success: false, error: "INVALID_REQUEST" });
      await adminDb.collection("coupons").doc(id).update(data);
      return res.json({ success: true });
    } catch (e) {
      console.error("[Server Coupons] Error in update:", e);
      return res.status(500).json({ success: false, error: e?.message || "SERVER_ERROR" });
    }
  });
  app2.post("/api/admin/coupons/delete", requireAuth, async (req, res) => {
    try {
      if (req.user?.role !== "admin") {
        return res.status(403).json({ success: false, error: "FORBIDDEN: Admin role required" });
      }
      const { id } = req.body || {};
      if (!id || !adminDb) return res.status(400).json({ success: false, error: "INVALID_REQUEST" });
      await adminDb.collection("coupons").doc(id).delete();
      return res.json({ success: true });
    } catch (e) {
      console.error("[Server Coupons] Error in delete:", e);
      return res.status(500).json({ success: false, error: e?.message || "SERVER_ERROR" });
    }
  });
  app2.post("/api/subscribers/add", requireAuth, async (req, res) => {
    try {
      const { garageId, subscriberData } = req.body || {};
      if (!garageId || !subscriberData || !adminDb) return res.status(400).json({ success: false, error: "INVALID_REQUEST" });
      const docRef = adminDb.collection(`garages/${garageId}/subscribers`).doc();
      await docRef.set({
        ...subscriberData,
        id: docRef.id,
        createdAt: /* @__PURE__ */ new Date()
      });
      return res.json({ success: true, id: docRef.id });
    } catch (e) {
      console.error("[Server Subscribers] Error in add:", e);
      return res.status(500).json({ success: false, error: e?.message || "SERVER_ERROR" });
    }
  });
  app2.post("/api/subscribers/renew", requireAuth, async (req, res) => {
    try {
      const { garageId, subscriberId, newDates } = req.body || {};
      if (!garageId || !subscriberId || !newDates || !adminDb) return res.status(400).json({ success: false, error: "INVALID_REQUEST" });
      await adminDb.collection(`garages/${garageId}/subscribers`).doc(subscriberId).update({
        startDate: newDates.startDate,
        endDate: newDates.endDate
      });
      return res.json({ success: true });
    } catch (e) {
      console.error("[Server Subscribers] Error in renew:", e);
      return res.status(500).json({ success: false, error: e?.message || "SERVER_ERROR" });
    }
  });
  app2.post("/api/subscribers/update", requireAuth, async (req, res) => {
    try {
      const { garageId, subscriberId, subscriberData } = req.body || {};
      if (!garageId || !subscriberId || !subscriberData || !adminDb) return res.status(400).json({ success: false, error: "INVALID_REQUEST" });
      await adminDb.collection(`garages/${garageId}/subscribers`).doc(subscriberId).update(subscriberData);
      return res.json({ success: true });
    } catch (e) {
      console.error("[Server Subscribers] Error in update:", e);
      return res.status(500).json({ success: false, error: e?.message || "SERVER_ERROR" });
    }
  });
  app2.post("/api/subscribers/delete", requireAuth, async (req, res) => {
    try {
      const { garageId, subscriberId } = req.body || {};
      if (!garageId || !subscriberId || !adminDb) return res.status(400).json({ success: false, error: "INVALID_REQUEST" });
      await adminDb.collection(`garages/${garageId}/subscribers`).doc(subscriberId).delete();
      return res.json({ success: true });
    } catch (e) {
      console.error("[Server Subscribers] Error in delete:", e);
      return res.status(500).json({ success: false, error: e?.message || "SERVER_ERROR" });
    }
  });
  app2.post("/api/recharge-requests/create", requireAuth, async (req, res) => {
    try {
      if (!adminDb) return res.status(500).json({ success: false, error: "ADMIN_SDK_NOT_INITIALIZED" });
      const cleanData = Object.fromEntries(
        Object.entries(req.body || {}).filter(([_, v]) => v !== void 0)
      );
      const docRef = await adminDb.collection("recharge_requests").add({
        ...cleanData,
        status: "pending",
        createdAt: /* @__PURE__ */ new Date()
      });
      return res.json({ success: true, id: docRef.id });
    } catch (e) {
      console.error("[Server RechargeRequests] Error in create:", e);
      return res.status(500).json({ success: false, error: e?.message || "SERVER_ERROR" });
    }
  });
  app2.post("/api/activity-logs/add", requireAuth, async (req, res) => {
    try {
      if (!adminDb) return res.status(500).json({ success: false, error: "ADMIN_SDK_NOT_INITIALIZED" });
      const { id, timestamp, ...rest } = req.body || {};
      const docRef = await adminDb.collection("activity_logs").add({
        ...rest,
        timestamp: /* @__PURE__ */ new Date()
      });
      return res.json({ success: true, id: docRef.id });
    } catch (e) {
      console.error("[Server ActivityLogs] Error in add:", e);
      return res.status(500).json({ success: false, error: e?.message || "SERVER_ERROR" });
    }
  });
  app2.use("/api", (_req, res) => {
    res.status(404).json({ success: false, error: "API route not found" });
  });
  app2.use((err, _req, res, _next) => {
    console.error("[Express Global Error]:", err);
    res.status(500).json({ success: false, error: err.message || "INTERNAL_SERVER_ERROR" });
  });
  return app2;
}
var app = createApp();

// api/index.ts
var index_default = app;
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

module.exports = module.exports.default || module.exports;
