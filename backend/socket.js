const { pool } = require('./db');

let onlineUsers = new Set();

function setupSocket(io) {
  io.on('connection', (socket) => {
    console.log('Socket connected');
socket.on('join_chat', (chatId) => {
    socket.join(`chat_${chatId}`);
    console.log(`Socket ${socket.id} joined chat ${chatId}`);
});    
socket.on('join', (userId) => {
      socket.userId = userId;
      onlineUsers.add(userId);
      socket.join(`user_${userId}`);
      console.log(`User ${userId} online`);
      io.emit('user_online', userId);
    });
    socket.on('send_message', async (data) => {
      const { chatId, userId, content, fileUrl } = data;
      try {
        const result = await pool.query(
          `INSERT INTO messages (chat_id, user_id, content, file_url, read_at)
           VALUES ($1, $2, $3, $4, NULL) RETURNING *`,
          [chatId, userId, content, fileUrl]
        );
        const newMessage = result.rows[0];
        const userRes = await pool.query('SELECT username, avatar FROM users WHERE id = $1', [userId]);
        const messageWithUser = {
          ...newMessage,
          username: userRes.rows[0].username,
          avatar: userRes.rows[0].avatar
        };
        io.to(`chat_${chatId}`).emit(`chat_${chatId}`, messageWithUser);
      } catch (err) {
        console.error(err);
      }
    });
    socket.on('disconnect', () => {
      if (socket.userId) {
        onlineUsers.delete(socket.userId);
        console.log(`User ${socket.userId} offline`);
        io.emit('user_offline', socket.userId);
      }
    });
  });
  return onlineUsers;
}

module.exports = { setupSocket };
