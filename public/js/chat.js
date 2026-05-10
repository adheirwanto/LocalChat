(function () {
  const socket = io();
  let currentUsername = '';
  let currentRoomId = 'general';

  // Recording state
  let isRecording = false;
  let mediaRecorder = null;
  let recordedChunks = [];
  let recordingStartTime = 0;

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
  const roomListEl = document.getElementById('room-list');
  const createRoomInput = document.getElementById('create-room-input');
  const createRoomBtn = document.getElementById('create-room-btn');
  const currentRoomNameEl = document.getElementById('current-room-name');
  const logoutBtn = document.getElementById('logout-btn');
  const attachBtn = document.getElementById('attach-btn');
  const attachFileInput = document.getElementById('attach-file-input');
  const micBtn = document.getElementById('mic-btn');
  const recordingIndicator = document.getElementById('recording-indicator');
  const inlineUploadStatus = document.getElementById('inline-upload-status');

  // Check for existing session on load
  const savedToken = localStorage.getItem('localchat_token');
  if (savedToken) {
    socket.emit('reconnect-session', savedToken);
  }

  // --- Session events ---

  socket.on('login-success', (data) => {
    currentUsername = data.username;
    localStorage.setItem('localchat_token', data.sessionToken);
    enterChat();
  });

  socket.on('reconnect-success', (data) => {
    currentUsername = data.username;
    localStorage.setItem('localchat_token', data.sessionToken);
    enterChat();
  });

  socket.on('reconnect-failed', () => {
    localStorage.removeItem('localchat_token');
    usernameScreen.classList.remove('hidden');
    chatScreen.classList.add('hidden');
  });

  function enterChat() {
    usernameScreen.classList.add('hidden');
    chatScreen.classList.remove('hidden');
    messageInput.focus();
    socket.emit('get-rooms');
    loadRoomMessages(currentRoomId);
    loadFiles();
  }

  // --- Username submission ---

  function submitUsername() {
    const username = usernameInput.value.trim();
    if (!username) return;

    socket.emit('set-username', username);
  }

  socket.on('username-taken', (data) => {
    const errorMsg = data.error || 'Username is already taken';
    alert(errorMsg);
    usernameInput.focus();
  });

  usernameBtn.addEventListener('click', submitUsername);
  usernameInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') submitUsername();
  });

  // --- User events ---

  socket.on('user-joined', (data) => {
    appendSystemMessage(data.username + ' joined the chat');
    updateOnlineUsers(data.onlineUsers);
  });

  socket.on('user-left', (data) => {
    appendSystemMessage(data.username + ' left the chat');
    updateOnlineUsers(data.onlineUsers);
  });

  // --- Room events ---

  socket.on('room-list', (rooms) => {
    renderRoomList(rooms);
  });

  socket.on('room-created', (room) => {
    addRoomToList(room);
  });

  socket.on('room-messages', (data) => {
    if (data.roomId !== currentRoomId) return;
    messagesContainer.innerHTML = '';
    data.messages.forEach((msg) => {
      const isOwn = msg.username === currentUsername;
      if (msg.type === 'voice') {
        appendVoiceNote({
          username: msg.username,
          fileUrl: msg.file_url,
          duration: 0,
          timestamp: msg.timestamp
        }, isOwn);
      } else if (msg.type === 'file') {
        appendFileNotification({
          username: msg.username,
          filename: msg.file_url ? msg.file_url.replace('/uploads/', '') : '',
          originalName: msg.text || 'file',
          size: 0,
          timestamp: msg.timestamp
        }, isOwn);
      } else {
        appendMessage(msg, isOwn);
      }
    });
  });

  socket.on('join-room-success', (data) => {
    socket.emit('get-rooms');
  });

  // --- Room management ---

  function renderRoomList(rooms) {
    roomListEl.innerHTML = '';
    rooms.forEach((room) => {
      addRoomToList(room);
    });
  }

  function addRoomToList(room) {
    if (document.getElementById('room-' + room.id)) return;

    const li = document.createElement('li');
    li.id = 'room-' + room.id;
    li.className = 'room-item' + (room.id === currentRoomId ? ' active' : '');
    li.textContent = room.name;
    li.dataset.roomId = room.id;
    li.addEventListener('click', () => switchRoom(room.id, room.name));
    roomListEl.appendChild(li);
  }

  function switchRoom(roomId, roomName) {
    if (roomId === currentRoomId) return;

    const prev = roomListEl.querySelector('.room-item.active');
    if (prev) prev.classList.remove('active');
    const next = document.getElementById('room-' + roomId);
    if (next) next.classList.add('active');

    currentRoomId = roomId;
    currentRoomNameEl.textContent = roomName;
    messagesContainer.innerHTML = '';

    socket.emit('join-room', roomId);
    loadRoomMessages(roomId);
  }

  function loadRoomMessages(roomId) {
    socket.emit('get-room-messages', roomId);
  }

  createRoomBtn.addEventListener('click', createRoom);
  createRoomInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') createRoom();
  });

  function createRoom() {
    const name = createRoomInput.value.trim();
    if (!name) return;
    socket.emit('create-room', { name });
    createRoomInput.value = '';
  }

  // --- Logout ---

  logoutBtn.addEventListener('click', () => {
    localStorage.removeItem('localchat_token');
    location.reload();
  });

  // --- Send message ---

  function sendMessage() {
    const text = messageInput.value.trim();
    if (!text) return;

    socket.emit('chat-message', { text, roomId: currentRoomId });
    messageInput.value = '';
  }

  sendBtn.addEventListener('click', sendMessage);
  messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') sendMessage();
  });

  // Receive chat message
  socket.on('chat-message', (data) => {
    if (data.roomId !== currentRoomId) return;
    const isOwn = data.username === currentUsername;
    appendMessage(data, isOwn);
  });

  // File shared
  socket.on('file-shared', (data) => {
    if (data.roomId !== currentRoomId) return;
    const isOwn = data.username === currentUsername;
    appendFileNotification(data, isOwn);
    addFileToList(data.filename, data.originalName, data.size);
  });

  // Voice note received
  socket.on('voice-note', (data) => {
    if (data.roomId !== currentRoomId) return;
    const isOwn = data.username === currentUsername;
    appendVoiceNote(data, isOwn);
  });

  // --- Inline file attachment ---

  attachBtn.addEventListener('click', () => {
    attachFileInput.click();
  });

  attachFileInput.addEventListener('change', async () => {
    const file = attachFileInput.files[0];
    if (!file) return;

    showInlineUploadStatus('Uploading...');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/upload', {
        method: 'POST',
        headers: {
          'X-Socket-ID': socket.id
        },
        body: formData
      });

      if (!response.ok) throw new Error('Upload failed');

      const data = await response.json();
      showInlineUploadStatus('Upload complete!');

      socket.emit('file-shared', {
        filename: data.filename,
        originalName: data.originalName,
        size: data.size,
        roomId: currentRoomId
      });

      setTimeout(() => {
        hideInlineUploadStatus();
      }, 3000);
    } catch (err) {
      showInlineUploadStatus('Upload failed. Try again.');
      setTimeout(() => {
        hideInlineUploadStatus();
      }, 3000);
      console.error('Upload error:', err);
    }

    attachFileInput.value = '';
  });

  function showInlineUploadStatus(text) {
    inlineUploadStatus.textContent = text;
    inlineUploadStatus.classList.remove('hidden');
  }

  function hideInlineUploadStatus() {
    inlineUploadStatus.classList.add('hidden');
    inlineUploadStatus.textContent = '';
  }

  // --- Voice note recording ---

  micBtn.addEventListener('click', toggleRecording);

  async function toggleRecording() {
    if (isRecording) {
      stopRecording();
    } else {
      await startRecording();
    }
  }

  async function startRecording() {
    // Check if mediaDevices API is available
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showMicError('Your browser does not support audio recording. Please use a modern browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      recordedChunks = [];
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      const options = mimeType ? { mimeType } : {};

      mediaRecorder = new MediaRecorder(stream, options);

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          recordedChunks.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());

        const duration = Math.round((Date.now() - recordingStartTime) / 1000);
        const blob = new Blob(recordedChunks, { type: mimeType || 'audio/webm' });

        uploadVoiceNote(blob, duration);
      };

      mediaRecorder.start();
      recordingStartTime = Date.now();
      isRecording = true;

      micBtn.classList.add('recording');
      recordingIndicator.classList.remove('hidden');
    } catch (err) {
      console.error('Microphone access denied:', err);
      showMicError('Microphone access denied. Make sure you accepted the security certificate and allowed microphone permission.');
    }
  }

  function showMicError(message) {
    showInlineUploadStatus(message);
    setTimeout(() => {
      hideInlineUploadStatus();
    }, 5000);
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    isRecording = false;
    micBtn.classList.remove('recording');
    recordingIndicator.classList.add('hidden');
  }

  async function uploadVoiceNote(blob, duration) {
    showInlineUploadStatus('Sending voice note...');

    const formData = new FormData();
    formData.append('voice', blob, 'voice-note.webm');

    try {
      const response = await fetch('/upload/voice', {
        method: 'POST',
        headers: {
          'X-Socket-ID': socket.id
        },
        body: formData
      });

      if (!response.ok) throw new Error('Voice upload failed');

      const data = await response.json();
      showInlineUploadStatus('Voice note sent!');

      socket.emit('voice-note', {
        filename: data.filename,
        duration,
        roomId: currentRoomId
      });

      setTimeout(() => {
        hideInlineUploadStatus();
      }, 2000);
    } catch (err) {
      showInlineUploadStatus('Failed to send voice note.');
      setTimeout(() => {
        hideInlineUploadStatus();
      }, 3000);
      console.error('Voice upload error:', err);
    }
  }

  // --- Message rendering ---

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

  function appendSystemMessage(text) {
    const div = document.createElement('div');
    div.className = 'message system';
    div.textContent = text;
    messagesContainer.appendChild(div);
    scrollToBottom();
  }

  function appendFileNotification(data, isOwn) {
    const div = document.createElement('div');
    div.className = 'message file-message ' + (isOwn ? 'own' : 'other');

    const time = data.timestamp ? new Date(data.timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    }) : '';

    const fileUrl = '/uploads/' + encodeURIComponent(data.filename);
    const sizeStr = data.size ? ' (' + formatFileSize(data.size) + ')' : '';

    div.innerHTML =
      '<div class="message-username">' + escapeHtml(data.username) + '</div>' +
      '<div class="file-attachment">' +
        '<svg class="file-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' +
        '<a href="' + fileUrl + '" target="_blank">' + escapeHtml(data.originalName) + '</a>' +
        '<span class="file-size-label">' + sizeStr + '</span>' +
      '</div>' +
      (time ? '<div class="message-time">' + time + '</div>' : '');

    messagesContainer.appendChild(div);
    scrollToBottom();
  }

  function appendVoiceNote(data, isOwn) {
    const div = document.createElement('div');
    div.className = 'message voice-message ' + (isOwn ? 'own' : 'other');

    const time = data.timestamp ? new Date(data.timestamp).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    }) : '';

    const audioUrl = data.fileUrl || '/uploads/' + encodeURIComponent(data.filename);
    const durationStr = data.duration ? formatDuration(data.duration) : '';

    div.innerHTML =
      '<div class="message-username">' + escapeHtml(data.username) + '</div>' +
      '<div class="voice-content">' +
        '<audio controls preload="metadata" src="' + audioUrl + '"></audio>' +
        (durationStr ? '<span class="voice-duration">' + durationStr + '</span>' : '') +
      '</div>' +
      (time ? '<div class="message-time">' + time + '</div>' : '');

    messagesContainer.appendChild(div);
    scrollToBottom();
  }

  // --- Online users ---

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

  // --- File upload (sidebar - keep existing) ---

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0];
    if (!file) return;

    uploadStatus.textContent = 'Uploading...';

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await fetch('/upload', {
        method: 'POST',
        headers: {
          'X-Socket-ID': socket.id
        },
        body: formData
      });

      if (!response.ok) throw new Error('Upload failed');

      const data = await response.json();
      uploadStatus.textContent = 'Upload complete!';

      socket.emit('file-shared', {
        filename: data.filename,
        originalName: data.originalName,
        size: data.size,
        roomId: currentRoomId
      });

      setTimeout(() => {
        uploadStatus.textContent = '';
      }, 3000);
    } catch (err) {
      uploadStatus.textContent = 'Upload failed. Try again.';
      console.error('Upload error:', err);
    }

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
    toggleSidebarOverlay(sidebar.classList.contains('open'));
  });

  // Sidebar overlay for mobile
  function toggleSidebarOverlay(show) {
    let overlay = document.querySelector('.sidebar-overlay');
    if (show) {
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'sidebar-overlay active';
        overlay.addEventListener('click', () => {
          sidebar.classList.remove('open');
          toggleSidebarOverlay(false);
        });
        document.body.appendChild(overlay);
      } else {
        overlay.classList.add('active');
      }
    } else {
      if (overlay) {
        overlay.classList.remove('active');
      }
    }
  }

  // --- Utilities ---

  function scrollToBottom() {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatFileSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return mins + ':' + (secs < 10 ? '0' : '') + secs;
  }
})();
