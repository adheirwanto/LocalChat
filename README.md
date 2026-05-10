# LocalChat

## Bahasa Indonesia

**LocalChat** adalah aplikasi web chat real-time dan berbagi file yang berjalan di jaringan lokal (LAN). Pengguna dalam jaringan yang sama dapat mengobrol dan berbagi file tanpa memerlukan koneksi internet.

### Fitur
- Chat real-time antar pengguna di jaringan lokal
- Pengaturan nama tampilan pengguna
- Upload dan download file
- Daftar pengguna yang sedang online
- Tampilan responsif untuk desktop dan mobile
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

3. Server akan menampilkan alamat IP lokal. Buka alamat tersebut di browser perangkat lain yang terhubung ke jaringan yang sama.

---

## English

**LocalChat** is a real-time web chat and file sharing application that runs on a local area network (LAN). Users on the same network can chat and share files without requiring an internet connection.

### Features
- Real-time chat between users on the local network
- Display name setup for each user
- File upload and download
- Online users list
- Responsive UI for desktop and mobile
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

3. The server will display local IP addresses on startup. Open that address in a browser on any device connected to the same network.

---

## Tech Stack

- **Backend:** Node.js, Express, Socket.IO
- **File Uploads:** Multer
- **Frontend:** HTML, CSS, JavaScript (vanilla)
- **Real-time Communication:** WebSocket via Socket.IO
