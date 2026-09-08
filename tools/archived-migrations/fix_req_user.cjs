const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(
  /declare global \{[\s\S]*?\}\s*\}\s*\}/m,
  "interface AuthRequest extends express.Request { user?: { uid: string; role: string; garageId?: string; } }"
);

// We need to replace `req: express.Request` with `req: AuthRequest` or `req: any` in the middlewares.
code = code.replace(/const requireAuth = async \(req: express\.Request/g, "const requireAuth = async (req: AuthRequest");

code = code.replace(/app\.post\('\/api\/transactions\/admin-topup-balance', requireAuth, async \(req, res\)/g, "app.post('/api/transactions/admin-topup-balance', requireAuth, async (req: AuthRequest, res: any)");
code = code.replace(/app\.post\('\/api\/transactions\/garage-self-subscribe', requireAuth, async \(req, res\)/g, "app.post('/api/transactions/garage-self-subscribe', requireAuth, async (req: AuthRequest, res: any)");
code = code.replace(/app\.post\('\/api\/transactions\/recharge-garage', requireAuth, async \(req, res\)/g, "app.post('/api/transactions/recharge-garage', requireAuth, async (req: AuthRequest, res: any)");
code = code.replace(/app\.post\('\/api\/transactions\/approve-recharge-request', requireAuth, async \(req, res\)/g, "app.post('/api/transactions/approve-recharge-request', requireAuth, async (req: AuthRequest, res: any)");
code = code.replace(/app\.post\('\/api\/transactions\/reject-recharge-request', requireAuth, async \(req, res\)/g, "app.post('/api/transactions/reject-recharge-request', requireAuth, async (req: AuthRequest, res: any)");
code = code.replace(/app\.post\('\/api\/vehicles\/check-in', requireAuth, async \(req, res\)/g, "app.post('/api/vehicles/check-in', requireAuth, async (req: AuthRequest, res: any)");
code = code.replace(/app\.post\('\/api\/vehicles\/check-out', requireAuth, async \(req, res\)/g, "app.post('/api/vehicles/check-out', requireAuth, async (req: AuthRequest, res: any)");
code = code.replace(/app\.post\('\/api\/vehicles\/delete', requireAuth, async \(req, res\)/g, "app.post('/api/vehicles/delete', requireAuth, async (req: AuthRequest, res: any)");

fs.writeFileSync('server.ts', code);
