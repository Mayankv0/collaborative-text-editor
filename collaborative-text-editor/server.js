const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const mysql = require('mysql2');
const app = express();

const allowedOrigins = ['http://localhost:3000'];
const corsOptions = {
  origin: function (origin, callback) {
    if (allowedOrigins.indexOf(origin) !== -1 || !origin) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
};

app.use(cors(corsOptions));

const pool = mysql.createPool({
  connectionLimit: 10,
  host: 'localhost',
  port: 3306,
  user: 'root',
  password: 'Abcd1234@',
  database: 'mysql',
  insecureAuth: true,
});


const roomUsers = {};

pool.query(
  `CREATE TABLE IF NOT EXISTS documents (
    room_id VARCHAR(255) PRIMARY KEY,
    content TEXT
  )`,
  (err) => {
    if (err) {
      console.error('Error creating table:', err);
    }
  }
);

const server = http.createServer(app); 

const io = socketIo(server, {
  cors: {
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST'],
  },
});

io.on('connection', (socket) => {
  socket.on('join-room', ({ roomId, username }) => {

    console.log("Socket connection Start");
    socket.join(roomId);
    console.log("Connected with socket id:" + socket.id + "  roomId:" + roomId + " user:" + username);

    if (typeof roomUsers[roomId] === 'undefined') {
      console.log(`Initializing roomUsers for roomId: ${roomId}`);
      roomUsers[roomId] = [];
    }

    const existingUser = roomUsers[roomId].find(user => user.username === username);
    if (!existingUser) {
      console.log(`Adding new user ${username} to room ${roomId}`);
      roomUsers[roomId].push({ id: socket.id, username });

      socket.broadcast.to(roomId).emit('user-joined', username);
      console.log(`Notified other users in room ${roomId} of new user ${username}`);
    } else {
      console.log(`User ${username} already in room ${roomId}, not re-adding or notifying.`);
    }
    console.log(JSON.stringify(roomUsers));
    io.in(roomId).emit('connected-users', roomUsers[roomId].map(user => user.username));

    console.log("Query Execution>>> ");
    pool.query('SELECT content FROM documents WHERE room_id = ?', [roomId], (err, results) => {
      if (err) {
        console.error('Error retrieving document state:', err);
        socket.emit('document-error', 'Error retrieving document state');
        return;
      }
      const existingDocumentState = results.length > 0 ? JSON.parse(results[0].content) : {};
      socket.emit('initialize-document', existingDocumentState);
    });
  });
  

  socket.on('text-change', ({ delta, roomId, username }) => {
    pool.query(
      'INSERT INTO documents (room_id, content) VALUES (?, ?) ON DUPLICATE KEY UPDATE content = ?',
      [roomId, JSON.stringify(delta), JSON.stringify(delta)],
      (err) => {
        if (err) {
          console.error('Error updating document state:', err);
          return;
        }
        socket.to(roomId).emit('text-change', { delta, username });
      }
    );
  });

  socket.on('save-document', ({ roomId, content }) => {
    pool.query(
      'UPDATE documents SET content = ? WHERE room_id = ?',
      [content, roomId],
      (err) => {
        if (err) {
          console.error('Error saving document:', err);
          return;
        }
      }
    );
  });

  socket.on('cursor-selection', ({roomId, username, cursorPos}) =>{
    console.log("Cursor selection updated for " + username + " " +  JSON.stringify(cursorPos));
    socket.to(roomId).emit('remote-cursor-selection', {username, cursorPos});
  });

  socket.on('cursor-move', ({roomId, username, cursorPos}) => {
    console.log("cursor movement change for " + username + JSON.stringify(cursorPos) );
    socket.to(roomId).emit('remote-cursor-move', {username, cursorPos});
  });

  socket.on('leave-room', ({ roomId, username }) => {
    socket.leave(roomId);
    console.log(`User  ${username}  left from Room: ${roomId}`);
    roomUsers[roomId] = roomUsers[roomId].filter(user => user.username !== username);

    socket.to(roomId).emit('user-left', username);

    io.in(roomId).emit('connected-users', roomUsers[roomId].map(user => user.username));
  });

});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));