const path = require('path');
const db = require('../db/database');
const { pushMessage } = require('../line/reply');
const { requireAuth } = require('./auth');

function setupRoutes(app) {
  app.get('/dashboard', requireAuth, (req, res) => {
    res.redirect('/dashboard/inbox');
  });

  app.get('/dashboard/inbox', requireAuth, (req, res) => {
    res.sendFile('inbox.html', { root: path.join(__dirname, 'views') });
  });

  app.get('/dashboard/conversation/:contactId', requireAuth, (req, res) => {
    res.sendFile('conversation.html', { root: path.join(__dirname, 'views') });
  });

  app.get('/dashboard/settings', requireAuth, (req, res) => {
    res.sendFile('settings.html', { root: path.join(__dirname, 'views') });
  });

  app.get('/dashboard/courses', requireAuth, (req, res) => {
    res.sendFile('courses.html', { root: path.join(__dirname, 'views') });
  });

  app.get('/api/me', requireAuth, (req, res) => {
    res.json(req.session.operator);
  });

  app.get('/api/conversations', requireAuth, (req, res) => {
    res.json(db.listContacts());
  });

  app.get('/api/conversations/:contactId', requireAuth, (req, res) => {
    const contact = db.getContact(parseInt(req.params.contactId));
    if (!contact) return res.status(404).json({ error: '找不到此聯絡人' });
    const messages = db.getMessages(contact.id);
    res.json({ contact, messages });
  });

  app.get('/api/drafts', requireAuth, (req, res) => {
    res.json(db.getPendingDrafts());
  });

  app.post('/api/drafts/:draftId/approve', requireAuth, async (req, res) => {
    try {
      const draftId = parseInt(req.params.draftId);
      const draft = db.getDraft(draftId);
      if (!draft || draft.status !== 'pending') {
        return res.status(404).json({ error: '草稿不存在或已處理' });
      }
      db.updateDraft(draft.id, 'approved', req.session.operator.username, null);
      const content = draft.ai_content;
      db.saveMessage(draft.contact_id, 'outbound', 'ai', content, null, req.session.operator.username);
      await pushMessage(draft.line_user_id, content);
      res.json({ ok: true });
    } catch (err) {
      console.error('[Draft] 審核失敗:', err.message, err.stack);
      res.status(500).json({ error: '送出失敗：' + err.message });
    }
  });

  app.post('/api/drafts/:draftId/edit', requireAuth, async (req, res) => {
    try {
      const draftId = parseInt(req.params.draftId);
      const draft = db.getDraft(draftId);
      if (!draft || draft.status !== 'pending') {
        return res.status(404).json({ error: '草稿不存在或已處理' });
      }
      const { content } = req.body;
      if (!content) return res.status(400).json({ error: '請提供修改後的內容' });
      db.updateDraft(draft.id, 'approved', req.session.operator.username, content);
      db.saveMessage(draft.contact_id, 'outbound', 'operator', content, null, req.session.operator.username);
      await pushMessage(draft.line_user_id, content);
      res.json({ ok: true });
    } catch (err) {
      console.error('[Draft] 修改送出失敗:', err.message);
      res.status(500).json({ error: '送出失敗：' + err.message });
    }
  });

  app.post('/api/drafts/:draftId/reject', requireAuth, (req, res) => {
    try {
      const draftId = parseInt(req.params.draftId);
      const draft = db.getDraft(draftId);
      if (!draft || draft.status !== 'pending') {
        return res.status(404).json({ error: '草稿不存在或已處理' });
      }
      db.updateDraft(draft.id, 'rejected', req.session.operator.username, null);
      res.json({ ok: true });
    } catch (err) {
      console.error('[Draft] 拒絕失敗:', err.message);
      res.status(500).json({ error: '操作失敗：' + err.message });
    }
  });

  app.post('/api/conversations/:contactId/send', requireAuth, async (req, res) => {
    try {
      const contact = db.getContact(parseInt(req.params.contactId));
      if (!contact) return res.status(404).json({ error: '找不到此聯絡人' });
      const { content } = req.body;
      if (!content) return res.status(400).json({ error: '請提供訊息內容' });
      db.saveMessage(contact.id, 'outbound', 'operator', content, null, req.session.operator.username);
      await pushMessage(contact.line_user_id, content);
      res.json({ ok: true });
    } catch (err) {
      console.error('[Send] 推送失敗:', err.message);
      res.status(500).json({ error: '送出失敗：' + err.message });
    }
  });

  app.get('/api/debug', requireAuth, (req, res) => {
    const mode = db.getSetting('reply_mode');
    const drafts = db.getPendingDrafts();
    const contacts = db.listContacts();
    console.log('[Debug] 模式:', mode, '待審核草稿:', drafts.length, '聯絡人:', contacts.length);
    res.json({ mode, drafts_count: drafts.length, drafts, contacts_count: contacts.length });
  });

  app.get('/api/settings', requireAuth, (req, res) => {
    res.json({
      reply_mode: db.getSetting('reply_mode') || 'semi-auto',
      ai_model: db.getSetting('ai_model') || 'claude-haiku-4-5-20251001',
    });
  });

  app.post('/api/settings', requireAuth, (req, res) => {
    const { reply_mode } = req.body;
    if (reply_mode && ['auto', 'semi-auto'].includes(reply_mode)) {
      db.setSetting('reply_mode', reply_mode);
    }
    res.json({ ok: true });
  });

  app.post('/api/contacts/:contactId/stage', requireAuth, (req, res) => {
    const { stage } = req.body;
    if (!['catch', 'warm', 'convert'].includes(stage)) {
      return res.status(400).json({ error: '無效的階段' });
    }
    db.updateContactStage(parseInt(req.params.contactId), stage);
    res.json({ ok: true });
  });

  app.post('/api/contacts/:contactId/notes', requireAuth, (req, res) => {
    const { notes } = req.body;
    db.updateContactNotes(parseInt(req.params.contactId), notes || '');
    res.json({ ok: true });
  });

  app.get('/dashboard/broadcast', requireAuth, (req, res) => {
    res.sendFile('broadcast.html', { root: path.join(__dirname, 'views') });
  });

  app.get('/api/broadcasts', requireAuth, (req, res) => {
    res.json(db.listBroadcasts());
  });

  app.post('/api/broadcasts', requireAuth, (req, res) => {
    try {
      const { content, target, target_stage, scheduled_at, contact_ids } = req.body;
      if (!content || !content.trim()) return res.status(400).json({ error: '請輸入訊息內容' });
      if (!scheduled_at) return res.status(400).json({ error: '請選擇發送時間' });
      if (target === 'pick' && (!contact_ids || contact_ids.length === 0)) {
        return res.status(400).json({ error: '請至少勾選一位聯絡人' });
      }

      const contacts = db.getContactsByTarget(target || 'all', target_stage, contact_ids);
      if (contacts.length === 0) return res.status(400).json({ error: '沒有符合條件的聯絡人' });

      const id = db.createBroadcast(
        content.trim(),
        target || 'all',
        target_stage || null,
        contact_ids || null,
        scheduled_at,
        req.session.operator.username
      );
      console.log('[Broadcast] 建立排程 #' + id + '，預計發送給 ' + contacts.length + ' 人');
      res.json({ ok: true, id, recipient_count: contacts.length });
    } catch (err) {
      console.error('[Broadcast] 建立失敗:', err.message);
      res.status(500).json({ error: '建立失敗：' + err.message });
    }
  });

  app.delete('/api/broadcasts/:id', requireAuth, (req, res) => {
    db.deleteBroadcast(parseInt(req.params.id));
    res.json({ ok: true });
  });

  app.get('/api/broadcast/preview', requireAuth, (req, res) => {
    const { target, target_stage } = req.query;
    const contacts = db.getContactsByTarget(target || 'all', target_stage);
    res.json({ count: contacts.length, contacts: contacts.map(c => ({ id: c.id, display_name: c.display_name, stage: c.stage })) });
  });

  // --- courses ---

  app.get('/api/courses', requireAuth, (req, res) => {
    const raw = db.getSetting('courses');
    let courses = [];
    if (raw) { try { courses = JSON.parse(raw); } catch (e) {} }
    res.json(courses);
  });

  app.post('/api/courses', requireAuth, (req, res) => {
    const { courses } = req.body;
    if (!Array.isArray(courses)) return res.status(400).json({ error: '格式錯誤' });
    db.setSetting('courses', JSON.stringify(courses));
    res.json({ ok: true });
  });

  // --- PWA ---

  app.get('/manifest.json', (req, res) => {
    res.json({
      name: '意轉靈升工作坊',
      short_name: '意轉靈升',
      description: 'LINE 自動回覆管理系統',
      start_url: '/dashboard',
      display: 'standalone',
      background_color: '#1A2F3A',
      theme_color: '#1A2F3A',
      icons: [
        { src: '/icon-192.svg', sizes: '192x192', type: 'image/svg+xml' },
        { src: '/icon-512.svg', sizes: '512x512', type: 'image/svg+xml' },
      ],
    });
  });

  app.get('/icon-192.svg', (req, res) => {
    res.type('image/svg+xml').send(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192"><rect width="192" height="192" rx="40" fill="#1A2F3A"/><text x="96" y="116" text-anchor="middle" font-size="80" font-family="sans-serif" fill="#2E8B7A">意</text></svg>`);
  });

  app.get('/icon-512.svg', (req, res) => {
    res.type('image/svg+xml').send(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" rx="100" fill="#1A2F3A"/><text x="256" y="310" text-anchor="middle" font-size="220" font-family="sans-serif" fill="#2E8B7A">意</text></svg>`);
  });

  app.get('/sw.js', (req, res) => {
    res.type('application/javascript').send(`
self.addEventListener('install', e => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  e.respondWith(fetch(e.request).catch(() => new Response('離線中，請檢查網路連線', { status: 503 })));
});
    `.trim());
  });
}

module.exports = { setupRoutes };
