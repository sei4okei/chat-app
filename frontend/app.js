let token = null;
let currentUser = null;
let socket = null;
let currentChatId = null;
let currentTab = 'general'; // 'general' or 'private'
let chats = []; // список чатов (включая общий чат)
let generalChatId = null; // ID общего чата (создадим при старте, если нет)

// DOM элементы
const loginContainer = document.getElementById('login-container');
const chatContainer = document.getElementById('chat-container');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const nicknameInput = document.getElementById('nickname');
const loginBtn = document.getElementById('login-btn');
const registerBtn = document.getElementById('register-btn');
const errorMsg = document.getElementById('error-msg');
const userAvatar = document.getElementById('user-avatar');
const userNicknameSpan = document.getElementById('user-nickname');
const editProfileBtn = document.getElementById('edit-profile-btn');
const tabGeneral = document.getElementById('tab-general');
const tabPrivate = document.getElementById('tab-private');
const chatListDiv = document.getElementById('chat-list');
const chatHeader = document.getElementById('chat-header');
const messagesDiv = document.getElementById('messages');
const messageText = document.getElementById('message-text');
const fileInput = document.getElementById('file-input');
const sendBtn = document.getElementById('send-btn');
const editProfileModal = document.getElementById('edit-profile-modal');
const editNickname = document.getElementById('edit-nickname');
const editAvatar = document.getElementById('edit-avatar');
const saveProfileBtn = document.getElementById('save-profile-btn');
const closeModalBtn = document.getElementById('close-modal-btn');

// Функции API
async function apiRequest(endpoint, method = 'GET', body = null, isFile = false) {
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    let options = { method, headers };
    if (body) {
        if (isFile) {
            options.body = body;
        } else {
            headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(body);
        }
    }
    const res = await fetch(`/api${endpoint}`, options);
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Request failed');
    }
    return res.json();
}

async function login(username, password) {
    const data = await apiRequest('/login', 'POST', { username, password });
    token = data.token;
    currentUser = data.user;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(currentUser));
    initApp();
}

async function register(username, password, nickname) {
    const data = await apiRequest('/register', 'POST', { username, password, nickname });
    token = data.token;
    currentUser = data.user;
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(currentUser));
    initApp();
}

function initApp() {
    loginContainer.style.display = 'none';
    chatContainer.style.display = 'flex';
    updateUserInfo();
    connectWebSocket();
    loadChats();
    setupEventListeners();
}

function updateUserInfo() {
    userNicknameSpan.textContent = currentUser.nickname || currentUser.username;
    if (currentUser.avatar) {
        userAvatar.src = currentUser.avatar;
    } else {
        userAvatar.src = 'https://via.placeholder.com/40';
    }
}

function connectWebSocket() {
    socket = io('/', {
        auth: { token }
    });
    socket.on('connect', () => {
        console.log('Socket connected');
        // После подключения отправим комнаты, если уже загружены часы
        if (chats.length) {
            const chatIds = chats.map(c => c.id);
            socket.emit('join-chats', chatIds);
        }
    });
    socket.on('new-message', (message) => {
        // Если сообщение для текущего открытого чата, отображаем
        if (message.chat_id === currentChatId) {
            appendMessage(message);
        }
        // Также обновляем список чатов (последнее сообщение)
        updateChatLastMessage(message);
    });
}

async function loadChats() {
    const data = await apiRequest('/chats', 'GET');
    chats = data;
    // Найти или создать общий чат (группа со всеми)
    await ensureGeneralChat();
    renderChatList();
    // Если есть текущий чат, возможно, загрузить сообщения, но сначала дефолтный
    if (!currentChatId && chats.length > 0) {
        selectChat(chats[0].id);
    }
}

