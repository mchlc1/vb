========================================================
3D PVP SWORD COMBAT SIMULATION - YOLO/VISION BENCHMARK
========================================================

Struktur Folder Reference Project (yolo/):
- `yolo_server.py`    : Script server Python yang mengaktifkan local web server dan testing kamera OpenCV.
- `fist_arena_3d.html`: Aplikasi Web 3D utama (Three.js + MediaPipe Computer Vision).
- `Run_Game.bat`      : Batch file 1-klik untuk menjalankan game dan server secara otomatis.
- `requirements.txt`  : Pustaka Python yang dibutuhkan (`opencv-python`, `mediapipe`).

Cara Menjalankan:
1. Klik 2x file `Run_Game.bat` (atau jalankan `python yolo_server.py`).
2. Browser akan terbuka otomatis ke `http://localhost:8000/fist_arena_3d.html`.
3. Izinkan (Allow) akses webcam di browser saat diminta.
4. Selamat bertarung!
