const fs = require('fs');
let code = fs.readFileSync('firestore.rules', 'utf8');

code = code.replace(
  /match \/private_pins\/\{docId\} \{[\s\S]*?allow write: if isAdmin\(\);\n\s*\}/m,
  "match /private_pins/{docId} {\n      allow read, write: if false; // Server-only\n    }"
);

fs.writeFileSync('firestore.rules', code);
