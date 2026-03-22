const express = require('express');
const router = express.Router();
const pool = require('./db');
const auth = require('./auth');
const upload = require('./upload');
const path = require('path');

// Middleware для проверки авторизации
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  const decoded = auth.verifyToken(token);
  if (!decoded) return res.status(401).json({ error: 'Invalid token' });
  req.userId = decoded.userId;
  next();
};

// Регистрация
router.post('/register', async (req, res) => {
  const { username, password, nickname } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  try {
    const hashed = await auth.hashPassword(password);
    const result = await pool.query(
      'INSERT INTO users (username, password_hash, nickname) VALUES ($1, $2, $3) RETURNING id, username, nickname',
      [username, hashed, nickname || username]
    );
    const token = auth.generateToken(result.rows[0].id);
    res.json({ token, user: result.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ error: 'Username taken' });
    res.status(500).json({ error: 'Server error' });
  }
});

// Логин
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (result.rows.length === 0) return res.status(401).json({ error: 'Invalid credentials' });
    const user = result.rows[0];
    const valid = await auth.comparePassword(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });
    const token = auth.generateToken(user.id);
    res.json({ token, user: { id: user.id, username: user.username, nickname: user.nickname, avatar: user.avatar } });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Получить всех пользователей (кроме себя)
router.get('/users', authenticate, async (req, res) => {
  try {
    const result = await pool.query('SELECT id, username, nickname, avatar FROM users WHERE id != $1', [req.userId]);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Получить чаты пользователя
router.get('/chats', authenticate, async (req, res) => {
  try {
    // Получаем чаты, в которых участвует пользователь, с последним сообщением и именем чата
    const query = `
      SELECT c.id, c.name, c.type, 
             (SELECT json_agg(json_build_object('id', u.id, 'username', u.username, 'nickname', u.nickname, 'avatar', u.avatar)) 
              FROM chat_members cm2 
              JOIN users u ON u.id = cm2.user_id 
              WHERE cm2.chat_id = c.id) as members,
             (SELECT content FROM messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1) as last_message,
             (SELECT created_at FROM messages WHERE chat_id = c.id ORDER BY created_at DESC LIMIT 1) as last_activity
      FROM chats c
      JOIN chat_members cm ON cm.chat_id = c.id
      WHERE cm.user_id = $1
      ORDER BY last_activity DESC NULLS LAST
    `;
    const result = await pool.query(query, [req.userId]);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Получить сообщения чата
router.get('/chats/:chatId/messages', authenticate, async (req, res) => {
  const { chatId } = req.params;
  // Проверить, является ли пользователь участником чата
  try {
    const memberCheck = await pool.query('SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2', [chatId, req.userId]);
    if (memberCheck.rows.length === 0) return res.status(403).json({ error: 'Not a member' });
    const result = await pool.query(
      `SELECT m.*, u.username, u.nickname, u.avatar 
       FROM messages m 
       JOIN users u ON u.id = m.user_id 
       WHERE chat_id = $1 
       ORDER BY created_at ASC`,
      [chatId]
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Создать личный чат (или вернуть существующий)
router.post('/chats/personal', authenticate, async (req, res) => {
  const { userId } = req.body; // ID другого пользователя
  if (!userId) return res.status(400).json({ error: 'User ID required' });
  try {
    // Проверить, существует ли уже личный чат между этими двумя
    const existing = await pool.query(
      `SELECT c.id FROM chats c
       JOIN chat_members cm1 ON cm1.chat_id = c.id AND cm1.user_id = $1
       JOIN chat_members cm2 ON cm2.chat_id = c.id AND cm2.user_id = $2
       WHERE c.type = 'personal'`,
      [req.userId, userId]
    );
    if (existing.rows.length > 0) {
      return res.json({ chatId: existing.rows[0].id });
    }
    // Создать новый чат
    const chatResult = await pool.query(
      'INSERT INTO chats (type) VALUES ($1) RETURNING id',
      ['personal']
    );
    const chatId = chatResult.rows[0].id;
    await pool.query(
      'INSERT INTO chat_members (chat_id, user_id) VALUES ($1, $2), ($1, $3)',
      [chatId, req.userId, userId]
    );
    res.json({ chatId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Создать групповой чат
router.post('/chats/group', authenticate, async (req, res) => {
  const { name, userIds } = req.body; // userIds - массив ID участников (включая себя? добавим себя автоматически)
  if (!name || !Array.isArray(userIds)) return res.status(400).json({ error: 'Name and userIds required' });
  try {
    // Добавляем текущего пользователя в список, если его нет
    let members = [...new Set([req.userId, ...userIds])];
    const chatResult = await pool.query(
      'INSERT INTO chats (name, type) VALUES ($1, $2) RETURNING id',
      [name, 'group']
    );
    const chatId = chatResult.rows[0].id;
    const insertValues = members.map(uid => `(${chatId}, ${uid})`).join(',');
    await pool.query(`INSERT INTO chat_members (chat_id, user_id) VALUES ${insertValues}`);
    res.json({ chatId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Обновить никнейм и аватар
router.put('/profile', authenticate, upload.single('avatar'), async (req, res) => {
  const { nickname } = req.body;
  let avatarUrl = null;
  if (req.file) {
    avatarUrl = `/uploads/${req.file.filename}`;
  }
  try {
    let query = 'UPDATE users SET nickname = COALESCE($1, nickname)';
    let params = [nickname];
    if (avatarUrl) {
      query += ', avatar = $2';
      params.push(avatarUrl);
    }
    query += ' WHERE id = $' + (params.length+1) + ' RETURNING id, username, nickname, avatar';
    params.push(req.userId);
    const result = await pool.query(query, params);
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// Отправка сообщения через API (для файлов)
router.post('/messages', authenticate, upload.single('file'), async (req, res) => {
  const { chatId, content } = req.body;
  if (!chatId) return res.status(400).json({ error: 'Chat ID required' });
  try {
    // Проверить членство
    const memberCheck = await pool.query('SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2', [chatId, req.userId]);
    if (memberCheck.rows.length === 0) return res.status(403).json({ error: 'Not a member' });
    let fileUrl = null;
    let fileType = null;
    if (req.file) {
      fileUrl = `/uploads/${req.file.filename}`;
      fileType = req.file.mimetype.startsWith('image/') ? 'image' : 'video';
    }
    const result = await pool.query(
      'INSERT INTO messages (chat_id, user_id, content, file_url, file_type) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [chatId, req.userId, content || null, fileUrl, fileType]
    );
    const newMsg = result.rows[0];
    // Получить данные пользователя для ответа
    const userRes = await pool.query('SELECT username, nickname, avatar FROM users WHERE id = $1', [req.userId]);
    newMsg.username = userRes.rows[0].username;
    newMsg.nickname = userRes.rows[0].nickname;
    newMsg.avatar = userRes.rows[0].avatar;
    res.json(newMsg);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Раздача статических файлов из папки uploads (для изображений/видео)
router.get('/uploads/:filename', (req, res) => {
  const filePath = path.join(__dirname, 'uploads', req.params.filename);
  res.sendFile(filePath);
});

module.exports = router;
