const fs = require('fs');
let code = fs.readFileSync('firestore.rules', 'utf8');

// 1. Remove direct client writes for vehicles (they should use the new API endpoints)
code = code.replace(
  /match \/vehicles\/\{vehicleId\} \{[\s\S]*?allow delete: [^\n]+\n\s*\}/m,
  "match /vehicles/{vehicleId} {\n        allow read: if isSignedIn();\n        allow create, update, delete: if false; // Replaced by server-side API\n      }"
);

// 2. Remove direct client writes for daily_stats inside garages
code = code.replace(
  /match \/daily_stats\/\{dateId\} \{[\s\S]*?allow delete: if isAdmin\(\);\n\s*\}/m,
  "match /daily_stats/{dateId} {\n        allow read: if isSignedIn();\n        allow create, update, delete: if false; // Server-only\n      }"
);

code = code.replace(
  /match \/garages\/\{garageId\}\/daily_stats\/\{dateId\} \{[\s\S]*?allow delete: if isAdmin\(\);\n\s*\}/m,
  "match /garages/{garageId}/daily_stats/{dateId} {\n      allow read: if isSignedIn();\n      allow create, update, delete: if false; // Server-only\n    }"
);

// 3. Make activity_logs server-only for writing
code = code.replace(
  /match \/activity_logs\/\{logId\} \{[\s\S]*?\}/m,
  "match /activity_logs/{logId} {\n      allow read: if isSignedIn();\n      allow create, update, delete: if false; // Server-only\n    }"
);

// 4. Update recharge_requests if it exists to restrict creation or make it strict
code = code.replace(
  /match \/recharge_requests\/\{requestId\} \{[\s\S]*?\}/m,
  "match /recharge_requests/{requestId} {\n      allow read: if isSignedIn();\n      allow create: if isSignedIn(); // Garages can request\n      allow update, delete: if false; // Server-only (Approve/Reject)\n    }"
);

fs.writeFileSync('firestore.rules', code);
