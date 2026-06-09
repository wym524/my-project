#!/usr/bin/env python3
import paramiko
import socket
import os
import base64

PROXY_HOST = '127.0.0.1'
PROXY_PORT = 18080
SERVER_HOST = '124.223.86.48'
SERVER_PORT = 22
USERNAME = 'root'
PASSWORD = 'Xx740321.'
LOCAL_FILE = '/workspace/server.js'
REMOTE_FILE = '/opt/my-app/server.js'

def create_tunnel_sock():
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.settimeout(60)
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
    
    print("SSH connected!")
    
    # Upload file using SFTP
    file_size = os.path.getsize(LOCAL_FILE)
    print(f"Uploading {LOCAL_FILE} ({file_size} bytes)...")
    
    sftp = client.open_sftp()
    
    # Read local file and write to remote in base64 chunks
    with open(LOCAL_FILE, 'rb') as f:
        content = f.read()
    
    # Write as base64, then decode on server
    b64_content = base64.b64encode(content).decode()
    
    # Write base64 to remote file
    with sftp.file(REMOTE_FILE + '.b64', 'w') as remote_b64:
        remote_b64.write(b64_content)
    
    print("Base64 uploaded, decoding on server...")
    
    # Decode on server
    stdin, stdout, stderr = client.exec_command(f'base64 -d {REMOTE_FILE}.b64 > {REMOTE_FILE} && rm {REMOTE_FILE}.b64 && echo "Done! Size: $(stat -c%s {REMOTE_FILE}) bytes"')
    print(stdout.read().decode().strip())
    print(stderr.read().decode().strip())
    
    # Restart container
    print("\nRestarting container...")
    stdin, stdout, stderr = client.exec_command('cd /opt/my-app && docker-compose down && docker-compose up -d')
    print(stdout.read().decode())
    print(stderr.read().decode())
    
    # Verify new code
    stdin, stdout, stderr = client.exec_command('grep -c "targetUser.*studentConnections" /opt/my-app/server.js')
    result = stdout.read().decode().strip()
    print(f"\nVerification - targetUser check: {result}")
    
    client.close()
    print("\nDone!")
