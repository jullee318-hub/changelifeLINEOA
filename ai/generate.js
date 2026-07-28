const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const db = require('../db/database');

const client = new Anthropic({ apiKey: config.anthropic.apiKey });

const siyuTemplate = fs.readFileSync(path.join(__dirname, 'prompts', 'siyu.md'), 'utf-8');
const nuanyuPrompt = fs.readFileSync(path.join(__dirname, 'prompts', 'nuanyu.md'), 'utf-8');

function buildCoursesText() {
  const coursesJson = db.getSetting('courses');
  if (!coursesJson) return '（目前沒有設定課程資料）';

  let courses;
  try { courses = JSON.parse(coursesJson); } catch (e) { return '（課程資料格式錯誤）'; }

  const active = courses.filter(c => c.active !== false);
  if (active.length === 0) return '（目前沒有開課中的課程）';

  return active.map((c, i) => {
    let text = `${i + 1}. **${c.name}**\n`;
    if (c.description) text += `   - ${c.description}\n`;
    if (c.price) text += `   - 費用：${c.price}\n`;
    if (c.schedule) text += `   - 時間：${c.schedule}\n`;
    if (c.link) text += `   - 報名連結：${c.link}\n`;
    if (c.note) text += `   - ${c.note}\n`;
    return text;
  }).join('\n');
}

function buildSystemPrompt(stage) {
  const coursesText = buildCoursesText();
  const siyuPrompt = siyuTemplate.replace('{{COURSES_PLACEHOLDER}}', coursesText);

  return `你是意轉靈升工作坊的 LINE 回覆助手。用品慧老師的溫暖語氣回覆。

觀眾目前在【${stage === 'catch' ? '接住' : stage === 'warm' ? '養溫' : '轉化'}】階段。

${siyuPrompt}

${nuanyuPrompt}

規則：只輸出回覆文字，不要輸出分析。用繁體中文。課程內容和分期政策你都知道，直接回答。只有開課日期等你不知道的事才引導找品慧老師。`;
}

function buildConversationMessages(messages) {
  const result = [];
  for (const m of messages) {
    const content = (m.content || '').trim();
    if (!content) continue;
    const role = m.direction === 'inbound' ? 'user' : 'assistant';
    const last = result[result.length - 1];
    if (last && last.role === role) {
      last.content += '\n' + content;
    } else {
      result.push({ role, content });
    }
  }
  if (result.length > 0 && result[0].role === 'assistant') {
    result.shift();
  }
  if (result.length === 0) {
    result.push({ role: 'user', content: '你好' });
  }
  return result;
}

async function generateReply(messages, stage, contact) {
  const conversationMessages = buildConversationMessages(messages);

  console.log('[AI] 送出請求，訊息數:', conversationMessages.length);
  const response = await client.messages.create({
    model: config.anthropic.model,
    max_tokens: 500,
    system: buildSystemPrompt(stage),
    messages: conversationMessages,
  });

  if (!response.content || !response.content[0] || !response.content[0].text) {
    console.error('[AI] API 回傳異常:', JSON.stringify(response));
    throw new Error('AI 回傳空內容');
  }

  return response.content[0].text.trim();
}

module.exports = { generateReply };
