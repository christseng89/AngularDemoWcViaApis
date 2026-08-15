import { createDb } from './db';
import { createApp } from './app';

const PORT = process.env.PORT ? Number(process.env.PORT) : 4100;
const DB_PATH = process.env.DB_PATH ?? 'balance-component.sqlite';

const db = createDb(DB_PATH);
const app = createApp(db);

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`balance-component-service listening on :${PORT} (db=${DB_PATH})`);
});
