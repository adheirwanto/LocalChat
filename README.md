# LocalChat

## Bahasa Indonesia

**LocalChat** adalah aplikasi web chat real-time dan berbagi file yang berjalan di jaringan lokal (LAN). Pengguna dalam jaringan yang sama dapat mengobrol dan berbagi file tanpa memerlukan koneksi internet.

### Fitur
- Chat real-time antar pengguna di jaringan lokal
- Pengaturan nama tampilan pengguna
- Upload dan download file
- Pesan suara (voice note)
- Ruang obrolan (chat rooms)
- Daftar pengguna yang sedang online
- Tampilan responsif untuk desktop dan mobile
- HTTPS otomatis untuk akses mikrofon di perangkat mobile
- Notifikasi saat pengguna bergabung atau keluar

### Cara Menggunakan

1. Install dependencies:
   ```bash
   npm install
   ```

2. Jalankan server:
   ```bash
   npm start
   ```

3. Server akan menampilkan alamat HTTPS lokal. Buka alamat tersebut di browser perangkat lain yang terhubung ke jaringan yang sama. Pada kunjungan pertama, terima peringatan sertifikat (self-signed certificate).

---

## English

**LocalChat** is a real-time web chat and file sharing application that runs on a local area network (LAN). Users on the same network can chat and share files without requiring an internet connection.

### Features
- Real-time chat between users on the local network
- Display name setup for each user
- File upload and download
- Voice notes (audio recording)
- Chat rooms
- Online users list
- Responsive UI for desktop and mobile
- Automatic HTTPS for microphone access on mobile devices
- Notifications when users join or leave

### How to Use

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the server:
   ```bash
   npm start
   ```

3. The server will display an HTTPS URL on startup. Open that address in a browser on any device connected to the same network. On first visit, accept the security warning (self-signed certificate).

**Note:** The server runs HTTPS on port 3000 by default to enable microphone access on mobile devices. If openssl is not available, it falls back to HTTP (voice notes may not work on mobile in that case).

---

## Tech Stack

- **Backend:** Node.js, Express, Socket.IO, HTTPS (self-signed cert)
- **Database:** SQLite (better-sqlite3)
- **File Uploads:** Multer
- **Frontend:** HTML, CSS, JavaScript (vanilla)
- **Real-time Communication:** WebSocket via Socket.IO
