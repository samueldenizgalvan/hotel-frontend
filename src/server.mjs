import fs from 'fs';
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import { Pool } from 'pg';
import cron from 'node-cron';

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// 1. Inicializar tabla
(async () => {
  const sql = fs.readFileSync('./init.sql', 'utf8');
  await pool.query(sql);
  console.log('✅ Tabla `matches` lista en PostgreSQL');
})();

// 2. Funciones de acceso a datos
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

async function saveMatch(match) {
  await pool.query(
    `INSERT INTO matches(id, creator_name, sport, date, time, note, join_requests)
     VALUES($1,$2,$3,$4,$5,$6,$7)`,
    [
      match.id,
      match.creatorName,
      match.sport,
      match.date,
      match.time,
      match.note || null,
      JSON.stringify(match.joinRequests)
    ]
  );
}

async function updateJoinRequests(id, joinRequests) {
  await pool.query(
    `UPDATE matches SET join_requests = $1 WHERE id = $2`,
    [JSON.stringify(joinRequests), id]
  );
}

// 3. Cron diario a las 23:00 para limpiar
cron.schedule('0 23 * * *', async () => {
  const today = new Date().toISOString().slice(0,10);
  await pool.query('DELETE FROM matches WHERE date = $1', [today]);
  console.log(`🧹 Cron-clean: eliminados partidos de ${today}`);
});

// 4. Socket handlers
io.on('connection', socket => {
  // Enviar lista inicial
  loadMatches().then(data => socket.emit('existingMatches', data));

  socket.on('createMatch', async match => {
    await saveMatch(match);
    io.emit('matchCreated', match);
  });

  socket.on('requestToJoin', async ({ matchId, request }) => {
    // Obtener, actualizar y guardar
    const res = await pool.query('SELECT join_requests FROM matches WHERE id=$1', [matchId]);
    const joinRequests = res.rows[0].join_requests;
    joinRequests.push(request);
    await updateJoinRequests(matchId, joinRequests);
    io.emit('matchUpdated', { id: matchId, joinRequests });
  });
});

// 5. Iniciar servidor
server.listen(3000, () => console.log('🚀 Server running on http://localhost:3000'));
