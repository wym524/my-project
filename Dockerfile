FROM node:18-slim

WORKDIR /app

COPY package.json ./
RUN apt-get update && apt-get install -y python3 make g++ --no-install-recommends && npm install --production && apt-get remove -y python3 make g++ && apt-get autoremove -y && rm -rf /var/lib/apt/lists/*

COPY . .

VOLUME /data

EXPOSE 3000

CMD ["node", "server.js"]
