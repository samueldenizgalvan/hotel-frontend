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

// 5) Socket.IO
io.on('connection', socket => {
  loadMatches().then(data => socket.emit('existingMatches', data));
  socket.on('createMatch', async m => { /* … */ });
  socket.on('requestToJoin', async ({ matchId, request }) => { /* … */ });
});

// 6) Levantamos el servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
