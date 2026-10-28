# Local UI fixtures

This is an isolated test path for browser and workflow checks. It uses Firebase Auth and Firestore emulators only. It must not be pointed at a production project.

## Seed synthetic records

The seeder refuses to run unless both emulator environment variables are present:

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
GCLOUD_PROJECT=demo-rq-ui-fixtures \
npm exec firebase emulators:exec --only auth,firestore \
  --project demo-rq-ui-fixtures \
  "npm run ui-fixtures:seed"
```

The command starts the emulators, writes seven synthetic records, prints their fixture IDs, and shuts the emulators down. It does not call the production Worker or Firebase project. The fixture PINs are deliberately separate from any operator or production PIN and are not stored in deployment secrets.

## Run the app against emulators

Start the emulators in one terminal:

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
GCLOUD_PROJECT=demo-rq-ui-fixtures \
npm exec firebase emulators:start --only auth,firestore \
  --project demo-rq-ui-fixtures
```

In another terminal, seed the running emulators and start the local app with the explicit opt-in flag:

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
GCLOUD_PROJECT=demo-rq-ui-fixtures \
npm run ui-fixtures:seed

VITE_RQ_USE_EMULATORS=true \
VITE_RQ_EMULATOR_PROJECT_ID=demo-rq-ui-fixtures \
VITE_RQ_EMULATOR_HOST=127.0.0.1 \
VITE_RQ_AUTH_EMULATOR_PORT=9099 \
VITE_RQ_FIRESTORE_EMULATOR_PORT=8080 \
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 \
FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 \
GCLOUD_PROJECT=demo-rq-ui-fixtures \
npm run dev
```

The frontend connects to localhost only when `VITE_RQ_USE_EMULATORS=true`. Ordinary development and production builds retain their existing Firebase target. The server-side emulator variables keep the local API on the same synthetic project.

## Safety boundary

The seed data is synthetic and disposable, and its authentication fixtures use the application's exact eight-digit PIN contract. Do not use the provided operator PINs in this workflow, and do not remove the emulator guard or replace the demo project ID with a live project. Destructive button tests should be added only after the browser harness is connected to this emulator path and can verify the expected records before and after each action.
