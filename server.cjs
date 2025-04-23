const express = require('express');
const http = require('http');
const fs = require('fs');
const path = require('path');
const { Server } = require('socket.io');
const cors = require('cors');
const cron = require('node-cron');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// ------------------ Matches y persistencia ---------------------
let matches = [];
const matchesFile = path.join(__dirname, 'matches.json');

const saveMatches = () => {
  fs.writeFileSync(matchesFile, JSON.stringify(matches, null, 2));
  console.log('💾 Matches saved to file');
};

const loadMatches = () => {
  try {
    if (fs.existsSync(matchesFile)) {
      const data = fs.readFileSync(matchesFile);
      matches = JSON.parse(data);
      console.log(`✅ Loaded ${matches.length} matches from file`);
    }
  } catch (err) {
    console.error("❌ Error loading matches:", err);
  }
};

loadMatches(); // Cargar partidos al iniciar

// ------------------ Usuarios conectados ---------------------
const connectedUsers = {};

// ------------------ Socket.IO ---------------------
io.on('connection', (socket) => {
  console.log('🔗 Client connected:', socket.id);

  const formatHotelCode = (code) => {
    return code.trim().charAt(0).toUpperCase() + code.trim().slice(1).toLowerCase();
  };

  socket.on('identify', (username) => {
    connectedUsers[username] = socket.id;
  });

  socket.on('getMatches', (hotelCode) => {
    const formattedHotel = formatHotelCode(hotelCode);
    socket.join(formattedHotel);
    const hotelMatches = matches.filter(m => m.hotel === formattedHotel);
    socket.emit('existingMatches', hotelMatches);
  });

  socket.on('createMatch', (match) => {
    matches.push(match);
    saveMatches();
    const hotelMatches = matches.filter(m => m.hotel === match.hotel);
    io.to(match.hotel).emit('existingMatches', hotelMatches);
    console.log(`🎾 Match created by ${match.creatorName} (${match.sport} - ${match.date} ${match.time})`);
  });

  socket.on('requestToJoin', ({ matchId, request }) => {
    const match = matches.find(m => m.id === matchId);
    if (!match) return;

    const isLimited = ['Padel', 'Tennis', 'Table Tennis', 'Ping Pong', 'Volleyball'].includes(match.sport);
    if (isLimited && match.joinRequests.length >= 3) {
      return;
    }

    match.joinRequests.push(request);
    saveMatches();
    const hotelMatches = matches.filter(m => m.hotel === match.hotel);
    io.to(match.hotel).emit('existingMatches', hotelMatches);
  });

  socket.on('updateNote', ({ matchId, note }) => {
    const match = matches.find(m => m.id === matchId);
    if (!match) return;

    match.note = note;
    saveMatches();
    const hotelMatches = matches.filter(m => m.hotel === match.hotel);
    io.to(match.hotel).emit('existingMatches', hotelMatches);
  });

  socket.on('removePlayer', ({ matchId, playerName }) => {
    const match = matches.find(m => m.id === matchId);
    if (!match) return;

    match.joinRequests = match.joinRequests.filter(r => r.guestName !== playerName);
    saveMatches();
    const hotelMatches = matches.filter(m => m.hotel === match.hotel);
    io.to(match.hotel).emit('existingMatches', hotelMatches);
    console.log(`🚪 Player ${playerName} removed from match ${matchId}`);
  });

  socket.on('disconnect', () => {
    console.log('❌ Client disconnected:', socket.id);
  });
});

// ------------------ Limpieza automática ---------------------
// A las 23:00 cada día, elimina TODOS los partidos cuya fecha
// coincida con la del día actual.
cron.schedule('0 23 * * *', () => {
  const today = new Date().toISOString().split('T')[0]; // 'YYYY-MM-DD'
  matches = matches.filter(match => match.date !== today);
  saveMatches();
  console.log(`🧹 Cron-clean: removed all matches for ${today}`);
});


// ------------------ Iniciar servidor ---------------------
server.listen(3000, () => {
  console.log('🚀 Server running on http://localhost:3000');
});
