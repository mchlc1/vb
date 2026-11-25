# yolo/yolo_server.py - Python Vision Benchmark Server
import cv2
import time
import os
import http.server
import socketserver
import threading
import webbrowser

PORT = 8000

def start_http_server():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    handler = http.server.SimpleHTTPRequestHandler
    with socketserver.TCPServer(("", PORT), handler) as httpd:
        print(f"[SERVER] Web server berjalan di http://localhost:{PORT}")
        httpd.serve_forever()

def main():
    print("========================================================")
    print(" 3D PVP SWORD COMBAT SIMULATION SERVER (YOLO/VISION ARCHITECTURE)")
    print("========================================================")
    
    server_thread = threading.Thread(target=start_http_server, daemon=True)
    server_thread.start()
    
    time.sleep(1)
    webbrowser.open(f"http://localhost:{PORT}/fist_arena_3d.html")

    print("\nMembuka pengujian kamera lokal...")
    cap = cv2.VideoCapture(0)
    if not cap.isOpened():
        print("[WARNING] Kamera webcam tidak terdeteksi via OpenCV. Game web akan menggunakan MediaPipe browser tracking.")
    else:
        print("[INFO] Kamera aktif. Tekan 'q' pada jendela OpenCV untuk menutup pengujian lokal.")
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            
            frame = cv2.flip(frame, 1)
            cv2.putText(frame, "3D Sword Combat Vision Benchmark", (20, 40),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
            cv2.putText(frame, "Press 'q' to close debug window", (20, 75),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)
            cv2.imshow("YOLO/Vision Server Test Window", frame)
            
            if cv2.waitKey(1) & 0xFF == ord('q'):
                break
        cap.release()
        cv2.destroyAllWindows()
    
    print("\n[SERVER] Game web tetap aktif di browser. Tekan Ctrl+C di terminal ini jika ingin menghentikan server.")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\n[SERVER] Server dihentikan.")

if __name__ == '__main__':
    main()
