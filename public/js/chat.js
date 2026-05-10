(function () {
  const socket = io();
  let currentUsername = '';

  // DOM elements
  const usernameScreen = document.getElementById('username-screen');
  const chatScreen = document.getElementById('chat-screen');
  const usernameInput = document.getElementById('username-input');
  const usernameBtn = document.getElementById('username-btn');
  const messagesContainer = document.getElementById('messages');
  const messageInput = document.getElementById('message-input');
  const sendBtn = document.getElementById('send-btn');
  const onlineUsersList = document.getElementById('online-users');
  const userCount = document.getElementById('user-count');
  const fileInput = document.getElementById('file-input');
  const fileList = document.getElementById('file-list');
  const uploadStatus = document.getElementById('upload-status');
  const toggleSidebarBtn = document.getElementById('toggle-sidebar');
  const sidebar = document.getElementById('sidebar');

  // Username submission
  function submitUsername() {
    const username = usernameInput.value.trim();
    if (!username) return;

    currentUsername = username;
    socket.emit('set-username', username);

    usernameScreen.classList.add('hidden');
    chatScreen.classList.remove('hidden');
    messageInput.focus();

    // Load existing files
    loadFiles();
  }

  usernameBtn.addEventListener('click', submitUsername);
  usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') submitUsername();
  });

  // Send message
  function sendMessage() {
    const text = messageInput.value.trim();
    if (!text) return;

    socket.emit('chat-message', { text });
    messageInput.value = '';
  }

  sendBtn.addEventListener('click', sendMessage);
  messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
  });

  // Receive chat message
  socket.on('chat-message', (data) => {
    const isOwn = data.username === currentUsername;
    appendMessage(data, isOwn);
  });

  // User joined
  socket.on('user-joined', (data) => {
    appendSystemMessage(data.username + ' joined the chat');
    updateOnlineUsers(data.onlineUsers);
  });

  // User left
  socket.on('user-left', (data) => {
    appendSystemMessage(data.username + ' left the chat');
    updateOnlineUsers(data.onlineUsers);
  });

  // File shared
  socket.on('file-shared', (data) => {
    appendFileNotification(data);
    addFileToList(data.filename, data.originalName, data.size);
  });

  // Append message to chat
  function appendMessage(data, isOwn) {
    const div = document.createElement('div');
    div.className = 'message ' + (isOwn ? 'own' : 'other');

    const time = new Date(data.timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });

    div.innerHTML =
      '<div class="message-username">' + escapeHtml(data.username) + '</div>' +
      '<div class="message-text">' + escapeHtml(data.text) + '</div>' +
      '<div class="message-time">' + time + '</div>';

    messagesContainer.appendChild(div);
    scrollToBottom();
  }

  // Append system message
  function appendSystemMessage(text) {
    const div = document.createElement('div');
    div.className = 'message system';
    div.textContent = text;
    messagesContainer.appendChild(div);
    scrollToBottom();
  }

  // Append file notification
  function appendFileNotification(data) {
    const div = document.createElement('div');
    div.className = 'message file-notification';
    div.innerHTML =
      '<strong>' + escapeHtml(data.username) + '</strong> shared a file: ' +
      '<a href="/uploads/' + encodeURIComponent(data.filename) + '" target="_blank">' +
      escapeHtml(data.originalName) + '</a>' +
      ' (' + formatFileSize(data.size) + ')';
    messagesContainer.appendChild(div);
    scrollToBottom();
  }

  // Update online users list
  function updateOnlineUsers(users) {
    onlineUsersList.innerHTML = '';
    userCount.textContent = users.length;

    users.forEach((user) => {
      const li = document.createElement('li');
      li.textContent = user;
      if (user === currentUsername) {
        li.style.fontWeight = '600';
      }
      onlineUsersList.appendChild(li);
    });
  }

  // File upload
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;

    uploadStatus.textContent = 'Uploading...';

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/upload', {
        method: 'POST',
        body: formData
      });

      if (!response.ok) throw new Error('Upload failed');

      const data = await response.json();
      uploadStatus.textContent = 'Upload complete!';

      // Notify others via socket
      socket.emit('file-shared', {
        filename: data.filename,
        originalName: data.originalName,
        size: data.size
      });

      setTimeout(() => {
        uploadStatus.textContent = '';
      }, 3000);
    } catch (err) {
      uploadStatus.textContent = 'Upload failed. Try again.';
      console.error('Upload error:', err);
    }

    // Reset input
    fileInput.value = '';
  });

  // Load existing files from server
  async function loadFiles() {
    try {
      const response = await fetch('/api/files');
      const files = await response.json();
      files.forEach((f) => {
        addFileToList(f.filename, f.filename, f.size);
      });
    } catch (err) {
      console.error('Failed to load files:', err);
    }
  }

  // Add file to sidebar list
  function addFileToList(filename, displayName, size) {
    const div = document.createElement('div');
    div.className = 'file-item';
    div.innerHTML =
      '<a href="/uploads/' + encodeURIComponent(filename) + '" target="_blank">' +
      escapeHtml(displayName) + '</a>' +
      '<span class="file-size">' + formatFileSize(size) + '</span>';
    fileList.appendChild(div);
  }

  // Toggle sidebar on mobile
  toggleSidebarBtn.addEventListener('click', () => {
    sidebar.classList.toggle('open');
  });

  // Utility functions
  function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }
})();
