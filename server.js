const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

let messages = [];
let users = {};

io.on('connection', (socket) => {
  socket.on('join', (username) => {
    users[socket.id] = username;
    io.emit('users', Object.values(users));
    io.emit('history', messages);
  });
  socket.on('message', (data) => {
    const msg = { user: users[socket.id] || 'Anon', text: data.text, time: new Date().toLocaleTimeString() };
    messages.push(msg);
    if (messages.length > 100) messages.shift();
    io.emit('message', msg);
  });
  socket.on('disconnect', () => {
    delete users[socket.id];
    io.emit('users', Object.values(users));
  });
});

server.listen(PORT, () => console.log(`VivaChat en puerto ${PORT}`));
