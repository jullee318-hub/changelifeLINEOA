const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const config = require('../config');

let db;

async function init() {
  const dir = path.dirname(config.dbPath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const SQL = await initSqlJs();

  if (fs.existsSync(config.dbPath)) {
    const buffer = fs.readFileSync(config.dbPath);
    db = new SQL.Database(buffer);
  } else {
    db = new SQL.Database();
  }

  db.exec('PRAGMA foreign_keys = ON;');
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');
  db.exec(schema);
  save();
  return db;
}

function save() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(config.dbPath, buffer);
}

function getDb() {
  if (!db) throw new Error('Database not initialized. Call init() first.');
  return db;
}

function queryOne(sql, params = []) {
  const stmt = getDb().prepare(sql);
  stmt.bind(params);
  let result = null;
  if (stmt.step()) {
    const columns = stmt.getColumnNames();
    const values = stmt.get();
    result = {};
    columns.forEach((col, i) => { result[col] = values[i]; });
  }
  stmt.free();
  return result;
}

function queryAll(sql, params = []) {
  const stmt = getDb().prepare(sql);
  stmt.bind(params);
  const results = [];
  const columns = stmt.getColumnNames();
  while (stmt.step()) {
    const values = stmt.get();
    const row = {};
    columns.forEach((col, i) => { row[col] = values[i]; });
    results.push(row);
  }
  stmt.free();
  return results;
}

function run(sql, params = []) {
  getDb().run(sql, params);
  save();
}

function getLastInsertRowid() {
  return queryOne('SELECT last_insert_rowid() as id').id;
}

function findOrCreateContact(lineUserId, displayName) {
  const now = new Date().toISOString();
  const existing = queryOne('SELECT * FROM contacts WHERE line_user_id = ?', [lineUserId]);
  if (existing) {
    run('UPDATE contacts SET last_message_at = ?, display_name = COALESCE(?, display_name) WHERE id = ?',
      [now, displayName, existing.id]);
    return { ...existing, last_message_at: now, display_name: displayName || existing.display_name };
  }
  run('INSERT INTO contacts (line_user_id, display_name, first_message_at, last_message_at) VALUES (?, ?, ?, ?)',
    [lineUserId, displayName, now, now]);
  return queryOne('SELECT * FROM contacts WHERE line_user_id = ?', [lineUserId]);
}

function getContact(contactId) {
  return queryOne('SELECT * FROM contacts WHERE id = ?', [contactId]);
}

function listContacts() {
  return queryAll(`
    SELECT c.*,
      (SELECT content FROM messages WHERE contact_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
      (SELECT direction FROM messages WHERE contact_id = c.id ORDER BY created_at DESC LIMIT 1) as last_direction,
      (SELECT COUNT(*) FROM drafts WHERE contact_id = c.id AND status = 'pending') as pending_drafts
    FROM contacts c
    ORDER BY c.last_message_at DESC
  `);
}

function updateContactStage(contactId, stage) {
  run('UPDATE contacts SET stage = ? WHERE id = ?', [stage, contactId]);
}

function updateContactNotes(contactId, notes) {
  run('UPDATE contacts SET notes = ? WHERE id = ?', [notes, contactId]);
}

function saveMessage(contactId, direction, source, content, lineMessageId, sentBy) {
  run('INSERT INTO messages (contact_id, direction, source, content, line_message_id, sent_by) VALUES (?, ?, ?, ?, ?, ?)',
    [contactId, direction, source, content, lineMessageId, sentBy]);
  return getLastInsertRowid();
}

function getMessages(contactId, limit = 50) {
  return queryAll('SELECT * FROM messages WHERE contact_id = ? ORDER BY created_at ASC LIMIT ?', [contactId, limit]);
}

function getMessageCount(contactId) {
  const row = queryOne('SELECT COUNT(*) as count FROM messages WHERE contact_id = ? AND direction = "inbound"', [contactId]);
  return row ? row.count : 0;
}

