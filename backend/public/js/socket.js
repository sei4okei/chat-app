class SocketManager {
    constructor() {
        this.socket = null;
        this.callbacks = {
            onMessage: null,
            onUserOnline: null,
            onUserOffline: null,
            onChatRead: null
        };
    }

    joinChat(chatId) {
        if (this.socket) {
            this.socket.emit('join_chat', chatId);
        }
    }

    connect(userId, callbacks) {
        this.callbacks = callbacks;
        this.socket = io();
        this.socket.on('connect', () => {
            console.log('Socket connected');
            this.socket.emit('join', userId);
        });
        this.socket.onAny((event, data) => {
            // Сообщения (обычные)
            if (event.startsWith('chat_') && !event.endsWith('_read')) {
                const chatId = parseInt(event.split('_')[1]);
                if (this.callbacks.onMessage) this.callbacks.onMessage(chatId, data);
            }
            // Событие прочтения
            if (event.endsWith('_read')) {
                // event = "chat_123_read"
                const parts = event.split('_');
                const chatId = parseInt(parts[1]); // берём вторую часть
                if (this.callbacks.onChatRead) this.callbacks.onChatRead(chatId);
            }
        });
        this.socket.on('user_online', (userId) => {
            if (this.callbacks.onUserOnline) this.callbacks.onUserOnline(userId);
        });
        this.socket.on('user_offline', (userId) => {
            if (this.callbacks.onUserOffline) this.callbacks.onUserOffline(userId);
        });
    }

    sendMessage(chatId, userId, content, fileUrl, tempId) {
        if (!this.socket) return;
        this.socket.emit('send_message', { chatId, userId, content: content || '', fileUrl: fileUrl || null, tempId });
    }

    disconnect() {
        if (this.socket) this.socket.disconnect();
    }
}
