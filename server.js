const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');
const db = require('./database/db');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3000;
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Multer configuration for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext);
    cb(null, base + '-' + uniqueSuffix + ext);
  }
});

const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB max

// Serve static files from public/
app.use(express.static(path.join(__dirname, 'public')));

// Runtime state: socket-to-user mapping (online presence)
const onlineUsers = new Map(); // socketId -> username
const registeredSockets = new Set(); // socket IDs that have registered a username

// File upload endpoint (requires authenticated socket)
app.post('/upload', (req, res, next) => {
  const socketId = req.headers['x-socket-id'];
  if (!socketId || !registeredSockets.has(socketId)) {
    return res.status(401).json({ error: 'Unauthorized: must be a registered user' });
  }
  next();
}, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  const fileInfo = {
    originalName: req.file.originalname,
    filename: req.file.filename,
    size: req.file.size
  };
  res.json(fileInfo);
});

// Voice note upload endpoint (requires authenticated socket)
const voiceStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname) || '.webm';
    cb(null, 'voice-' + uniqueSuffix + ext);
  }
});

const voiceUpload = multer({ storage: voiceStorage, limits: { fileSize: 25 * 1024 * 1024 } }); // 25MB max

app.post('/upload/voice', (req, res, next) => {
  const socketId = req.headers['x-socket-id'];
  if (!socketId || !registeredSockets.has(socketId)) {
    return res.status(401).json({ error: 'Unauthorized: must be a registered user' });
  }
  next();
}, voiceUpload.single('voice'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No audio file uploaded' });
  }
  const fileInfo = {
    filename: req.file.filename,
    size: req.file.size
  };
  res.json(fileInfo);
});

// File download endpoint
app.get('/uploads/:filename', (req, res) => {
  const filename = req.params.filename;

  const resolved = path.resolve(UPLOADS_DIR, filename);
  if (!resolved.startsWith(UPLOADS_DIR)) {
    return res.status(400).json({ error: 'Invalid filename' });
  }

  if (!fs.existsSync(resolved)) {
    return res.status(404).json({ error: 'File not found' });
  }
  res.download(resolved);
});

// List uploaded files
app.get('/api/files', (req, res) => {
  fs.readdir(UPLOADS_DIR, (err, files) => {
    if (err) {
      return res.status(500).json({ error: 'Unable to read files' });
    }
    const fileList = files
      .filter(f => f !== '.gitkeep')
      .map(f => {
        const stats = fs.statSync(path.join(UPLOADS_DIR, f));
        return {
          filename: f,
          size: stats.size,
          uploadedAt: stats.mtime
        };
      });
    res.json(fileList);
  });
});

// Helper: get list of online usernames
function getOnlineUsernames() {
  return Array.from(onlineUsers.values());
}