async function ensureGeneralChat() {
    // Проверим, есть ли чат с именем "General" и типом group, включающий всех пользователей
    // Но проще: создать чат, который называется "General", и добавлять всех пользователей при регистрации?
    // Для простоты: при первом входе пользователя проверим, существует ли чат с именем 'general' и добавим в него.
    // Но чтобы не усложнять, создадим отдельный чат "General" и добавим всех существующих пользователей.
    const general = chats.find(c => c.name === 'General');
    if (general) {
        generalChatId = general.id;
        return;
    }
    // Создаем общий чат, добавив всех пользователей (включая себя)
    // Получим всех пользователей
    const users = await apiRequest('/users', 'GET');
    const userIds = users.map(u => u.id);
    const data = await apiRequest('/chats/group', 'POST', { name: 'General', userIds });
    const newChat = { id: data.chatId, name: 'General', type: 'group' };
    chats.unshift(newChat);
    generalChatId = newChat.id;
    renderChatList();
}

function renderChatList() {
    chatListDiv.innerHTML = '';
    let filtered = [];
    if (currentTab === 'general') {
        filtered = chats.filter(c => c.name === 'General');
    } else {
        filtered = chats.filter(c => c.name !== 'General');
    }
    filtered.forEach(chat => {
        const div = document.createElement('div');
        div.className = 'chat-item';
        if (chat.id === currentChatId) div.classList.add('active');
        // Отображаем название: для личных чатов показываем имя собеседника, для групп - название
        let displayName = chat.name;
        if (chat.type === 'personal' && chat.members) {
            const other = chat.members.find(m => m.id !== currentUser.id);
            if (other) displayName = other.nickname || other.username;
        }
        div.textContent = displayName;
        div.addEventListener('click', () => selectChat(chat.id));
        chatListDiv.appendChild(div);
    });
}

async function selectChat(chatId) {
    currentChatId = chatId;
    // Загрузить сообщения
    const messages = await apiRequest(`/chats/${chatId}/messages`, 'GET');
    renderMessages(messages);
    // Обновить заголовок
    const chat = chats.find(c => c.id === chatId);
    if (chat) {
        let header = chat.name;
        if (chat.type === 'personal' && chat.members) {
            const other = chat.members.find(m => m.id !== currentUser.id);
            if (other) header = other.nickname || other.username;
        }
        chatHeader.textContent = header;
    }
    // Подсветить в списке
    document.querySelectorAll('.chat-item').forEach(el => el.classList.remove('active'));
    const activeItem = Array.from(chatListDiv.children).find(el => el.textContent === header);
    if (activeItem) activeItem.classList.add('active');
    // Отправить в сокет подписку на комнату, если еще не подписаны
    if (socket && socket.connected) {
        socket.emit('join-chats', [chatId]);
    }
}

