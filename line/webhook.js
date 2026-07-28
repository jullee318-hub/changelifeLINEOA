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
  if (event.type === 'follow') {
    await handleFollow(event);
    return;
  }

  if (event.type === 'message' && event.message.type !== 'text') {
    await handleNonTextMessage(event);
    return;
  }

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

  const allMessages = db.getMessages(contact.id);
  const messages = allMessages.slice(-20);
  console.log('[Process] 對話歷史:', allMessages.length, '則，取最近', messages.length, '則');

  let aiReply;
  try {
    aiReply = await generateReply(messages, newStage, contact);
    console.log('[Process] AI 回覆產生成功，長度:', aiReply.length);
  } catch (aiErr) {
    console.error('[Process] AI 產生回覆失敗:', aiErr.message, aiErr.stack);
    aiReply = '收到你的訊息了 😊\n品慧老師會盡快回覆你，請稍等一下 ✨';
  }

  const mode = db.getSetting('reply_mode') || 'semi-auto';
  console.log('[Process] 目前模式:', mode);

  if (mode === 'auto') {
    console.log('[Process] 全自動 → 直接回覆');
    try {
      await replyMessage(replyToken, aiReply);
      db.saveMessage(contact.id, 'outbound', 'ai', aiReply, null, null);
    } catch (sendErr) {
      console.error('[Process] LINE 發送失敗:', sendErr.message);
      try {
        await pushMessage(userId, aiReply);
        db.saveMessage(contact.id, 'outbound', 'ai', aiReply, null, null);
        console.log('[Process] 改用 pushMessage 成功');
      } catch (pushErr) {
        console.error('[Process] pushMessage 也失敗:', pushErr.message);
      }
    }
  } else {
    console.log('[Process] 半自動 → 儲存草稿, inboundId:', inboundId);
    db.saveDraft(contact.id, inboundId, aiReply);
    console.log('[Process] 草稿已儲存');
  }
}

async function handleFollow(event) {
  const userId = event.source.userId;
  console.log('[Follow] 新好友加入:', userId);

  let displayName = null;
  try {
    const { getProfile } = require('./reply');
    const profile = await getProfile(userId);
    displayName = profile.displayName;
  } catch (e) {
    console.log('[Follow] 取得名稱失敗:', e.message);
  }

  const contact = db.findOrCreateContact(userId, displayName);
  const name = displayName || '你';

  const welcome = `嗨～${name} ✨\n\n` +
    `歡迎來到意轉靈升工作坊！\n` +
    `你會走到這裡，一定是有什麼在心裡推著你。\n\n` +
    `不管是想了解自己多一點、\n` +
    `還是正在找一個出口——\n` +
    `這裡都會接住你 🤍\n\n` +
    `有任何想聊的，隨時跟我說！\n` +
    `品慧老師和團隊都在這裡陪你 💫`;

  try {
    await replyMessage(event.replyToken, welcome);
    db.saveMessage(contact.id, 'outbound', 'ai', welcome, null, null);
    console.log('[Follow] 歡迎訊息已送出');
  } catch (err) {
    console.error('[Follow] 歡迎訊息失敗:', err.message);
  }
}

async function handleNonTextMessage(event) {
  const userId = event.source.userId;
  const msgType = event.message.type;
  console.log('[NonText] 收到非文字訊息:', msgType, '來自:', userId);

  let displayName = null;
  try {
    const { getProfile } = require('./reply');
    const profile = await getProfile(userId);
    displayName = profile.displayName;
  } catch (e) {}

  const contact = db.findOrCreateContact(userId, displayName);

  const typeLabels = {
    image: '圖片',
    video: '影片',
    audio: '語音',
    sticker: '貼圖',
    location: '位置',
    file: '檔案',
  };
  const label = typeLabels[msgType] || '訊息';
  db.saveMessage(contact.id, 'inbound', 'user', `[${label}]`, event.message.id, null);

  let reply;
  if (msgType === 'sticker') {
    reply = '收到你的貼圖了 😊\n有什麼想聊的，隨時打字跟我說～';
  } else if (msgType === 'image') {
    reply = '收到你的圖片了 ✨\n如果想跟我分享什麼，也可以用文字說說看，我會更能理解你的狀況～';
  } else if (msgType === 'audio') {
    reply = '收到你的語音了 🎵\n目前我比較擅長文字對話，如果方便的話，可以打字跟我說嗎？這樣我能更仔細地回覆你 🤍';
  } else {
    reply = `收到了 😊\n有什麼想聊的，歡迎用文字跟我說，我會認真回覆你 ✨`;
  }

  try {
    await replyMessage(event.replyToken, reply);
    db.saveMessage(contact.id, 'outbound', 'ai', reply, null, null);
  } catch (err) {
    console.error('[NonText] 回覆失敗:', err.message);
  }
}

module.exports = { handleWebhook };
