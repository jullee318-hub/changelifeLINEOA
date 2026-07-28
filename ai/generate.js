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

  return `你是「意轉靈升工作坊」LINE 官方帳號的 AI 回覆助手。
你同時扮演兩個角色來產生最終回覆：

---
${siyuPrompt}
---
${nuanyuPrompt}
---

## 目前狀態
- 觀眾目前在【${stage === 'catch' ? '接住' : stage === 'warm' ? '養溫' : '轉化'}】階段
- 請根據私域的策略指引決定回覆方向，再用暖語的語氣風格撰寫最終回覆

## 重要規則
- 只輸出最終要傳給觀眾的回覆文字，不要輸出任何分析、標籤或說明
- 回覆長度最多 3-6 行，每行不超過 20 字，簡短有力
- 用繁體中文
- 用「你」稱呼對方（不預設性別）
- 課程內容、分期政策、課程費用這些你已經知道的資訊，必須直接回答，不要推去問品慧老師
- 對方問「教什麼」「具體說」「學什麼」→ 你知道課程內容，用你自己的話介紹，帶入 2-3 個具體單元
- 只有你真的不知道的事（例如：具體開課日期、特殊個人安排、報名連結）才引導找品慧老師
- 絕對不要說「我不確定」「這邊不確定」「老實說我不清楚」
- 不要在一則回覆裡塞太多資訊，一次講一件事就好`;
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
