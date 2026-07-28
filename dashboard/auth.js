const crypto = require('crypto');
const db = require('../db/database');

function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function verifyPassword(password, hash) {
  return hashPassword(password) === hash;
}

function requireAuth(req, res, next) {
  if (req.session && req.session.operator) return next();
  if (req.headers.accept && req.headers.accept.includes('application/json')) {
    return res.status(401).json({ error: '請先登入' });
  }
  res.redirect('/dashboard/login');
}

function setupAuth(app) {
  app.get('/dashboard/login', (req, res) => {
    res.sendFile('login.html', { root: __dirname + '/views' });
  });

  app.post('/dashboard/login', (req, res) => {
    const { username, password } = req.body;
    const operator = db.getOperator(username);
    if (!operator || !verifyPassword(password, operator.password_hash)) {
      return res.status(401).json({ error: '帳號或密碼錯誤' });
    }
    req.session.operator = { id: operator.id, username: operator.username };
    res.json({ ok: true });
  });

  app.post('/dashboard/logout', (req, res) => {
    req.session.destroy();
    res.json({ ok: true });
  });
}

module.exports = { hashPassword, requireAuth, setupAuth };
