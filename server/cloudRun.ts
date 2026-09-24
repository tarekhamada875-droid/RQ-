import { createApp } from './app';

const port = Number(process.env.PORT) || 8080;
const app = createApp();

app.listen(port, '0.0.0.0', () => {
  console.log(`[RQ Cloud Run API] Listening on 0.0.0.0:${port}; V3 functional backend active`);
});
