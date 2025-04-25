// src/server.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';
import { Pool } from 'pg';
import cron from 'node-cron';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// 1) CORS
const FRONTEND = process.env.FRONTEND_URL || '*';
app.use(cors({ origin: FRONTEND }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: FRONTEND, methods: ['GET','POST'] }
});

// 2) PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false }
    : false
});

// 3) Inicializar tabla desde src/init.sql
(async () => {
  try {
    const sqlPath = path.join(__dirname, 'init.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    await pool.query(sql);
    console.log('✅ Tabla `matches` lista en PostgreSQL');
  } catch (e) {
    console.error('❌ Error al inicializar la tabla:', e);
  }
})();

// --- helpers load/save/update aquí (idénticos) ---

async function loadMatches() {
  const { rows } = await pool.query('SELECT * FROM matches');
  return rows.map(r => ({
    id: r.id,
    creatorName: r.creator_name,
    sport: r.sport,
    date: r.date.toISOString().slice(0,10),
    time: r.time,
    note: r.note,
    joinRequests: r.join_requests
  }));
}

async function saveMatch(match) { /* … */ }
async function updateJoinRequests(id, joinRequests) { /* … */ }

// 4) Cron diario
cron.schedule('0 23 * * *', async () => {
  const today = new Date().toISOString().slice(0,10);
  await pool.query('DELETE FROM matches WHERE date = $1', [today]);
  console.log(`🧹 Cron-clean: eliminados partidos de ${today}`);
});

// 5) Handlers de Socket.IO
io.on('connection', socket => {
  console.log('🔌 Nuevo cliente conectado:', socket.id);

  // 1) Enviamos al cliente la lista actual
  loadMatches()
    .then(data => {
      console.log('📤 Enviando existingMatches:', data.length, 'partidos');
      socket.emit('existingMatches', data);
    })
    .catch(console.error);

  // 2) Cuando el cliente crea un partido:
  socket.on('createMatch', async match => {
    console.log('📥 createMatch recibido:', match);
    try {
      await saveMatch(match);
      console.log('✅ Partido guardado en BD:', match.id);
      io.emit('matchCreated', match);
    } catch (err) {
      console.error('❌ Error al guardar partido:', err);
    }
  });

  // 3) Cuando el cliente pide unirse
  socket.on('requestToJoin', async ({ matchId, request }) => {
    console.log('📥 requestToJoin recibido para match', matchId, request);
    try {
      const res = await pool.query(
        'SELECT join_requests FROM matches WHERE id=$1',
        [matchId]
      );
      const joinRequests = res.rows[0].join_requests;
      joinRequests.push(request);
      await updateJoinRequests(matchId, joinRequests);
      console.log('✅ JoinRequests actualizados en BD para', matchId);
      io.emit('matchUpdated', { id: matchId, joinRequests });
    } catch (err) {
      console.error('❌ Error al actualizar joinRequests:', err);
    }
  });

  // 4) (Opcional) Cuando borras tu participación
  socket.on('removePlayer', async ({ matchId, playerName }) => {
    console.log('📥 removePlayer recibido:', matchId, playerName);
    // lógica para eliminar…
    io.emit('playerRemoved', /* partido actualizado */);
  });
});


// 6) Levantamos el servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
