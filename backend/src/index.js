import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import authRouter from './routes/auth.js';
import leadsRouter from './routes/leads.js';
import reportsRouter from './routes/reports.js';
import inboxRouter from './routes/inbox.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '25mb' }));
app.use('/uploads', express.static(path.join(__dirname, '../../uploads')));

app.get('/api/health', (_, res) => res.json({ ok:true, app:'VittaHub', version:'1.0.0' }));
app.use('/api/auth', authRouter);
app.use('/api/leads', leadsRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/inbox', inboxRouter);

app.listen(PORT, () => {
  console.log(`\n💎 VittaHub API em http://localhost:${PORT}`);
  console.log(`   miecio@vittalissaude.com.br / vittalis123`);
  console.log(`   nagila@vittalissaude.com.br / vittalis123\n`);
});