// Socket.IO events
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on('set-username', (username) => {
    if (typeof username !== 'string') return;
    username = username.trim();
    if (!username || username.length > 20) return;

    // Check if username is already online (case-insensitive)
    const lowerUsername = username.toLowerCase();
    const onlineList = getOnlineUsernames();
    const isTaken = onlineList.some(u => u.toLowerCase() === lowerUsername);
    if (isTaken) {
      socket.emit('username-taken', { error: 'Username is already taken' });
      return;
    }

    // Create or retrieve user from DB
    let user = db.getUserByUsernameCaseInsensitive(username);
    let sessionToken;
    if (!user) {
      const created = db.createUser(username);
      sessionToken = created.sessionToken;
    } else {
      // Use existing user record but use the stored username casing
      username = user.username;
      sessionToken = user.session_token;
    }

    // Register socket
    onlineUsers.set(socket.id, username);
    registeredSockets.add(socket.id);
    socket.username = username;

    // Auto-join General room
    db.addRoomMember('general', username);
    socket.join('general');

    // Join all user rooms in socket.io
    const userRooms = db.getUserRooms(username);
    userRooms.forEach(room => {
      socket.join(room.id);
    });

    // Notify all users
    io.emit('user-joined', {
      username,
      onlineUsers: getOnlineUsernames()
    });

    // Send session token to client
    socket.emit('login-success', { username, sessionToken });

    console.log(`User joined: ${username}`);
  });

  socket.on('reconnect-session', (token) => {
    if (typeof token !== 'string' || !token) return;

    const user = db.getUserByToken(token);
    if (!user) {
      socket.emit('reconnect-failed');
      return;
    }

    const username = user.username;

    // Check if already online
    const onlineList = getOnlineUsernames();
    if (onlineList.some(u => u.toLowerCase() === username.toLowerCase())) {
      socket.emit('reconnect-failed');
      return;
    }

    // Register socket
    onlineUsers.set(socket.id, username);
    registeredSockets.add(socket.id);
    socket.username = username;

    // Auto-join General room
    db.addRoomMember('general', username);
    socket.join('general');

    // Join all user rooms in socket.io
    const userRooms = db.getUserRooms(username);
    userRooms.forEach(room => {
      socket.join(room.id);
    });

    // Notify all users
    io.emit('user-joined', {
      username,
      onlineUsers: getOnlineUsernames()
    });

    // Confirm reconnect to client
    socket.emit('reconnect-success', { username, sessionToken: user.session_token });

    console.log(`User reconnected: ${username}`);
  });

  socket.on('get-rooms', () => {
    if (!socket.username) return;
    const rooms = db.getRooms();
    socket.emit('room-list', rooms);
  });

  socket.on('create-room', (data) => {
    if (!socket.username) return;
    const name = typeof data === 'string' ? data.trim() : (data && data.name ? data.name.trim() : '');
    if (!name || name.length > 50) return;

    const room = db.createRoom(name, socket.username);
    socket.join(room.id);

    // Broadcast new room to all connected users
    io.emit('room-created', room);
  });

  socket.on('join-room', (roomId) => {
    if (!socket.username) return;
    if (typeof roomId !== 'string') return;

    const room = db.getRoom(roomId);
    if (!room) return;

    db.addRoomMember(roomId, socket.username);
    socket.join(roomId);

    socket.emit('join-room-success', { roomId, room });
  });

  socket.on('leave-room', (roomId) => {
    if (!socket.username) return;
    if (typeof roomId !== 'string') return;
    // Cannot leave General room
    if (roomId === 'general') return;

    db.removeRoomMember(roomId, socket.username);
    socket.leave(roomId);

    socket.emit('leave-room-success', { roomId });
  });

  socket.on('get-room-messages', (roomId) => {
    if (!socket.username) return;
    if (typeof roomId !== 'string') return;

    const messages = db.getRoomMessages(roomId, 100);
    socket.emit('room-messages', { roomId, messages });
  });

  socket.on('chat-message', (data) => {
    if (!socket.username) return;
    if (typeof data.text !== 'string' || data.text.length === 0 || data.text.length > 5000) return;

    const roomId = data.roomId || 'general';
    const timestamp = new Date().toISOString();

    // Persist message
    const msgId = db.saveMessage({
      roomId,
      username: socket.username,
      text: data.text,
      type: 'text',
      timestamp
    });

    const message = {
      id: msgId,
      username: socket.username,
      text: data.text,
      timestamp,
      socketId: socket.id,
      roomId
    };

    // Broadcast to room only
    io.to(roomId).emit('chat-message', message);
  });

  socket.on('file-shared', (data) => {
    if (!socket.username) return;
    if (typeof data.filename !== 'string' || data.filename.length > 500) return;
    if (typeof data.originalName !== 'string' || data.originalName.length > 500) return;
    if (typeof data.size !== 'number') return;

    const roomId = data.roomId || 'general';
    const timestamp = new Date().toISOString();

    // Persist file message
    db.saveMessage({
      roomId,
      username: socket.username,
      text: data.originalName,
      type: 'file',
      fileUrl: '/uploads/' + data.filename,
      timestamp
    });

    const fileNotification = {
      username: socket.username,
      filename: data.filename,
      originalName: data.originalName,
      size: data.size,
      timestamp,
      socketId: socket.id,
      roomId
    };

    // Broadcast to room only
    io.to(roomId).emit('file-shared', fileNotification);
  });

  socket.on('voice-note', (data) => {
    if (!socket.username) return;
    if (typeof data.filename !== 'string' || data.filename.length > 500) return;

    const roomId = data.roomId || 'general';
    const duration = typeof data.duration === 'number' ? data.duration : 0;
    const timestamp = new Date().toISOString();

    // Persist voice message
    db.saveMessage({
      roomId,
      username: socket.username,
      text: '',
      type: 'voice',
      fileUrl: '/uploads/' + data.filename,
      timestamp
    });

    const voiceData = {
      username: socket.username,
      filename: data.filename,
      fileUrl: '/uploads/' + data.filename,
      duration,
      timestamp,
      socketId: socket.id,
      roomId
    };

    // Broadcast to room only
    io.to(roomId).emit('voice-note', voiceData);
  });

  socket.on('disconnect', () => {
    const username = onlineUsers.get(socket.id);
    onlineUsers.delete(socket.id);
    registeredSockets.delete(socket.id);

    if (username) {
      io.emit('user-left', {
        username,
        onlineUsers: getOnlineUsernames()
      });
      console.log(`User left: ${username}`);
    }
  });
});

// Get local network IPs
function getLocalIPs() {
  const interfaces = os.networkInterfaces();
  const addresses = [];

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push({ name, address: iface.address });
      }
    }
  }
  return addresses;
}

// Start server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n=== LocalChat Server Running ===`);
  console.log(`Local:   http://localhost:${PORT}`);

  const ips = getLocalIPs();
  if (ips.length > 0) {
    console.log(`\nNetwork addresses (share with others on your LAN):`);
    ips.forEach(({ name, address }) => {
      console.log(`  ${name}: http://${address}:${PORT}`);
    });
  } else {
    console.log(`\nNo network interfaces found. Use http://localhost:${PORT}`);
  }

  console.log(`\nPress Ctrl+C to stop the server.\n`);
});
