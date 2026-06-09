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
    
    # Check server logs for errors
    stdin, stdout, stderr = client.exec_command('cd /opt/my-app && docker-compose logs --tail 50')
    print("=== Container Logs ===")
    print(stdout.read().decode())
    
    # Check what's inside the container
    stdin, stdout, stderr = client.exec_command('docker exec my-app-app-1 ls -la /app/public/login.html')
    print("\n=== Container login.html ===")
    print(stdout.read().decode())
    
    client.close()
