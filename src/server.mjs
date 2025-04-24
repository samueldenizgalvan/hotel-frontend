import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import cors from 'cors';
import http from 'http';
import { Server } from 'socket.io';
import { Pool } from 'pg';
import cron from 'node-cron';

// __dirname para ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// 1) Configurar CORS para el frontend
const FRONTEND = process.env.FRONTEND_URL || '*';
app.use(cors({ origin: FRONTEND, methods: ['GET', 'POST'] }));

// 2) Crear servidor HTTP y Socket.IO con CORS
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: FRONTEND,
    methods: ['GET', 'POST']
  }
});

// 3) Pool de PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// 4) Inicializar tabla con init.sql (en la raíz del proyecto)
(async () => {
  try {
    const sqlPath = path.join(__dirname, 'init.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    await pool.query(sql);
    console.log('✅ Tabla `matches` lista en PostgreSQL');
  } catch (err) {
    console.error('❌ Error al inicializar la tabla:', err);
  }
})();

// 5) Funciones de datos
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
    [match.id, match.creatorName, match.sport, match.date, match.time, match.note || null, JSON.stringify(match.joinRequests)]
  );
}

async function updateJoinRequests(id, joinRequests) {
  await pool.query(
    `UPDATE matches SET join_requests = $1 WHERE id = $2`,
    [JSON.stringify(joinRequests), id]
  );
}

// 6) Cron diario para borrar partidos de hoy a las 23:00
cron.schedule('0 23 * * *', async () => {
  const today = new Date().toISOString().slice(0, 10);
  await pool.query('DELETE FROM matches WHERE date = $1', [today]);
  console.log(`🧹 Cron-clean: eliminados partidos de ${today}`);
});

// 7) Handlers de Socket.IO
io.on('connection', socket => {
  // Envío inicial
  loadMatches().then(data => socket.emit('existingMatches', data));

  // Crear y guardar
  socket.on('createMatch', async match => {
    await saveMatch(match);
    io.emit('matchCreated', match);
  });

  // Unirse a un match
  socket.on('requestToJoin', async ({ matchId, request }) => {
    const res = await pool.query('SELECT join_requests FROM matches WHERE id=$1', [matchId]);
    const list = res.rows[0].join_requests || [];
    list.push(request);
    await updateJoinRequests(matchId, list);
    io.emit('matchUpdated', { id: matchId, joinRequests: list });
  });
});

// 8) Arrancar servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

