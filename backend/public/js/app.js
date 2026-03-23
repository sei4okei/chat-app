// Глобальное состояние
let currentUser = null;
let currentChatId = null;
let allUsers = [];
let userChats = [];
let socketManager = null;

function generateTempId() {
    return Date.now() + '-' + Math.random().toString(36).substr(2, 9);
}

async function checkAuth() {
    try {
        const user = await API.getMe();
        if (user) {
            currentUser = user;
            UI.setCurrentUsername(currentUser.username);
            await loadUsers();
            await loadChats();
            initSocket();
            showApp();
            return true;
        }
    } catch (e) {
        console.log('Not authenticated');
    }
    showAuth();
    return false;
}

function showApp() {
    document.getElementById('authModal').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
}

function showAuth() {
    document.getElementById('authModal').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
}

async function loadUsers() {
    try {
        const users = await API.getUsers();
        allUsers = users.filter(u => u.id !== currentUser.id);
        UI.renderUsers(allUsers, currentUser.id, (userId) => openPrivateChat(userId));
    } catch (err) {
        console.error('Failed to load users:', err);
    }
}

async function loadChats() {
    try {
        const chats = await API.getUserChats(currentUser.id);
        userChats = chats;
        UI.renderChats(userChats, currentUser.id, allUsers, (chatId) => openChat(chatId));
    } catch (err) {
        console.error('Failed to load chats:', err);
        userChats = [];
        UI.renderChats(userChats, currentUser.id, allUsers, () => {});
    }
}

async function openChat(chatId) {
    currentChatId = chatId;
    const chat = userChats.find(c => c.id === chatId);
    if (chat) {
        let chatName = chat.name;
        if (!chatName && chat.participants) {
            const other = chat.participants.find(p => p.id !== currentUser.id);
            chatName = other ? other.username : 'Без названия';
        }
        UI.setCurrentChatName(chatName);
    }
    UI.clearMessages();
    socketManager.joinChat(chatId);
    const messages = await API.getChatMessages(chatId);
    messages.forEach(msg => UI.appendMessage(msg, currentUser.id));
    await API.markChatRead(chatId, currentUser.id);
    const idx = userChats.findIndex(c => c.id === chatId);
    if (idx !== -1) {
        userChats[idx].unread_count = 0;
        UI.renderChats(userChats, currentUser.id, allUsers, (id) => openChat(id));
    }
}

async function openPrivateChat(userId) {
    const existing = userChats.find(chat => {
        if (chat.is_group) return false;
        const participants = chat.participants.map(p => p.id);
        return participants.includes(currentUser.id) && participants.includes(userId) && participants.length === 2;
    });
    if (existing) {
        openChat(existing.id);
    } else {
        const newChat = await API.createChat({
            participants: [currentUser.id, userId],
            isGroup: false
        });
        await loadChats();
        openChat(newChat.id);
    }
}

async function sendMessage(content, fileUrl = null) {
    if (!currentChatId) return;
    if (!content && !fileUrl) return;
    const tempId = generateTempId();
    const pendingMessage = {
        id: null,
        tempId: tempId,
        user_id: currentUser.id,
        username: currentUser.username,
        avatar: currentUser.avatar,
        content: content || '',
        file_url: fileUrl,
        created_at: new Date().toISOString(),
        read_at: null
    };
    UI.appendMessage(pendingMessage, currentUser.id);
    socketManager.sendMessage(currentChatId, currentUser.id, content, fileUrl, tempId);
}

async function handleFileUpload(file) {
    try {
        const data = await API.uploadFile(file);
        if (data.fileUrl) await sendMessage(null, data.fileUrl);
    } catch (err) {
        console.error('Upload failed:', err);
    }
}

function initSocket() {
    socketManager = new SocketManager();
    socketManager.connect(currentUser.id, {
        onMessage: (chatId, message) => {
            if (chatId === currentChatId) {
                if (message.tempId) {
                    const existingMsg = document.querySelector(`.message[data-temp-id="${message.tempId}"]`);
                    if (existingMsg) {
                        const statusSpan = existingMsg.querySelector('.message-status');
                        if (statusSpan) {
                            statusSpan.className = 'message-status status-sent';
                            statusSpan.innerHTML = '✓';
                        }
                        existingMsg.dataset.messageId = message.id;
                        if (message.read_at) {
                            statusSpan.className = 'message-status status-read';
                            statusSpan.innerHTML = '✓✓';
                        }
                        return;
                    }
                }
                UI.appendMessage(message, currentUser.id);
                if (message.user_id !== currentUser.id) {
                    API.markChatRead(chatId, currentUser.id);
                }
            } else {
                const idx = userChats.findIndex(c => c.id === chatId);
                if (idx !== -1) {
                    userChats[idx].unread_count = (userChats[idx].unread_count || 0) + 1;
                    UI.renderChats(userChats, currentUser.id, allUsers, (id) => openChat(id));
                }
            }
        },
        onUserOnline: (userId) => {
            const user = allUsers.find(u => u.id === userId);
            if (user) user.online = true;
            UI.updateUserStatusDot(userId, true);
            UI.renderChats(userChats, currentUser.id, allUsers, (id) => openChat(id));
        },
        onUserOffline: (userId) => {
            const user = allUsers.find(u => u.id === userId);
            if (user) user.online = false;
            UI.updateUserStatusDot(userId, false);
            UI.renderChats(userChats, currentUser.id, allUsers, (id) => openChat(id));
        },
        onChatRead: (chatId) => {
            if (chatId === currentChatId) {
                document.querySelectorAll('.message.own').forEach(msgDiv => {
                    const statusSpan = msgDiv.querySelector('.message-status');
                    if (statusSpan) {
                        statusSpan.className = 'message-status status-read';
                        statusSpan.innerHTML = '✓✓';
                    }
                });
            }
            const idx = userChats.findIndex(c => c.id === chatId);
            if (idx !== -1) {
                userChats[idx].unread_count = 0;
                UI.renderChats(userChats, currentUser.id, allUsers, (id) => openChat(id));
            }
        }
    });
}

