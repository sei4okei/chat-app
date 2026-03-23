const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { pool } = require('./db');

const router = express.Router();

let io; // глобальная переменная для Socket.IO

function setIo(socketIo) {
  io = socketIo;
}

// Настройка multer для загрузки файлов
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});
const upload = multer({ storage });

// Получить всех пользователей с онлайн-статусом (onlineUsers передаётся извне)
let onlineUsers = new Set();
function setOnlineUsers(usersSet) {
  onlineUsers = usersSet;
}

router.get('/api/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT id, username, avatar FROM users ORDER BY id');
    const users = result.rows.map(u => ({ ...u, online: onlineUsers.has(u.id) }));
    res.json(users);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/users', async (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'Username required' });
  try {
    const result = await pool.query(
      'INSERT INTO users (username) VALUES ($1) ON CONFLICT (username) DO UPDATE SET username = EXCLUDED.username RETURNING id, username, avatar',
      [username]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  const { username, avatar } = req.body;
  try {
    const result = await pool.query(
      'UPDATE users SET username = COALESCE($1, username), avatar = COALESCE($2, avatar) WHERE id = $3 RETURNING *',
      [username, avatar, id]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/users/:userId/chats', async (req, res) => {
  const { userId } = req.params;
  try {
    const result = await pool.query(`
      SELECT
        c.id, c.name, c.is_group,
        COALESCE(
          (SELECT json_agg(json_build_object('id', u.id, 'username', u.username, 'avatar', u.avatar))
           FROM chat_participants cp
           JOIN users u ON cp.user_id = u.id
           WHERE cp.chat_id = c.id),
          '[]'::json
        ) as participants,
        (SELECT COUNT(*) FROM messages m
         WHERE m.chat_id = c.id AND m.user_id != $1 AND m.read_at IS NULL) as unread_count
      FROM chats c
      JOIN chat_participants cp ON c.id = cp.chat_id
      WHERE cp.user_id = $1
      ORDER BY c.created_at DESC
    `, [userId]);
    const chats = result.rows.map(row => ({
      ...row,
      participants: Array.isArray(row.participants) ? row.participants : [],
      unread_count: parseInt(row.unread_count, 10)
    }));
    res.json(chats);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/api/chats/:chatId/messages', async (req, res) => {
  const { chatId } = req.params;
  try {
    const result = await pool.query(`
      SELECT m.*, u.username, u.avatar
      FROM messages m
      JOIN users u ON m.user_id = u.id
      WHERE m.chat_id = $1
      ORDER BY m.created_at ASC
    `, [chatId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/chats', async (req, res) => {
  const { name, participants, isGroup } = req.body;
  if (!participants || participants.length < 2) return res.status(400).json({ error: 'At least 2 participants' });
  try {
    await pool.query('BEGIN');
    const chatResult = await pool.query(
      'INSERT INTO chats (name, is_group) VALUES ($1, $2) RETURNING id',
      [name || null, isGroup || (participants.length > 2)]
    );
    const chatId = chatResult.rows[0].id;
    for (const userId of participants) {
      await pool.query('INSERT INTO chat_participants (chat_id, user_id) VALUES ($1, $2)', [chatId, userId]);
    }
    await pool.query('COMMIT');
    res.json({ id: chatId });
  } catch (err) {
    await pool.query('ROLLBACK');
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/chats/:chatId/read', async (req, res) => {
  const { chatId } = req.params;
  const { userId } = req.body;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  try {
    await pool.query(`
      UPDATE messages
      SET read_at = NOW()
      WHERE chat_id = $1 AND user_id != $2 AND read_at IS NULL
    `, [chatId, userId]);
    const participants = await pool.query('SELECT user_id FROM chat_participants WHERE chat_id = $1', [chatId]);
    // Отдаём список участников, чтобы сокет-сервер разослал уведомления
    res.json({ success: true, participants: participants.rows.map(r => r.user_id) });
// Уведомить всех участников чата о прочтении
if (io) {
  io.to(`chat_${chatId}`).emit(`chat_${chatId}_read`);
}
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ fileUrl: `/uploads/${req.file.filename}` });
});
module.exports = { router, setOnlineUsers, setIo };
