const API = {
    // Регистрация
    async register(username, password) {
        const res = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
            credentials: 'include'
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error);
        }
        return await res.json();
    },

    // Вход
    async login(username, password) {
        const res = await fetch('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
            credentials: 'include'
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error);
        }
        return await res.json();
    },

    // Получить текущего пользователя
    async getMe() {
        const res = await fetch('/api/me', {
            credentials: 'include'
        });
        if (!res.ok) return null;
        return await res.json();
    },

    // Выход
    async logout() {
        await fetch('/api/logout', { method: 'POST', credentials: 'include' });
    },

    // Смена пароля
    async changePassword(userId, oldPassword, newPassword) {
        const res = await fetch(`/api/users/${userId}/change-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ oldPassword, newPassword }),
            credentials: 'include'
        });
        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error);
        }
        return await res.json();
    },

    // Получить список всех пользователей
    async getUsers() {
        const res = await fetch('/api/users', { credentials: 'include' });
        return await res.json();
    },

    // Получить чаты пользователя
    async getUserChats(userId) {
        const res = await fetch(`/api/users/${userId}/chats`, { credentials: 'include' });
        return await res.json();
    },

    // Получить сообщения чата
    async getChatMessages(chatId) {
        const res = await fetch(`/api/chats/${chatId}/messages`, { credentials: 'include' });
        return await res.json();
    },

    // Создать новый чат
    async createChat(data) {
        const res = await fetch('/api/chats', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
            credentials: 'include'
        });
        return await res.json();
    },

    // Отметить чат как прочитанный
    async markChatRead(chatId, userId) {
        const res = await fetch(`/api/chats/${chatId}/read`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId }),
            credentials: 'include'
        });
        return await res.json();
    },

    // Обновить профиль пользователя (ник, аватар)
    async updateUser(userId, data) {
        const res = await fetch(`/api/users/${userId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
            credentials: 'include'
        });
        return await res.json();
    },

    // Загрузить файл (изображение/видео)
    async uploadFile(file) {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch('/api/upload', {
            method: 'POST',
            body: formData,
            credentials: 'include'
        });
        return await res.json();
    }
};
