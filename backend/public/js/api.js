const API = {
    async request(url, options = {}) {
        const res = await fetch(url, options);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    },

    async getUsers() {
        return this.request('/api/users');
    },

    async createUser(username) {
        return this.request('/api/users', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
        });
    },

    async updateUser(id, data) {
        return this.request(`/api/users/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    },

    async getUserChats(userId) {
        return this.request(`/api/users/${userId}/chats`);
    },

    async getChatMessages(chatId) {
        return this.request(`/api/chats/${chatId}/messages`);
    },

    async createChat(data) {
        return this.request('/api/chats', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
    },

    async markChatRead(chatId, userId) {
        return this.request(`/api/chats/${chatId}/read`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId })
        });
    },

    async uploadFile(file) {
        const formData = new FormData();
        formData.append('file', file);
        return this.request('/api/upload', {
            method: 'POST',
            body: formData
        });
    }
};
