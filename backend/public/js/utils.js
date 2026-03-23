function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m]));
}

function getAvatarHtml(avatarUrl, username) {
    if (avatarUrl) return `<img src="${avatarUrl}" alt="avatar">`;
    return (username ? username[0].toUpperCase() : '?');
}

function formatTime(timestamp) {
    return new Date(timestamp).toLocaleTimeString();
}
