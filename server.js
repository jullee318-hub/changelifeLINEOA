const express = require('express');
const session = require('express-session');
const config = require('./config');
const db = require('./db/database');
const { handleWebhook } = require('./line/webhook');
const { setupAuth, hashPassword } = require('./dashboard/auth');
const { setupRoutes } = require('./dashboard/routes');
const { startScheduler } = require('./scheduler');

async function start() {
  await db.init();

  for (const op of config.operators) {
    if (op.name && op.password) {
      db.createOperator(op.name, hashPassword(op.password));
    }
  }

  const app = express();
  app.set('trust proxy', 1);

  app.post('/webhook', express.raw({ type: '*/*' }), (req, res, next) => {
    req.rawBody = req.body.toString('utf-8');
    try { req.body = JSON.parse(req.rawBody); } catch (e) { req.body = {}; }
    next();
  }, handleWebhook);

  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  app.use(session({
    secret: config.session.secret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production' && process.env.RAILWAY_ENVIRONMENT ? true : false,
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000,
    },
  }));

  setupAuth(app);
  setupRoutes(app);

  app.get('/', (req, res) => res.redirect('/dashboard'));

  app.listen(config.port, () => {
    console.log(`意轉靈升 LINE 自動回覆系統已啟動 → http://localhost:${config.port}`);
    console.log(`Webhook URL: https://your-domain/webhook`);
    console.log(`管理後台: http://localhost:${config.port}/dashboard`);
    startScheduler();
  });
}

start().catch(err => {
  console.error('啟動失敗:', err);
  process.exit(1);
});