function initUI() {
    UI.sendBtn.onclick = () => {
        const text = UI.messageInput.value.trim();
        if (text) {
            sendMessage(text);
            UI.messageInput.value = '';
        }
    };
    UI.messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            UI.sendBtn.click();
        }
    });
    UI.fileInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (file) await handleFileUpload(file);
        UI.fileInput.value = '';
    };
    UI.createChatBtn.onclick = () => {
        UI.showCreateChatModal(allUsers, async () => {
            const name = document.getElementById('chatName').value;
            const selected = Array.from(document.getElementById('chatParticipants').selectedOptions).map(opt => parseInt(opt.value));
            if (selected.length < 1) {
                alert('Выберите хотя бы одного участника');
                return;
            }
            const participants = [currentUser.id, ...selected];
            await API.createChat({
                name: name || null,
                participants,
                isGroup: participants.length > 2
            });
            await loadChats();
        }, () => {});
    };
    UI.editProfileBtn.onclick = () => {
        UI.showProfileModal(currentUser.username, currentUser.avatar,
            async () => {
                const newUsername = document.getElementById('profileUsername').value.trim();
                const newAvatar = document.getElementById('profileAvatar').value.trim();
                const newPassword = document.getElementById('profileNewPassword').value.trim();
                const oldPassword = document.getElementById('profileOldPassword').value.trim();

                if (newUsername) {
                    const updated = await API.updateUser(currentUser.id, {
                        username: newUsername,
                        avatar: newAvatar || null
                    });
                    currentUser = updated;
                    UI.setCurrentUsername(updated.username);
                    localStorage.setItem('chat_username', updated.username);
                    await loadUsers();
                    await loadChats();
                }

                if (newPassword && oldPassword) {
                    try {
                        await API.changePassword(currentUser.id, oldPassword, newPassword);
                        alert('Пароль изменён');
                    } catch (err) {
                        alert('Ошибка смены пароля: ' + err.message);
                    }
                }
            },
            () => {}
        );
    };
    document.querySelectorAll('.tab').forEach(tab => {
        tab.onclick = () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            const tabName = tab.dataset.tab;
            UI.usersList.style.display = tabName === 'users' ? 'block' : 'none';
            UI.chatsList.style.display = tabName === 'chats' ? 'block' : 'none';
        };
    });
    UI.usersList.style.display = 'block';
    UI.chatsList.style.display = 'none';
}

// Авторизация
function initAuth() {
    const authModal = document.getElementById('authModal');
    const authTitle = document.getElementById('authTitle');
    const authSubmit = document.getElementById('authSubmit');
    const authToggle = document.getElementById('authToggle');
    const authUsername = document.getElementById('authUsername');
    const authPassword = document.getElementById('authPassword');
    const authError = document.getElementById('authError');

    let isLogin = true;

    authToggle.onclick = () => {
        isLogin = !isLogin;
        authTitle.innerText = isLogin ? 'Вход' : 'Регистрация';
        authSubmit.innerText = isLogin ? 'Войти' : 'Зарегистрироваться';
        authToggle.innerText = isLogin ? 'Нет аккаунта? Зарегистрироваться' : 'Уже есть аккаунт? Войти';
        authError.innerText = '';
    };

    authSubmit.onclick = async () => {
        const username = authUsername.value.trim();
        const password = authPassword.value.trim();
        if (!username || !password) {
            authError.innerText = 'Заполните оба поля';
            return;
        }
        try {
            let user;
            if (isLogin) {
                user = await API.login(username, password);
            } else {
                user = await API.register(username, password);
            }
            currentUser = user;
            UI.setCurrentUsername(currentUser.username);
            await loadUsers();
            await loadChats();
            initSocket();
            showApp();
        } catch (err) {
            authError.innerText = err.message || 'Ошибка';
        }
    };
}

// Запуск
window.addEventListener('DOMContentLoaded', () => {
    initUI();
    initAuth();
    checkAuth();
});
