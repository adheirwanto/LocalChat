const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const os = require('os');

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
    // Preserve original filename but add timestamp to avoid conflicts
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    const base = path.basename(file.originalname, ext);
    cb(null, base + '-' + uniqueSuffix + ext);
  }
});

const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } }); // 50MB max

// Serve static files from public/
app.use(express.static(path.join(__dirname, 'public')));

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

// File download endpoint
app.get('/uploads/:filename', (req, res) => {
  const filename = req.params.filename;

  // Prevent path traversal using resolve-then-startsWith
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
    // Filter out .gitkeep
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

// Track connected users
const onlineUsers = new Map(); // socketId -> username
const activeUsernames = new Set(); // set of taken usernames (lowercase for case-insensitive check)
const registeredSockets = new Set(); // socket IDs that have registered a username

// Socket.IO events
io.on('connection', (socket) => {
  console.log(`Client connected: ${socket.id}`);

  socket.on('set-username', (username) => {
    if (typeof username !== 'string') return;
    username = username.trim();
    if (!username || username.length > 20) return;

    // Check for duplicate username (case-insensitive)
    const lowerUsername = username.toLowerCase();
    if (activeUsernames.has(lowerUsername)) {
      socket.emit('username-taken', { error: 'Username is already taken' });
      return;
    }

    activeUsernames.add(lowerUsername);
    onlineUsers.set(socket.id, username);
    registeredSockets.add(socket.id);
    socket.username = username;

    // Notify all users
    io.emit('user-joined', {
      username,
      onlineUsers: Array.from(onlineUsers.values())
    });

    console.log(`User joined: ${username}`);
  });

  socket.on('chat-message', (data) => {
    if (!socket.username) return;
    if (typeof data.text !== 'string' || data.text.length === 0 || data.text.length > 5000) return;

    const message = {
      username: socket.username,
      text: data.text,
      timestamp: new Date().toISOString(),
      socketId: socket.id
    };

    io.emit('chat-message', message);
  });

  socket.on('file-shared', (data) => {
    if (!socket.username) return;
    if (typeof data.filename !== 'string' || data.filename.length > 500) return;
    if (typeof data.originalName !== 'string' || data.originalName.length > 500) return;
    if (typeof data.size !== 'number') return;

    const fileNotification = {
      username: socket.username,
      filename: data.filename,
      originalName: data.originalName,
      size: data.size,
      timestamp: new Date().toISOString(),
      socketId: socket.id
    };

    io.emit('file-shared', fileNotification);
  });

  socket.on('disconnect', () => {
    const username = onlineUsers.get(socket.id);
    onlineUsers.delete(socket.id);
    registeredSockets.delete(socket.id);

    if (username) {
      activeUsernames.delete(username.toLowerCase());
      io.emit('user-left', {
        username,
        onlineUsers: Array.from(onlineUsers.values())
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
