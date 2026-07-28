const crypto = require('crypto');
const config = require('../config');
const db = require('../db/database');
const { generateReply } = require('../ai/generate');
const { replyMessage, pushMessage } = require('./reply');
const { classifyStage } = require('../utils/stage');

function validateSignature(body, signature) {
  const hash = crypto
    .createHmac('SHA256', config.line.channelSecret)
    .update(body)
    .digest('base64');
  return hash === signature;
}

async function handleWebhook(req, res) {
  console.log('[Webhook] 收到請求');
  const signature = req.headers['x-line-signature'];
  if (!signature || !validateSignature(req.rawBody, signature)) {
    console.log('[Webhook] 簽章驗證失敗');
    return res.status(401).json({ error: 'Invalid signature' });
  }
  console.log('[Webhook] 簽章驗證通過');

  res.status(200).json({ ok: true });

  const events = req.body.events || [];
  console.log('[Webhook] 事件數量:', events.length);
  for (const event of events) {
    console.log('[Webhook] 事件類型:', event.type, event.message?.type);
    try {
      await processEvent(event);
      console.log('[Webhook] 事件處理完成');
    } catch (err) {
      console.error('[Webhook] 處理錯誤:', err.message, err.stack);
    }
  }
}

async function processEvent(event) {
  if (event.type !== 'message' || event.message.type !== 'text') return;

  const userId = event.source.userId;
  const text = event.message.text;
  const messageId = event.message.id;
  const replyToken = event.replyToken;
  console.log('[Process] 收到文字訊息:', text, '來自:', userId);

  let displayName = null;
  try {
    const { getProfile } = require('./reply');
    const profile = await getProfile(userId);
    displayName = profile.displayName;
    console.log('[Process] 取得用戶名稱:', displayName);
  } catch (e) {
    console.log('[Process] 取得用戶名稱失敗:', e.message);
  }

  const contact = db.findOrCreateContact(userId, displayName);
  console.log('[Process] 聯絡人:', contact ? contact.id : 'null');
  const inboundId = db.saveMessage(contact.id, 'inbound', 'user', text, messageId, null);

  const messageCount = db.getMessageCount(contact.id);
  const daysSinceFirst = Math.floor(
    (Date.now() - new Date(contact.first_message_at).getTime()) / (1000 * 60 * 60 * 24)
  );
  const newStage = classifyStage(contact.stage, messageCount, daysSinceFirst);
  if (newStage !== contact.stage) {
    db.updateContactStage(contact.id, newStage);
  }

  const messages = db.getMessages(contact.id);
  const aiReply = await generateReply(messages, newStage, contact);

  const mode = db.getSetting('reply_mode') || 'semi-auto';
  console.log('[Process] 目前模式:', mode);

  if (mode === 'auto') {
    console.log('[Process] 全自動 → 直接回覆');
    await replyMessage(replyToken, aiReply);
    db.saveMessage(contact.id, 'outbound', 'ai', aiReply, null, null);
  } else {
    console.log('[Process] 半自動 → 儲存草稿, inboundId:', inboundId);
    db.saveDraft(contact.id, inboundId, aiReply);
    console.log('[Process] 草稿已儲存');
  }
}

module.exports = { handleWebhook };
