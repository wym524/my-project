#!/usr/bin/env python3
import socket
import socks
import sys

# Create a SOCKS proxy connection through the HTTP CONNECT proxy
# This is a hack - we need to tunnel SSH through HTTP CONNECT

PROXY_HOST = '127.0.0.1'
PROXY_PORT = 18080
TARGET_HOST = '124.223.86.48'
TARGET_PORT = 22

def create_tunnel():
    try:
        # Create socket and connect to proxy
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(15)
        sock.connect((PROXY_HOST, PROXY_PORT))
        
        # Send HTTP CONNECT request
        connect_req = f"CONNECT {TARGET_HOST}:{TARGET_PORT} HTTP/1.1\r\n"
        connect_req += f"Host: {TARGET_HOST}:{TARGET_PORT}\r\n"
        connect_req += "Proxy-Connection: keep-alive\r\n"
        connect_req += "\r\n"
        
        sock.sendall(connect_req.encode())
        
        # Read response
        response = sock.recv(4096).decode('utf-8', errors='ignore')
        print(f"Proxy response: {response[:100]}")
        
        if "200" in response.split("\r\n")[0]:
            print("Tunnel established!")
            return sock
        else:
            print("Failed to establish tunnel")
            return None
    except Exception as e:
        print(f"Error: {e}")
        return None

if __name__ == "__main__":
    sock = create_tunnel()
    if sock:
        # Now we have a tunnel, but we can't do much more without SSH client
        # Let's just keep the tunnel open
        print("Keeping tunnel open...")
        import time
        time.sleep(60)
