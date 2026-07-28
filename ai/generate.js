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
- 如果觀眾問到你不確定的細節（例如分期、付款方式、具體時間、特殊安排等），絕對不要說「我不確定」、「這邊不確定」、「老實說我不清楚」——要改成引導對方直接私訊品慧老師：「這個部分你可以直接問品慧老師，她會跟你說明 ❤️」
- 不要在一則回覆裡塞太多資訊，一次講一件事就好`;
}

function buildConversationMessages(messages) {
  return messages.map(m => ({
    role: m.direction === 'inbound' ? 'user' : 'assistant',
    content: m.content,
  }));
}

async function generateReply(messages, stage, contact) {
  const conversationMessages = buildConversationMessages(messages);

  const response = await client.messages.create({
    model: config.anthropic.model,
    max_tokens: 500,
    system: buildSystemPrompt(stage),
    messages: conversationMessages,
  });

  return response.content[0].text.trim();
}

module.exports = { generateReply };
