#!/usr/bin/env python3
import paramiko
import socket

PROXY_HOST = '127.0.0.1'
PROXY_PORT = 18080
SERVER_HOST = '124.223.86.48'
SERVER_PORT = 22
USERNAME = 'root'
PASSWORD = 'Xx740321.'

def create_tunnel_sock():
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(30)
    sock.connect((PROXY_HOST, PROXY_PORT))
    
    req = f"CONNECT {SERVER_HOST}:{SERVER_PORT} HTTP/1.1\r\nHost: {SERVER_HOST}:{SERVER_PORT}\r\nProxy-Connection: keep-alive\r\n\r\n"
    sock.sendall(req.encode())
    
    resp = b''
    while b'\r\n\r\n' not in resp:
        resp += sock.recv(1024)
    
    if b'200' not in resp:
        raise Exception(f"Proxy rejected: {resp}")
    
    return sock

if __name__ == "__main__":
    sock = create_tunnel_sock()
    
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    client.connect(
        hostname=SERVER_HOST,
        port=SERVER_PORT,
        username=USERNAME,
        password=PASSWORD,
        sock=sock,
        allow_agent=False,
        look_for_keys=False
    )
    
    # Check if there's any issue with the static middleware order
    stdin, stdout, stderr = client.exec_command('cd /opt/my-app && cat > /tmp/test_server.js << "EOF"\nconst express = require("express");\nconst path = require("path");\nconst app = express();\napp.use(express.json());\napp.use(express.static(path.join(__dirname, "public")));\napp.listen(3002, () => {\n  console.log("Test server on 3002");\n});\nEOF\nnode /tmp/test_server.js & sleep 2 && curl -sI http://127.0.0.1:3002/login.html | head -10 && kill %1')
    print("=== Test Static Middleware ===")
    print(stdout.read().decode())
    print(stderr.read().decode())
    
    client.close()
