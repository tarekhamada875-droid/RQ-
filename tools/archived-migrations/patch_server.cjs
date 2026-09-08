const fs = require('fs');

let code = fs.readFileSync('server.ts', 'utf8');

// 1. Admin Topup Balance
code = code.replace(
  "app.post('/api/transactions/admin-topup-balance', async (req, res) => {",
  "app.post('/api/transactions/admin-topup-balance', requireAuth, async (req, res) => {\n    if (req.user?.role !== 'admin') return res.status(403).json({ success: false, error: 'ADMIN_ONLY' });"
);

// 2. Garage Self Subscribe
code = code.replace(
  "app.post('/api/transactions/garage-self-subscribe', async (req, res) => {",
  "app.post('/api/transactions/garage-self-subscribe', requireAuth, async (req, res) => {\n    const userRole = req.user?.role;\n    const userGarageId = req.user?.garageId;"
);

// Fix garage-self-subscribe body reading and package fetching
code = code.replace(
  "const { garageId, packageId, packageData: clientPkgData, firebaseIdToken } = req.body || {};",
  "const { garageId: bodyGarageId, packageId } = req.body || {};\n      const garageId = userRole === 'garage' ? userGarageId : bodyGarageId;\n      if (userRole === 'garage' && userGarageId !== bodyGarageId) return res.status(403).json({ success: false, error: 'UNAUTHORIZED_GARAGE_ACCESS' });"
);

code = code.replace(
  "// Resolve package info\n        let pkg = clientPkgData || null;\n        if (packageId && !pkg) {\n          const pkgRef = adminDb.doc(`packages/${packageId}`);\n          const pkgSnap = await t.get(pkgRef);\n          if (pkgSnap.exists) {\n            pkg = { id: pkgSnap.id, ...pkgSnap.data() };\n          }\n        }",
  "// Resolve package info entirely from server\n        let pkg = null;\n        if (packageId) {\n          const pkgRef = adminDb.doc(`packages/${packageId}`);\n          const pkgSnap = await t.get(pkgRef);\n          if (pkgSnap.exists) {\n            pkg = { id: pkgSnap.id, ...pkgSnap.data() };\n          }\n        }"
);

// 3. Recharge Garage
code = code.replace(
  "app.post('/api/transactions/recharge-garage', async (req, res) => {",
  "app.post('/api/transactions/recharge-garage', requireAuth, async (req, res) => {\n    if (req.user?.role === 'garage') return res.status(403).json({ success: false, error: 'GARAGE_CANNOT_RECHARGE_OTHERS' });"
);

// Remove the old auth logic in recharge-garage
code = code.replace(
  "const { garageId, packageId, pkg, adminDetails, firebaseIdToken, sessionId, uid, role } = req.body || {};",
  "const { garageId, packageId, adminDetails } = req.body || {};\n      const callerUid = req.user?.uid;\n      const callerRole = req.user?.role;"
);

code = code.replace(
  /\/\/ 1\. Session & Permission Verification[\s\S]*?\/\/ Check caller active session lock/m,
  "// 1. Session & Permission Verification\n      // Auth and role verified by requireAuth middleware\n      \n      // Check caller active session lock"
);

code = code.replace(
  "// 2. Package Data Parsing & Sanitization\n      const packageObj = pkg || {};",
  "// 2. Package Data Parsing & Sanitization (Server Authoritative)\n      let packageObj: any = {};\n      if (packageId) {\n        const pkgSnap = await adminDb.doc(`packages/${packageId}`).get();\n        if (pkgSnap.exists) packageObj = { id: pkgSnap.id, ...pkgSnap.data() };\n      }\n      if (!packageObj.id) return res.status(400).json({ success: false, error: 'PACKAGE_NOT_FOUND' });"
);


// 4. Approve / Reject Recharge Requests
code = code.replace(
  "app.post('/api/transactions/approve-recharge-request', async (req, res) => {",
  "app.post('/api/transactions/approve-recharge-request', requireAuth, async (req, res) => {\n    if (req.user?.role !== 'admin' && req.user?.role !== 'supervisor') return res.status(403).json({ success: false, error: 'ADMIN_OR_SUPERVISOR_ONLY' });\n    const callerUid = req.user?.uid;\n    const callerRole = req.user?.role;"
);
code = code.replace(
  "const { requestId, firebaseIdToken, uid, role } = req.body || {};",
  "const { requestId } = req.body || {};"
);
code = code.replace(
  /let verifiedUid = '';[\s\S]*?const callerRole = role || 'admin';/m,
  "// Auth verified by middleware"
);

code = code.replace(
  "app.post('/api/transactions/reject-recharge-request', async (req, res) => {",
  "app.post('/api/transactions/reject-recharge-request', requireAuth, async (req, res) => {\n    if (req.user?.role !== 'admin' && req.user?.role !== 'supervisor') return res.status(403).json({ success: false, error: 'ADMIN_OR_SUPERVISOR_ONLY' });\n    const callerUid = req.user?.uid;\n    const callerRole = req.user?.role;"
);
code = code.replace(
  "const { requestId, reason, firebaseIdToken, uid, role } = req.body || {};",
  "const { requestId, reason } = req.body || {};"
);

fs.writeFileSync('server.ts', code);
