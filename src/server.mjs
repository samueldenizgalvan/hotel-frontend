// server.mjs
import fs from 'fs';
import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';
import { Pool } from 'pg';
import cron from 'node-cron';

const app = express();

// 1) Habilitamos CORS para nuestro frontend
const FRONTEND = process.env.FRONTEND_URL || '*';
app.use(cors({ origin: FRONTEND }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: FRONTEND,
    methods: ['GET', 'POST']
  }
});

// 2) Configuramos el pool de pg usando la variable de entorno
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' 
    ? { rejectUnauthorized: false } 
    : false
});

// 3) Inicializamos la tabla (init.sql en la raíz)
(async () => {
  const sql = fs.readFileSync('./init.sql', 'utf8');
  await pool.query(sql);
  console.log('✅ Tabla `matches` lista en PostgreSQL');
})();

// Helpers para cargar y guardar partidos
async function loadMatches() {
  const { rows } = await pool.query('SELECT * FROM matches');
  return rows.map(r => ({
    id: r.id,
    creatorName: r.creator_name,
    sport: r.sport,
    date: r.date.toISOString().slice(0, 10),
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

// 4) Cron diario para limpiar partidos de hoy a las 23:00
cron.schedule('0 23 * * *', async () => {
  const today = new Date().toISOString().slice(0, 10);
  await pool.query('DELETE FROM matches WHERE date = $1', [today]);
  console.log(`🧹 Cron-clean: eliminados partidos de ${today}`);
});

// 5) Handlers de Socket.IO
io.on('connection', socket => {
  loadMatches().then(data => socket.emit('existingMatches', data));

  socket.on('createMatch', async match => {
    await saveMatch(match);
    io.emit('matchCreated', match);
  });

  socket.on('requestToJoin', async ({ matchId, request }) => {
    const res = await pool.query(
      'SELECT join_requests FROM matches WHERE id=$1',
      [matchId]
    );
    const joinRequests = res.rows[0].join_requests;
    joinRequests.push(request);
    await updateJoinRequests(matchId, joinRequests);
    io.emit('matchUpdated', { id: matchId, joinRequests });
  });
});

// 6) Arrancamos en el puerto que Render (u otro) nos asigne
const PORT = process.env.PORT || 3000;
server.listen(PORT, () =>
  console.log(`🚀 Server running on http://localhost:${PORT}`)
);

