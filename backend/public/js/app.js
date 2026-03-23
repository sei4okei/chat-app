// Глобальное состояние
let currentUser = null;
let currentChatId = null;
let allUsers = [];
let userChats = [];
let socketManager = null;

// Функции приложения
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
    // Обновляем счётчик в списке чатов
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
    socketManager.sendMessage(currentChatId, currentUser.id, content, fileUrl);
}

async function handleFileUpload(file) {
    try {
        const data = await API.uploadFile(file);
        if (data.fileUrl) await sendMessage(null, data.fileUrl);
    } catch (err) {
        console.error('Upload failed:', err);
    }
}

async function init() {
    let username = localStorage.getItem('chat_username');
    if (!username) {
        username = prompt('Введите ваше имя:', 'User' + Math.floor(Math.random()*1000));
        if (!username) username = 'Anonymous';
        localStorage.setItem('chat_username', username);
    }
    try {
        currentUser = await API.createUser(username);
        UI.setCurrentUsername(currentUser.username);
        await loadUsers();
        await loadChats();

        // Инициализация сокетов
        socketManager = new SocketManager();
        socketManager.connect(currentUser.id, {
            onMessage: (chatId, message) => {
                if (chatId === currentChatId) {
                    UI.appendMessage(message, currentUser.id);
                } else {
                    // Увеличить счётчик непрочитанных
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
                // Также обновить статус в списке чатов
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
                    // Обновить галочки у всех своих сообщений в этом чате
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

        // Навешиваем обработчики UI
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
                    if (!newUsername) return;
                    const updated = await API.updateUser(currentUser.id, {
                        username: newUsername,
                        avatar: newAvatar || null
                    });
                    currentUser = updated;
                    UI.setCurrentUsername(updated.username);
                    localStorage.setItem('chat_username', updated.username);
                    await loadUsers();
                    await loadChats();
                },
                () => {}
            );
        };
        // Табы
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
    } catch (err) {
        console.error('Init error:', err);
    }
}

// Запуск после загрузки страницы
window.addEventListener('DOMContentLoaded', init);
