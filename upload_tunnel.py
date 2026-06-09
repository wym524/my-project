#!/usr/bin/env python3
import socket
import hashlib
import os

PROXY_HOST = '127.0.0.1'
PROXY_PORT = 18080
TARGET_HOST = '124.223.86.48'
TARGET_PORT = 22

LOCAL_FILE = '/workspace/server.js'
REMOTE_PATH = '/tmp/server_new.js'
REMOTE_CMD = f'cat > {REMOTE_PATH}'

def send_via_proxy(data):
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(30)
    sock.connect((PROXY_HOST, PROXY_PORT))
    
    req = f'CONNECT {TARGET_HOST}:{TARGET_PORT} HTTP/1.1\r\nHost: {TARGET_HOST}:{TARGET_PORT}\r\nProxy-Connection: keep-alive\r\n\r\n'
    sock.sendall(req.encode())
    
    resp = b''
    while b'\r\n\r\n' not in resp:
        resp += sock.recv(1024)
    
    if b'200' not in resp:
        print(f"Proxy error: {resp[:100]}")
        sock.close()
        return None
    
    return sock

def ssh_command(sock, cmd):
    # SSH protocol handshake
    sock.sendall(b'SSH-2.0-OpenSSH_test\r\n')
    import time
    time.sleep(1)
    # Read server version
    data = b''
    sock.settimeout(10)
    try:
        while b'\r\n' not in data:
            data += sock.recv(1024)
    except:
        pass
    print(f"Server: {data.decode()[:100]}")
    
    # We can't easily do full SSH auth without paramiko
    # Let's try a different approach - use scp via proxy
    print("SSH through proxy is complex without paramiko")
    sock.close()
    return False

# Use the proxy to check if we can at least verify file exists
sock = send_via_proxy(b'')
if sock:
    print("Proxy tunnel works for SSH")
    sock.close()

# Alternative: Check file size on remote via a simple HTTP check
print(f"\nLocal server.js size: {os.path.getsize(LOCAL_FILE)} bytes")
