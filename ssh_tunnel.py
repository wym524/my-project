#!/usr/bin/env python3
import paramiko
import socket
import sys

PROXY_HOST = '127.0.0.1'
PROXY_PORT = 18080
SERVER_HOST = '124.223.86.48'
SERVER_PORT = 22
USERNAME = 'root'
PASSWORD = ''  # Add your password here if needed

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
    
    print("Tunnel established!")
    return sock

if __name__ == "__main__":
    # Get password from user if not set
    if not PASSWORD:
        import getpass
        PASSWORD = getpass.getpass(f"Password for {USERNAME}@{SERVER_HOST}: ")
    
    # Create tunnel
    sock = create_tunnel_sock()
    
    # Create SSH client
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    
    # Connect through the tunnel socket
    client.connect(
        hostname=SERVER_HOST,
        port=SERVER_PORT,
        username=USERNAME,
        password=PASSWORD,
        sock=sock,  # Use our tunnel socket instead of direct connection
        allow_agent=False,
        look_for_keys=False
    )
    
    print("SSH connected!")
    
    # Run a test command
    stdin, stdout, stderr = client.exec_command('grep -c "studentConnections.has" /opt/my-app/server.js')
    print("Result:", stdout.read().decode().strip())
    
    client.close()
