const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { pool, initDb } = require('./db');
const { router, setOnlineUsers, setIo } = require('./routes');
const { setupSocket } = require('./socket');

const app = express();
const server = http.createServer(app);

// Сессия
app.use(session({
    store: new pgSession({
        pool: pool,
        tableName: 'session',
        createTableIfMissing: true
    }),
    secret: 'your-secret-key-change-this-to-random-string',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 } // 30 дней
}));

// Socket.IO
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});
setIo(io);

app.use(cors({
    origin: true,
    credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Подключаем роуты
app.use(router);

// Инициализация БД
initDb();

// Настройка сокетов
const onlineUsers = setupSocket(io);
setOnlineUsers(onlineUsers);

// Отдаём index.html
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
