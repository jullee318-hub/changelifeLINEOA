const db = require('./db/database');
const { pushMessage } = require('./line/reply');

async function processPendingBroadcasts() {
  const pending = db.getPendingBroadcasts();
  for (const broadcast of pending) {
    console.log('[排程] 開始發送排程訊息 #' + broadcast.id);
    const contactIds = broadcast.contact_ids ? JSON.parse(broadcast.contact_ids) : null;
    const contacts = db.getContactsByTarget(broadcast.target, broadcast.target_stage, contactIds);
    let sentCount = 0;
    let failCount = 0;

    for (const contact of contacts) {
      try {
        await pushMessage(contact.line_user_id, broadcast.content);
        db.saveMessage(contact.id, 'outbound', 'broadcast', broadcast.content, null, broadcast.created_by);
        sentCount++;
      } catch (err) {
        console.error('[排程] 發送失敗:', contact.display_name, err.message);
        failCount++;
      }
    }

    db.updateBroadcast(broadcast.id, 'sent', sentCount, failCount);
    console.log('[排程] 訊息 #' + broadcast.id + ' 完成: 成功 ' + sentCount + ' 失敗 ' + failCount);
  }
}

function startScheduler() {
  console.log('[排程] 排程器已啟動，每 60 秒檢查一次');
  setInterval(processPendingBroadcasts, 60 * 1000);
  processPendingBroadcasts();
}

module.exports = { startScheduler };
