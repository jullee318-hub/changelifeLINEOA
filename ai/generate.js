const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const config = require('../config');
const db = require('../db/database');

const client = new Anthropic({ apiKey: config.anthropic.apiKey });

const nuanyuPrompt = fs.readFileSync(path.join(__dirname, 'prompts', 'nuanyu.md'), 'utf-8');
const stageModule = fs.readFileSync(path.join(__dirname, 'prompts', 'modules', 'stage.md'), 'utf-8');
const coursesModule = fs.readFileSync(path.join(__dirname, 'prompts', 'modules', 'courses.md'), 'utf-8');
const yuanchengongModule = fs.readFileSync(path.join(__dirname, 'prompts', 'modules', 'yuanchengong.md'), 'utf-8');
const installmentModule = fs.readFileSync(path.join(__dirname, 'prompts', 'modules', 'installment.md'), 'utf-8');
const tiandishenModule = fs.readFileSync(path.join(__dirname, 'prompts', 'modules', 'tiandishen.md'), 'utf-8');
const objectionModule = fs.readFileSync(path.join(__dirname, 'prompts', 'modules', 'objection.md'), 'utf-8');
const lifeIssuesModule = fs.readFileSync(path.join(__dirname, 'prompts', 'modules', 'life-issues.md'), 'utf-8');
const faqTeacherModule = fs.readFileSync(path.join(__dirname, 'prompts', 'modules', 'faq-teacher.md'), 'utf-8');
const welcomeModule = fs.readFileSync(path.join(__dirname, 'prompts', 'modules', 'welcome.md'), 'utf-8');
const followUpModule = fs.readFileSync(path.join(__dirname, 'prompts', 'modules', 'follow-up.md'), 'utf-8');

const MODULE_RULES = [
  {
    name: '人生轉換術',
    content: coursesModule,
    keywords: ['人生轉換', '轉換術', '課程', '上課', '教什麼', '學什麼', '內容'],
  },
  {
    name: '元辰宮',
    content: yuanchengongModule,
    keywords: ['元辰宮', '元辰', '療癒師', '療癒個案', '算命', '可怕', '害怕', '迷信', '科學', '心理諮商', '處理一次', '幾次', '效果', '多久'],
  },
  {
    name: '分期付款',
    content: installmentModule,
    keywords: ['分期', '付款', '費用', '多少錢', '價格', '價錢', '怎麼付'],
  },
  {
    name: '天地神卡牌',
    content: tiandishenModule,
    keywords: ['天地神', '卡牌', '解鎖碼', '抽牌', '牌卡'],
  },
  {
    name: '異議處理',
    content: objectionModule,
    keywords: ['退費', '退款', '騙', '詐騙', '有效', '無效', '不信', '不相信', '貴', '沒有用', '沒用', '可以退', '不想上', '不喜歡', '解決', '考慮', '再想想', '適不適合', '不確定', '猶豫', '保證', '學得會', '打折', '優惠'],
  },
  {
    name: '生活議題',
    content: lifeIssuesModule,
    keywords: ['感情', '男朋友', '女朋友', '老公', '老婆', '分手', '外遇', '出軌', '小三', '第三者', '離婚', '吵架', '冷戰', '迴心轉意', '回心轉意', '復合', '劈腿', '賺不到錢', '工作不順', '找工作', '沒錢', '有錢', '加薪', '升職', '被裁', '失業', '運勢', '不順', '衰', '倒楣', '身體不好', '生病', '健康', '看醫生', '失眠', '焦慮', '憂鬱'],
  },
  {
    name: '品慧老師',
    content: faqTeacherModule,
    keywords: ['品慧老師', '老師是誰', '老師的', '教學風格', '資歷', '嚴格', '跟不上', '跟其他', '上完課還會', '找不到資料', '低調', '社群'],
  },
  {
    name: '歡迎',
    content: welcomeModule,
    keywords: ['你好', '哈囉', '嗨', 'hi', 'hello', '想了解', '朋友介紹', '朋友推薦', '怎麼報名'],
  },
  {
    name: '跟進養溫',
    content: followUpModule,
    keywords: ['考慮', '再想想', '不確定', '適不適合', '猶豫', '還在想', '還沒決定'],
  },
];

