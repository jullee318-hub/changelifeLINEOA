const config = require('../config');

async function lineApiFetch(endpoint, body) {
  const res = await fetch(`https://api.line.me/v2/bot${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.line.channelAccessToken}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LINE API error ${res.status}: ${text}`);
  }
  return res.json().catch(() => ({}));
}

async function replyMessage(replyToken, text) {
  return lineApiFetch('/message/reply', {
    replyToken,
    messages: [{ type: 'text', text }],
  });
}

async function pushMessage(userId, text) {
  return lineApiFetch('/message/push', {
    to: userId,
    messages: [{ type: 'text', text }],
  });
}

async function getProfile(userId) {
  const res = await fetch(`https://api.line.me/v2/bot/profile/${userId}`, {
    headers: { 'Authorization': `Bearer ${config.line.channelAccessToken}` },
  });
  if (!res.ok) throw new Error(`Profile fetch failed: ${res.status}`);
  return res.json();
}

module.exports = { replyMessage, pushMessage, getProfile };
