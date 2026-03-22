const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const path = require('path');
const routes = require('./routes');
const pool = require('./db');
const auth = require('./auth');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(cors());
app.use(express.json());
app.use('/api', routes);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// WebSocket аутентификация и обработка сообщений
io.use((socket, next) => {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error('Authentication error'));
  const decoded = auth.verifyToken(token);
  if (!decoded) return next(new Error('Authentication error'));
  socket.userId = decoded.userId;
  next();
});

io.on('connection', (socket) => {
  console.log('User connected:', socket.userId);
  
  // Присоединиться к комнатам чатов пользователя
  // При загрузке клиент отправит список chatIds, подпишемся
  socket.on('join-chats', (chatIds) => {
    chatIds.forEach(chatId => {
      socket.join(`chat_${chatId}`);
    });
  });
  
  // Обработка нового сообщения (отправленного через WebSocket)
  socket.on('send-message', async (data) => {
    const { chatId, content, fileUrl, fileType } = data;
    if (!chatId) return;
    // Проверить членство
    try {
      const memberCheck = await pool.query('SELECT 1 FROM chat_members WHERE chat_id = $1 AND user_id = $2', [chatId, socket.userId]);
      if (memberCheck.rows.length === 0) return;
      // Сохраняем в БД
      let result;
      if (fileUrl) {
        // Если файл уже загружен через API, то тут просто сохраняем ссылку
        result = await pool.query(
          'INSERT INTO messages (chat_id, user_id, content, file_url, file_type) VALUES ($1, $2, $3, $4, $5) RETURNING *',
          [chatId, socket.userId, content || null, fileUrl, fileType]
        );
      } else {
        result = await pool.query(
          'INSERT INTO messages (chat_id, user_id, content) VALUES ($1, $2, $3) RETURNING *',
          [chatId, socket.userId, content || null]
        );
      }
      const newMsg = result.rows[0];
      // Получить данные пользователя
      const userRes = await pool.query('SELECT username, nickname, avatar FROM users WHERE id = $1', [socket.userId]);
      newMsg.username = userRes.rows[0].username;
      newMsg.nickname = userRes.rows[0].nickname;
      newMsg.avatar = userRes.rows[0].avatar;
      
      // Отправить сообщение всем в комнате чата
      io.to(`chat_${chatId}`).emit('new-message', newMsg);
    } catch (err) {
      console.error(err);
    }
  });
  
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.userId);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
