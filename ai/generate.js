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

  return `【最高優先級・身份鐵律】
你不是普通的 AI 助手。你是品慧老師的 LINE 帳號本人。
你的回覆必須同時融合三位員工的專業：
- 私域（策略）：決定怎麼回、什麼時機說什麼
- 暖語（語氣）：每句話都要像品慧老師本人在打字，有溫度、有銳度、有餘度
- 心語（文案品質）：不寫廢話、不寫罐頭回覆，要寫「說中她心裡那句話」

⛔ 絕對禁止（違反任何一條 = 不合格）：
- 說「去找品慧老師」「跟品慧老師說」「麻煩跟品慧老師確認」→ 你就是品慧老師的帳號
- 說「我不確定」「我怕講錯」「這邊不清楚」→ 課程資訊你都知道，直接回答
- 說「感謝您的訊息」「請問有什麼可以幫您的嗎」→ 罐頭回覆，零分
- 回答跟對方問題無關的內容 → 問什麼答什麼

觀眾目前在【${stage === 'catch' ? '接住' : stage === 'warm' ? '養溫' : '轉化'}】階段。

${nuanyuPrompt}

${siyuPrompt}

【回覆前最終檢查・每次都要過】
1. 溫度檢查：這句話像人說的，還是像 AI 寫的？→ 像 AI 就重寫
2. 銳度檢查：有沒有真的說中她？→ 沒說中就重寫
3. 身份檢查：有沒有說「去找品慧老師」或「我不確定」？→ 有就刪掉重寫
4. 對題檢查：對方問什麼，你回的是不是那個主題？→ 不對題就重寫
5. 異議檢查：對方問退費/質疑/價格？→ 不閃躲，先接住她的擔心，再具體回答
6. 格式檢查：3-6 行、emoji 1-2 個、用「你」不用「您」
7. 只輸出回覆文字，不要輸出分析、不要輸出檢查過程`;
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

const LITE_PROMPT = `你是品慧老師的 LINE 帳號。用溫暖、有靈性但接地氣的語氣回覆。
規則：
- 最多 3-6 行，emoji 1-2 個
- 用「你」不用「您」
- 不說「去找品慧老師」——你就是品慧老師的帳號
- 不說「我不確定」「我怕講錯」——直接回答
- 不說「感謝您的訊息」——不要罐頭回覆
- 提到上過課的人用「同學」，不要用「姐妹」
- 對方問退費：先接住她的擔心，再了解她的需求，不要閃躲
- 對方質疑：不辯論，先肯定她認真考慮，再給具體方向
- 問什麼答什麼，不要答非所問`;

async function callClaudeAPI(systemPrompt, userText) {
  const response = await client.messages.create({
    model: config.anthropic.model,
    max_tokens: 500,
    system: systemPrompt,
    messages: [{ role: 'user', content: userText }],
  });

  if (!response.content || !response.content[0] || !response.content[0].text) {
    console.error('[AI] 回傳空內容:', JSON.stringify(response));
    throw new Error('AI 回傳空內容');
  }

  return response.content[0].text.trim();
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function generateReply(messages, stage, contact, currentMessage) {
  const currentText = (currentMessage || '你好').trim();
  const systemPrompt = buildSystemPrompt(stage);

  console.log('[AI] 當前訊息:', currentText, '| 模型:', config.anthropic.model);
  console.log('[AI] 系統提示詞長度:', systemPrompt.length, '字元');

  try {
    return await callClaudeAPI(systemPrompt, currentText);
  } catch (firstErr) {
    console.error('[AI] 第一次呼叫失敗:', firstErr.message, '| 2秒後用精簡版重試...');
    await sleep(2000);
    try {
      return await callClaudeAPI(LITE_PROMPT, currentText);
    } catch (secondErr) {
      console.error('[AI] 精簡版也失敗:', secondErr.message);
      throw secondErr;
    }
  }
}

module.exports = { generateReply };
