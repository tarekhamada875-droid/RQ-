const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

code = code.replace(
  "interface AuthRequest extends express.Request { user?: { uid: string; role: string; garageId?: string; } }\n  }",
  "interface AuthRequest extends express.Request { user?: { uid: string; role: string; garageId?: string; } }"
);

fs.writeFileSync('server.ts', code);