function selectModules(userText) {
  const matched = [];
  for (const mod of MODULE_RULES) {
    if (mod.keywords.some(kw => userText.includes(kw))) {
      matched.push(mod);
    }
  }
  return matched;
}

function buildCoursesText() {
  const coursesJson = db.getSetting('courses');
  if (!coursesJson) return '';

  let courses;
  try { courses = JSON.parse(coursesJson); } catch (e) { return ''; }

  const active = courses.filter(c => c.active !== false);
  if (active.length === 0) return '';

  return '\n\n## 目前開課中的課程\n\n' + active.map((c, i) => {
    let text = `${i + 1}. **${c.name}**\n`;
    if (c.description) text += `   - ${c.description}\n`;
    if (c.price) text += `   - 費用：${c.price}\n`;
    if (c.schedule) text += `   - 時間：${c.schedule}\n`;
    if (c.link) text += `   - 報名連結：${c.link}\n`;
    if (c.note) text += `   - ${c.note}\n`;
    return text;
  }).join('\n');
}

function buildSystemPrompt(stage, userText) {
  const matched = selectModules(userText);
  const matchedNames = matched.map(m => m.name);
  const modulesText = matched.map(m => m.content).join('\n\n');
  const coursesText = buildCoursesText();

  console.log('[AI] 載入模組:', matchedNames.length > 0 ? matchedNames.join(', ') : '（無特定模組，用基礎回覆）');

  return `【最高優先級・身份鐵律】
你是品慧老師的 LINE 帳號本人。
你的回覆必須融合三位員工的專業：
- 私域（策略）：決定怎麼回、什麼時機說什麼
- 暖語（語氣）：每句話都要像品慧老師本人在打字，溫暖有靈性但接地氣
- 心語（文案品質）：不寫廢話、不寫罐頭回覆，要說中她心裡那句話

⛔ 絕對禁止：
- 說「去找品慧老師」「跟品慧老師說」→ 你就是品慧老師的帳號
- 說「我不確定」「我怕講錯」→ 直接回答
- 說「感謝您的訊息」→ 罐頭回覆
- 回答跟對方問題無關的內容

觀眾目前在【${stage === 'catch' ? '接住' : stage === 'warm' ? '養溫' : '轉化'}】階段。

${stageModule}

${nuanyuPrompt}
${coursesText}
${modulesText}

## 連結（對方需要時才給）
- 官網：https://www.changelife28704.com/
- 預約諮詢：https://www.changelife28704.com/booking.html
- 天地神卡牌：https://tiandishen.vercel.app/

## 鐵律
- 你就是品慧老師的LINE帳號——說「我來幫你處理」「把資訊傳過來」
- 對方說不需要 → 退場，不再推送
- 問什麼答什麼，不要答非所問

【最終檢查】只輸出回覆文字，3-6行，emoji 1-2個，用「你」不用「您」，不要輸出分析。`;
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
  const systemPrompt = buildSystemPrompt(stage, currentText);

  console.log('[AI] 當前訊息:', currentText, '| 模型:', config.anthropic.model, '| 提示詞長度:', systemPrompt.length);

  try {
    return await callClaudeAPI(systemPrompt, currentText);
  } catch (firstErr) {
    const isRateLimit = firstErr.status === 429;
    const waitTime = isRateLimit ? 5000 : 3000;
    console.error('[AI] 第一次呼叫失敗:', firstErr.status, firstErr.message, `| ${waitTime/1000}秒後用精簡版重試...`);
    await sleep(waitTime);
    try {
      return await callClaudeAPI(LITE_PROMPT, currentText);
    } catch (secondErr) {
      console.error('[AI] 精簡版也失敗:', secondErr.status, secondErr.message, '| 5秒後最後一次重試...');
      await sleep(5000);
      try {
        return await callClaudeAPI(LITE_PROMPT, currentText);
      } catch (thirdErr) {
        console.error('[AI] 第三次也失敗:', thirdErr.status, thirdErr.message);
        throw thirdErr;
      }
    }
  }
}

module.exports = { generateReply };
