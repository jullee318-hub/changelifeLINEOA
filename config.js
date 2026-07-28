const path = require('path');

module.exports = {
  port: process.env.PORT || 3001,
  line: {
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.LINE_CHANNEL_SECRET,
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
    model: process.env.AI_MODEL || 'claude-sonnet-5',
  },
  dbPath: process.env.DB_PATH || path.join(__dirname, 'data', 'database.sqlite'),
  session: {
    secret: process.env.SESSION_SECRET || 'yizhuanlingsheng-default-secret',
  },
  operators: [
    { name: process.env.OPERATOR1_NAME, password: process.env.OPERATOR1_PASSWORD },
    { name: process.env.OPERATOR2_NAME, password: process.env.OPERATOR2_PASSWORD },
  ],
};
