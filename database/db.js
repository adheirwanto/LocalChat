const Database = require('better-sqlite3');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const DB_PATH = path.join(__dirname, '..', 'localchat.db');
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    session_token TEXT UNIQUE NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS rooms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    creator_username TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    room_id TEXT NOT NULL,
    username TEXT NOT NULL,
    text TEXT,
    type TEXT NOT NULL DEFAULT 'text',
    file_url TEXT,
    timestamp TEXT NOT NULL,
    FOREIGN KEY (room_id) REFERENCES rooms(id)
  );

  CREATE TABLE IF NOT EXISTS room_members (
    room_id TEXT NOT NULL,
    username TEXT NOT NULL,
    PRIMARY KEY (room_id, username),
    FOREIGN KEY (room_id) REFERENCES rooms(id)
  );
`);

// Seed default General room if it doesn't exist
const generalRoom = db.prepare('SELECT id FROM rooms WHERE id = ?').get('general');
if (!generalRoom) {
  db.prepare('INSERT INTO rooms (id, name, creator_username) VALUES (?, ?, ?)').run('general', 'General', 'system');
}

// --- User functions ---

function createUser(username) {
  const id = uuidv4();
  const sessionToken = uuidv4();
  db.prepare('INSERT INTO users (id, username, session_token) VALUES (?, ?, ?)').run(id, username, sessionToken);
  return { id, username, sessionToken };
}

function getUserByToken(token) {
  return db.prepare('SELECT * FROM users WHERE session_token = ?').get(token);
}

function getUserByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}

function getUserByUsernameCaseInsensitive(username) {
  return db.prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?)').get(username);
}

function updateSessionToken(username) {
  const newToken = uuidv4();
  db.prepare('UPDATE users SET session_token = ? WHERE username = ?').run(newToken, username);
  return newToken;
}

// --- Room functions ---

function createRoom(name, creatorUsername) {
  const id = uuidv4();
  db.prepare('INSERT INTO rooms (id, name, creator_username) VALUES (?, ?, ?)').run(id, name, creatorUsername);
  // Auto-add creator as member
  addRoomMember(id, creatorUsername);
  return { id, name, creator_username: creatorUsername };
}

function getRooms() {
  return db.prepare('SELECT * FROM rooms ORDER BY created_at ASC').all();
}

function getRoom(roomId) {
  return db.prepare('SELECT * FROM rooms WHERE id = ?').get(roomId);
}

// --- Room membership ---

function addRoomMember(roomId, username) {
  const existing = db.prepare('SELECT * FROM room_members WHERE room_id = ? AND username = ?').get(roomId, username);
  if (!existing) {
    db.prepare('INSERT INTO room_members (room_id, username) VALUES (?, ?)').run(roomId, username);
  }
}

function removeRoomMember(roomId, username) {
  db.prepare('DELETE FROM room_members WHERE room_id = ? AND username = ?').run(roomId, username);
}

function getRoomMembers(roomId) {
  return db.prepare('SELECT username FROM room_members WHERE room_id = ?').all(roomId).map(r => r.username);
}

function getUserRooms(username) {
  return db.prepare(`
    SELECT r.* FROM rooms r
    INNER JOIN room_members rm ON r.id = rm.room_id
    WHERE rm.username = ?
    ORDER BY r.created_at ASC
  `).all(username);
}

// --- Message functions ---

function saveMessage({ roomId, username, text, type, fileUrl, timestamp }) {
  const id = uuidv4();
  db.prepare('INSERT INTO messages (id, room_id, username, text, type, file_url, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(id, roomId, username, text || null, type || 'text', fileUrl || null, timestamp);
  return id;
}

function getRoomMessages(roomId, limit = 100) {
  return db.prepare('SELECT * FROM messages WHERE room_id = ? ORDER BY timestamp DESC LIMIT ?').all(roomId, limit).reverse();
}

module.exports = {
  createUser,
  getUserByToken,
  getUserByUsername,
  getUserByUsernameCaseInsensitive,
  updateSessionToken,
  createRoom,
  getRooms,
  getRoom,
  addRoomMember,
  removeRoomMember,
  getRoomMembers,
  getUserRooms,
  saveMessage,
  getRoomMessages
};
