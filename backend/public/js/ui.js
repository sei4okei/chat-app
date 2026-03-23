// Вспомогательные функции
function getAvatarHtml(avatarUrl, username) {
    if (avatarUrl) {
        return `<img src="${avatarUrl}" alt="Avatar" class="avatar-img">`;
    } else {
        const initial = username ? username.charAt(0).toUpperCase() : '?';
        return `<div class="avatar-placeholder">${initial}</div>`;
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

const UI = {
    // DOM элементы
    usersList: document.getElementById('usersList'),
    chatsList: document.getElementById('chatsList'),
    messagesDiv: document.getElementById('messages'),
    currentChatNameSpan: document.getElementById('currentChatName'),
    messageInput: document.getElementById('messageInput'),
    sendBtn: document.getElementById('sendBtn'),
    fileInput: document.getElementById('fileInput'),
    createChatBtn: document.getElementById('createChatBtn'),
    editProfileBtn: document.getElementById('editProfileBtn'),
    currentUsernameSpan: document.getElementById('currentUsername'),
    profileModal: document.getElementById('profileModal'),
    createChatModal: document.getElementById('createChatModal'),

    renderUsers(users, currentUserId, onUserClick) {
        this.usersList.innerHTML = '';
        users.forEach(user => {
            const div = document.createElement('div');
            div.className = 'user-item';
            div.setAttribute('data-user-id', user.id);
            div.innerHTML = `
                <div class="avatar">
                    ${getAvatarHtml(user.avatar, user.username)}
                    <div class="status-dot ${user.online ? 'online' : 'offline'}"></div>
                </div>
                <div class="user-info"><div class="username">${escapeHtml(user.username)}</div></div>
            `;
            div.onclick = () => onUserClick(user.id);
            this.usersList.appendChild(div);
        });
    },

    renderChats(chats, currentUserId, allUsers, onChatClick) {
        this.chatsList.innerHTML = '';
        if (!chats.length) {
            this.chatsList.innerHTML = '<div style="padding: 12px; text-align: center; color: #6c757d;">Нет чатов</div>';
            return;
        }
        chats.forEach(chat => {
            const div = document.createElement('div');
            div.className = 'chat-item';
            div.setAttribute('data-chat-id', chat.id);
            let chatName = chat.name;
            let otherUser = null;
            if (!chatName && chat.participants) {
                otherUser = chat.participants.find(p => p.id !== currentUserId);
                chatName = otherUser ? otherUser.username : 'Без названия';
            }
            const avatarUrl = otherUser ? otherUser.avatar : null;
            const onlineStatus = otherUser ? (allUsers.find(u => u.id === otherUser.id)?.online || false) : false;
            const unreadCount = chat.unread_count || 0;
            div.innerHTML = `
                <div class="avatar">
                    ${getAvatarHtml(avatarUrl, chatName)}
                    ${otherUser ? `<div class="status-dot ${onlineStatus ? 'online' : 'offline'}"></div>` : ''}
                </div>
                <div class="chat-info">
                    <div class="chat-name">${escapeHtml(chatName)}</div>
                    ${unreadCount > 0 ? `<span class="unread-badge">${unreadCount}</span>` : ''}
                </div>
            `;
            div.onclick = () => onChatClick(chat.id);
            this.chatsList.appendChild(div);
        });
    },

appendMessage(msg, currentUserId) {
    const isOwn = msg.user_id === currentUserId;
    const div = document.createElement('div');
    div.className = `message ${isOwn ? 'own' : ''}`;
    if (msg.tempId) {
        div.setAttribute('data-temp-id', msg.tempId);
    }
    if (msg.id) {
        div.setAttribute('data-message-id', msg.id);
    }

    let content = '';
    if (msg.content) {
        content += `<div class="message-bubble">${escapeHtml(msg.content)}</div>`;
    }
    if (msg.file_url) {
        const url = msg.file_url;
        if (url.match(/\.(jpeg|jpg|gif|png|webp)$/i)) {
            content += `<img class="message-media" src="${url}" alt="image" onclick="window.open('${url}')">`;
        } else if (url.match(/\.(mp4|webm|ogg)$/i)) {
            content += `<video class="message-media" controls src="${url}"></video>`;
        } else {
            content += `<a href="${url}" target="_blank">Файл</a>`;
        }
    }

    let statusHtml = '';
    if (isOwn) {
        const isRead = msg.read_at !== null;
        statusHtml = `<span class="message-status ${isRead ? 'status-read' : 'status-sent'}">${isRead ? '✓✓' : '✓'}</span>`;
    }
    const timeStr = msg.created_at ? new Date(msg.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '';
    div.innerHTML = content + `<div class="message-meta">${escapeHtml(msg.username)} • ${timeStr} ${statusHtml}</div>`;

    this.messagesDiv.appendChild(div);
    this.messagesDiv.scrollTop = this.messagesDiv.scrollHeight;
},
    clearMessages() {
        this.messagesDiv.innerHTML = '';
    },

    updateUserStatusDot(userId, online) {
        const userEl = document.querySelector(`.user-item[data-user-id="${userId}"]`);
        if (userEl) {
            const dot = userEl.querySelector('.status-dot');
            if (dot) dot.className = `status-dot ${online ? 'online' : 'offline'}`;
        }
    },

    showProfileModal(username, avatar, onSave, onClose) {
        document.getElementById('profileUsername').value = username;
        document.getElementById('profileAvatar').value = avatar || '';
        document.getElementById('profileOldPassword').value = '';
        document.getElementById('profileNewPassword').value = '';
        this.profileModal.style.display = 'flex';
        const saveBtn = document.getElementById('saveProfileBtn');
        const closeBtn = document.getElementById('closeProfileBtn');
        const newSave = () => { onSave(); this.profileModal.style.display = 'none'; saveBtn.removeEventListener('click', newSave); closeBtn.removeEventListener('click', newClose); };
        const newClose = () => { onClose(); this.profileModal.style.display = 'none'; saveBtn.removeEventListener('click', newSave); closeBtn.removeEventListener('click', newClose); };
        saveBtn.addEventListener('click', newSave);
        closeBtn.addEventListener('click', newClose);
    },

    showCreateChatModal(users, onCreate, onClose) {
        const select = document.getElementById('chatParticipants');
        select.innerHTML = '';
        users.forEach(user => {
            const opt = document.createElement('option');
            opt.value = user.id;
            opt.textContent = user.username;
            select.appendChild(opt);
        });
        this.createChatModal.style.display = 'flex';
        const confirmBtn = document.getElementById('confirmCreateChatBtn');
        const closeBtn = document.getElementById('closeCreateChatBtn');
        const newConfirm = () => { onCreate(); this.createChatModal.style.display = 'none'; confirmBtn.removeEventListener('click', newConfirm); closeBtn.removeEventListener('click', newClose); };
        const newClose = () => { onClose(); this.createChatModal.style.display = 'none'; confirmBtn.removeEventListener('click', newConfirm); closeBtn.removeEventListener('click', newClose); };
        confirmBtn.addEventListener('click', newConfirm);
        closeBtn.addEventListener('click', newClose);
    },

    setCurrentChatName(name) {
        this.currentChatNameSpan.textContent = name || 'Чат';
    },

    setCurrentUsername(username) {
        this.currentUsernameSpan.textContent = username;
    }
};