function saveDraft(contactId, triggerMessageId, aiContent) {
  run('INSERT INTO drafts (contact_id, trigger_message_id, ai_content) VALUES (?, ?, ?)',
    [contactId, triggerMessageId, aiContent]);
  return getLastInsertRowid();
}

function getPendingDrafts() {
  return queryAll(`
    SELECT d.*, c.display_name, c.line_user_id,
      (SELECT content FROM messages WHERE id = d.trigger_message_id) as trigger_content
    FROM drafts d
    JOIN contacts c ON c.id = d.contact_id
    WHERE d.status = 'pending'
    ORDER BY d.created_at DESC
  `);
}

function getDraft(draftId) {
  return queryOne(`
    SELECT d.*, c.display_name, c.line_user_id
    FROM drafts d
    JOIN contacts c ON c.id = d.contact_id
    WHERE d.id = ?
  `, [draftId]);
}

function updateDraft(draftId, status, reviewedBy, editedContent) {
  const now = new Date().toISOString();
  run('UPDATE drafts SET status = ?, reviewed_by = ?, reviewed_at = ?, edited_content = ? WHERE id = ?',
    [status, reviewedBy, now, editedContent, draftId]);
}

function getSetting(key) {
  const row = queryOne('SELECT value FROM settings WHERE key = ?', [key]);
  return row ? row.value : null;
}

function setSetting(key, value) {
  const now = new Date().toISOString();
  run('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)', [key, value, now]);
}

function getOperator(username) {
  return queryOne('SELECT * FROM operators WHERE username = ?', [username]);
}

function createOperator(username, passwordHash) {
  const existing = queryOne('SELECT * FROM operators WHERE username = ?', [username]);
  if (!existing) {
    run('INSERT INTO operators (username, password_hash) VALUES (?, ?)', [username, passwordHash]);
  }
}

function createBroadcast(content, target, targetStage, contactIds, scheduledAt, createdBy) {
  const idsJson = contactIds ? JSON.stringify(contactIds) : null;
  run('INSERT INTO broadcasts (content, target, target_stage, contact_ids, scheduled_at, created_by) VALUES (?, ?, ?, ?, ?, ?)',
    [content, target, targetStage, idsJson, scheduledAt, createdBy]);
  return getLastInsertRowid();
}

function listBroadcasts() {
  return queryAll('SELECT * FROM broadcasts ORDER BY created_at DESC');
}

function getPendingBroadcasts() {
  const now = new Date().toISOString();
  return queryAll('SELECT * FROM broadcasts WHERE status = ? AND scheduled_at <= ?', ['pending', now]);
}

function updateBroadcast(id, status, sentCount, failCount) {
  const now = new Date().toISOString();
  run('UPDATE broadcasts SET status = ?, sent_count = ?, fail_count = ?, sent_at = ? WHERE id = ?',
    [status, sentCount, failCount, now, id]);
}

function deleteBroadcast(id) {
  run('DELETE FROM broadcasts WHERE id = ? AND status = ?', [id, 'pending']);
}

function getContactsByTarget(target, targetStage, contactIds) {
  if (target === 'pick' && contactIds && contactIds.length > 0) {
    const placeholders = contactIds.map(() => '?').join(',');
    return queryAll('SELECT * FROM contacts WHERE id IN (' + placeholders + ') AND is_blocked = 0', contactIds);
  }
  if (target === 'stage' && targetStage) {
    return queryAll('SELECT * FROM contacts WHERE stage = ? AND is_blocked = 0', [targetStage]);
  }
  return queryAll('SELECT * FROM contacts WHERE is_blocked = 0');
}

module.exports = {
  init, getDb,
  findOrCreateContact, getContact, listContacts, updateContactStage, updateContactNotes,
  saveMessage, getMessages, getMessageCount,
  saveDraft, getPendingDrafts, getDraft, updateDraft,
  getSetting, setSetting,
  getOperator, createOperator,
  createBroadcast, listBroadcasts, getPendingBroadcasts, updateBroadcast, deleteBroadcast, getContactsByTarget,
};
