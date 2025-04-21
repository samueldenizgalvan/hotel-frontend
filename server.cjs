const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const connectedUsers = {};

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

let matches = [];

io.on('connection', (socket) => {
  console.log('🔗 Client connected:', socket.id);

  const formatHotelCode = (code) => {
    return code.trim().charAt(0).toUpperCase() + code.trim().slice(1).toLowerCase();
  };


  // Eliminar un jugador de la partida
  socket.on('removePlayer', ({ matchId, playerName }) => {
    const match = matches.find((m) => m.id === matchId);
    if (!match) return;
  
    // Elimina al jugador
    match.joinRequests = match.joinRequests.filter((r) => r.guestName !== playerName);
  
    saveMatches(); // Guardamos el archivo
  
    const hotelMatches = matches.filter((m) => m.hotel === match.hotel);
    io.to(match.hotel).emit('existingMatches', hotelMatches);
  
    // 🔥 Aquí está lo que faltaba:
    socket.emit('playerRemoved', match);
  });
  
  
  
  
  
  


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
    saveMatches(); // ✅ guardamos el archivo
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
    saveMatches(); // ✅ guardamos el archivo
    const hotelMatches = matches.filter(m => m.hotel === match.hotel);
    io.to(match.hotel).emit('existingMatches', hotelMatches);
  });

  socket.on('updateNote', ({ matchId, note }) => {
    const match = matches.find(m => m.id === matchId);
    if (!match) return;

    match.note = note;
    saveMatches(); // ✅ guardamos el archivo
    const hotelMatches = matches.filter(m => m.hotel === match.hotel);
    io.to(match.hotel).emit('existingMatches', hotelMatches);
  });

  socket.on('disconnect', () => {
    console.log('❌ Client disconnected:', socket.id);
  });
});


// Limpieza automática de partidos caducados
// Limpieza automática: borra partidos 2 horas después de su hora
setInterval(() => {
  const now = new Date();
  matches = matches.filter(match => {
    const [hour, minute] = match.time.split(':').map(Number); // ej. "10:00"
    const matchDateTime = new Date(match.date);
    matchDateTime.setHours(hour + 2, minute, 0, 0); // 2 horas después

    return now < matchDateTime; // lo mantenemos si aún no ha pasado
  });

  saveMatches(); // importante para que también se actualice matches.json
  console.log('🧹 Limpieza automática ejecutada.');
}, 1000 * 60 * 10); // cada 10 minutos


server.listen(3000, () => {
  console.log('🚀 Server running on http://localhost:3000');
});