function renderMessages(messages) {
    messagesDiv.innerHTML = '';
    messages.forEach(msg => appendMessage(msg));
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function appendMessage(msg) {
    const div = document.createElement('div');
    div.className = 'message';
    if (msg.user_id === currentUser.id) div.classList.add('own');
    // Отображаем ник отправителя (если не свое)
    if (msg.user_id !== currentUser.id) {
        const senderName = msg.nickname || msg.username;
        const nameSpan = document.createElement('div');
        nameSpan.textContent = senderName;
        nameSpan.style.fontWeight = 'bold';
        nameSpan.style.fontSize = '0.8em';
        div.appendChild(nameSpan);
    }
    if (msg.content) {
        const textSpan = document.createElement('div');
        textSpan.textContent = msg.content;
        div.appendChild(textSpan);
    }
    if (msg.file_url) {
        if (msg.file_type === 'image') {
            const img = document.createElement('img');
            img.src = msg.file_url;
            div.appendChild(img);
        } else if (msg.file_type === 'video') {
            const video = document.createElement('video');
            video.src = msg.file_url;
            video.controls = true;
            div.appendChild(video);
        }
    }
    const timeSpan = document.createElement('div');
    timeSpan.textContent = new Date(msg.created_at).toLocaleTimeString();
    timeSpan.style.fontSize = '0.7em';
    timeSpan.style.opacity = '0.7';
    div.appendChild(timeSpan);
    messagesDiv.appendChild(div);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

function updateChatLastMessage(message) {
    // Обновить список чатов: найти чат с таким id и обновить last_message
    const chat = chats.find(c => c.id === message.chat_id);
    if (chat) {
        chat.last_message = message.content || (message.file_url ? '[File]' : '');
        chat.last_activity = message.created_at;
        renderChatList(); // перерендерим для обновления последнего сообщения
    }
}

async function sendMessage() {
    const content = messageText.value.trim();
    const file = fileInput.files[0];
    if (!content && !file) return;
    if (!currentChatId) return;

    if (file) {
        // Отправляем через API загрузку файла, затем через сокет отправляем сообщение с file_url
        const formData = new FormData();
        formData.append('file', file);
        if (content) formData.append('content', content);
        formData.append('chatId', currentChatId);
        const newMsg = await apiRequest('/messages', 'POST', formData, true);
        // После успешной загрузки через API, сообщение уже сохранено в БД и возвращено.
        // Но мы также должны отправить через сокет, чтобы другие клиенты получили мгновенно.
        // Однако API уже вернул сообщение, можно его добавить локально и отправить через сокет для других.
        // Проще: после отправки через API, сервер уже разослал через сокет? Нет, в нашем роутере /messages нет отправки в сокет.
        // Значит, нужно при отправке через API также эмитить событие. Но можно объединить: при загрузке файла сначала загружаем, потом отправляем через сокет.
        // В текущей реализации /messages сохраняет в БД, но не эмитит. Поэтому после загрузки файла вызываем socket.emit('send-message') с file_url.
        socket.emit('send-message', {
            chatId: currentChatId,
            content: content || '',
            fileUrl: newMsg.file_url,
            fileType: newMsg.file_type
        });
        // Также локально отобразим (сокет вернет сообщение другим, но не нам, поэтому добавим локально)
        appendMessage(newMsg);
    } else {
        socket.emit('send-message', {
            chatId: currentChatId,
            content: content
        });
    }
    messageText.value = '';
    fileInput.value = '';
}

async function editProfile() {
    const newNickname = editNickname.value.trim();
    const avatarFile = editAvatar.files[0];
    const formData = new FormData();
    if (newNickname) formData.append('nickname', newNickname);
    if (avatarFile) formData.append('avatar', avatarFile);
    const updatedUser = await apiRequest('/profile', 'PUT', formData, true);
    currentUser = { ...currentUser, ...updatedUser };
    localStorage.setItem('user', JSON.stringify(currentUser));
    updateUserInfo();
    editProfileModal.style.display = 'none';
}

function setupEventListeners() {
    loginBtn.onclick = () => {
        login(usernameInput.value, passwordInput.value).catch(e => errorMsg.textContent = e.message);
    };
    registerBtn.onclick = () => {
        register(usernameInput.value, passwordInput.value, nicknameInput.value).catch(e => errorMsg.textContent = e.message);
    };
    sendBtn.onclick = sendMessage;
    messageText.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });
    tabGeneral.onclick = () => {
        currentTab = 'general';
        tabGeneral.classList.add('active');
        tabPrivate.classList.remove('active');
        renderChatList();
        if (generalChatId) selectChat(generalChatId);
    };
    tabPrivate.onclick = () => {
        currentTab = 'private';
        tabPrivate.classList.add('active');
        tabGeneral.classList.remove('active');
        renderChatList();
        if (chats.length && currentChatId !== generalChatId) {
            // выбрать первый приватный чат, если есть
            const firstPrivate = chats.find(c => c.id !== generalChatId);
            if (firstPrivate) selectChat(firstPrivate.id);
        }
    };
    editProfileBtn.onclick = () => {
        editNickname.value = currentUser.nickname || '';
        editAvatar.value = '';
        editProfileModal.style.display = 'flex';
    };
    saveProfileBtn.onclick = editProfile;
    closeModalBtn.onclick = () => editProfileModal.style.display = 'none';
}

// Проверка сохраненной сессии
const storedToken = localStorage.getItem('token');
const storedUser = localStorage.getItem('user');
if (storedToken && storedUser) {
    token = storedToken;
    currentUser = JSON.parse(storedUser);
    initApp();
}
