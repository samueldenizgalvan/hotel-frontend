import React, { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { Calendar, Users, Pencil, Info, UserPlus, Plus, X } from 'lucide-react';
import { toast, ToastContainer } from 'react-toastify';
import { motion, AnimatePresence } from 'framer-motion';
import 'react-toastify/dist/ReactToastify.css';
import './index.css';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL;
const socket: Socket = io(BACKEND_URL ?? 'http://localhost:3000', {
  transports: ['websocket'],
});


function App() {
  const [currentUser, setCurrentUser] = useState('');
  const [hotelCode, setHotelCode] = useState('');
  const [isAdult, setIsAdult] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [matches, setMatches] = useState<any[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newMatch, setNewMatch] = useState({
    creatorName: '',
    sport: 'Padel',
    date: '',
    time: '',
    note: '',
  });

  // Cargar datos del localStorage al montar el componente
  useEffect(() => {
    const savedUser = localStorage.getItem('profile');
    if (savedUser) {
      const parsed = JSON.parse(savedUser);
      setCurrentUser(parsed.name);
      setHotelCode(parsed.hotel);
      setIsAdult(parsed.isAdult);
      setIsLoggedIn(true);
      socket.emit('identify', parsed.name);
      socket.emit('getMatches', parsed.hotel); // Emitir getMatches con el hotelCode
    }

  }, []);

  // Escuchar eventos del servidor
  useEffect(() => {
    if (isLoggedIn) {
      socket.on('existingMatches', (data) => {
        console.log('Received matches:', data);
        // Filtrar partidos por hotelCode como respaldo
        const filteredMatches = data.filter((match: any) => match.hotel === hotelCode);
        setMatches(filteredMatches);
      });

      socket.on('matchCreated', (newMatch) => {
        console.log('Nuevo match agregado:', newMatch);
        // No añadimos directamente al estado; esperamos a que el servidor emita existingMatches
      });

      useEffect(() => {
        socket.on('matchesUpdate', (matches) => {
          console.log('matches recibidos:', matches);
          setMatches(matches);
        });
      
        return () => socket.off('matchesUpdate');
      }, []);
      

      socket.on('playerRemoved', (updatedMatch) => {
        setMatches(prev =>
          prev.map(m => (m.id === updatedMatch.id ? updatedMatch : m))
        );
      });

      return () => {
        socket.off('existingMatches');
        socket.off('matchCreated');
        socket.off('matchUpdated');
        socket.off('playerRemoved');
      };
    }
  }, [isLoggedIn, hotelCode]);

  // Lista de hoteles válidos
  const validHotels = ['Radisson'];

  const removePlayer = (matchId: string) => {
    if (!currentUser) return;
    socket.emit('removePlayer', { matchId, playerName: currentUser });
    toast.success('Your participation has been deleted.');
  };

  const login = () => {
    const formattedHotelCode =
      hotelCode.trim().charAt(0).toUpperCase() + hotelCode.trim().slice(1).toLowerCase();

    if (!validHotels.includes(formattedHotelCode)) {
      toast.error('Hotel code not recognized. Please contact reception.');
      return;
    }

    if (currentUser && isAdult) {
      const profile = { name: currentUser, hotel: formattedHotelCode, isAdult: true };
      localStorage.setItem('profile', JSON.stringify(profile));
      setHotelCode(formattedHotelCode);
      setCurrentUser(currentUser);
      setIsLoggedIn(true);
      socket.emit('identify', currentUser);
      socket.emit('getMatches', formattedHotelCode); // Emitir getMatches después de iniciar sesión
    } else {
      toast.error('Please complete all fields and confirm you are an adult');
    }
  };

  const createMatch = (e: React.FormEvent) => {
    e.preventDefault();

    if (!newMatch.date || !newMatch.time) {
      toast.error('Please select date and time');
      return;
    }

    const formattedHotelCode =
      hotelCode.trim().charAt(0).toUpperCase() + hotelCode.trim().slice(1).toLowerCase();

    const match = {
      ...newMatch,
      creatorName: currentUser,
      id: Date.now().toString(),
      joinRequests: [],
      hotel: formattedHotelCode,
    };

    socket.emit('createMatch', match);
    setShowCreateForm(false);
    setNewMatch({ creatorName: '', sport: 'Padel', date: '', time: '', note: '' });
  };

  const handleJoin = (match: any) => {
    if (match.creatorName.toLowerCase() === currentUser.toLowerCase()) return;

    const alreadyJoined = match.joinRequests.some((r: any) => r.guestName === currentUser);
    if (alreadyJoined) return toast.info('You already joined this match.');

    const request = {
      id: Date.now().toString(),
      guestName: currentUser,
    };
    socket.emit('requestToJoin', { matchId: match.id, request });
    toast.success('Join request sent!');
  };

  const updateNote = (matchId: string, note: string) => {
    const newNote = prompt('Edit note:', note);
    if (newNote !== null) {
      socket.emit('editNote', { matchId, newNote }); // 👈 Cambiado de 'updateNote' a 'editNote'
    }
  };
  

  return (
    <>
      <ToastContainer position="top-right" autoClose={3000} />
      {!isLoggedIn ? (
        <div className="min-h-screen flex flex-col justify-center items-center bg-gradient-to-br from-blue-100 to-white p-6">
          <h1 className="text-3xl font-bold text-blue-700 mb-6">🏨 Hotel Sports Matcher</h1>
          <input
            type="text"
            placeholder="Your name"
            value={currentUser}
            onChange={e => setCurrentUser(e.target.value)}
            className="mb-4 w-full max-w-xs px-4 py-2 rounded-lg border border-gray-300"
          />
          <input
            type="text"
            placeholder="Hotel code (e.g. Radisson)"
            value={hotelCode}
            onChange={e => setHotelCode(e.target.value)}
            className="mb-4 w-full max-w-xs px-4 py-2 rounded-lg border border-gray-300"
          />
          <label className="text-sm text-gray-600 mb-4">
            <input
              type="checkbox"
              checked={isAdult}
              onChange={() => setIsAdult(!isAdult)}
              className="mr-2"
            />
            I confirm I am over 18 years old
          </label>
          <button
            onClick={login}
            className="bg-blue-600 text-white px-6 py-2 rounded-xl hover:bg-blue-700"
          >
            Enter
          </button>
        </div>
      ) : (
        <div className="min-h-screen bg-gradient-to-br from-blue-100 to-white px-4 py-6 pb-20">
          <header className="text-center text-blue-700 mb-6">
            <h1 className="text-3xl font-extrabold">🏨 Sports Matcher</h1>
            <p className="text-sm text-blue-500">Find and join matches with other hotel guests</p>
          </header>

          <div className="bg-white rounded-2xl p-4 shadow-lg mb-6">
            <h2 className="text-lg font-semibold flex items-center gap-2 mb-2">
              <Info className="w-5 h-5" /> How it works
            </h2>
            <ul className="text-sm text-gray-700 space-y-1 ml-3">
              <li>📅 Matches have fixed date and time, set by the creator.</li>
              <li>✏️ Only the creator can edit the note of their match.</li>
              <li>👥 Max 4 players for Tennis, Padel, Table Tennis (creator included).</li>
              <li>⚽ Other sports allow unlimited players.</li>
              <li>📍 Booking must still be done at reception.</li>
              <li>🎾 Tennis and Padel: 15€ / hour</li>
              <li>🏓 Other sports are free — equipment available at reception.</li>
              <li>🔞 This app is only for adults.</li>
            </ul>
          </div>

          <motion.button
            onClick={() => setShowCreateForm(!showCreateForm)}
            className="fixed bottom-6 right-6 bg-blue-600 hover:bg-blue-700 text-white rounded-full p-4 shadow-lg z-50"
            whileTap={{ scale: 0.95 }}
          >
            {showCreateForm ? <X className="w-6 h-6" /> : <Plus className="w-6 h-6" />}
          </motion.button>

          {showCreateForm && (
            <form onSubmit={createMatch} className="bg-white mt-6 rounded-2xl shadow-md p-5 space-y-4">
              <h2 className="text-xl font-semibold">Create Match</h2>
              <input
                type="text"
                disabled
                value={currentUser}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 bg-gray-100"
              />
              <select
                value={newMatch.sport}
                onChange={e => setNewMatch({ ...newMatch, sport: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              >
                {['Padel', 'Tennis', 'Football', 'Basketball', 'Table Tennis', 'Volleyball'].map(sport => (
                  <option key={sport}>{sport}</option>
                ))}
              </select>
              <input
                type="date"
                required
                value={newMatch.date}
                onChange={e => setNewMatch({ ...newMatch, date: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
                min={new Date().toISOString().split('T')[0]}
              />
              <select
                required
                value={newMatch.time}
                onChange={e => setNewMatch({ ...newMatch, time: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              >
                <option value="" disabled>Select time</option>
                {[...Array(12)].map((_, i) => {
                  const hour = i + 9;
                  return <option key={hour}>{hour}:00</option>;
                })}
              </select>
              <textarea
                placeholder="Optional note (e.g. changed time confirmed at reception)"
                value={newMatch.note}
                onChange={e => setNewMatch({ ...newMatch, note: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2"
              />
              <button type="submit" className="w-full bg-blue-600 text-white rounded-lg py-2 font-semibold hover:bg-blue-700">
                Submit
              </button>
            </form>
          )}

          <div className="mt-8 space-y-6">
            <AnimatePresence>
              {matches.map((match) => (
                <motion.div
                  key={match.id}
                  className="bg-white rounded-xl p-5 shadow-md"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="text-lg font-bold text-blue-700">{match.sport} Match</h3>
                      <p className="text-sm text-gray-600">Created by: {match.creatorName}</p>
                      <p className="text-sm text-gray-600 flex items-center gap-1 mt-1">
                        <Calendar className="w-4 h-4" /> {new Date(match.date).toLocaleDateString()} at {match.time}
                      </p>
                    </div>

                    {match.creatorName.toLowerCase() !== currentUser.toLowerCase() && (
                      <button
                        onClick={() => handleJoin(match)}
                        className="bg-green-500 text-white text-sm px-3 py-1 rounded-md hover:bg-green-600"
                      >
                        <UserPlus className="inline-block w-4 h-4 mr-1" /> Join
                      </button>
                    )}
                  </div>

                  {match.note && (
                    <div className="mt-3 bg-yellow-50 p-3 rounded-md text-sm text-yellow-800 relative">
                      <span className="block font-medium">Note: {match.note}</span>
                      {match.creatorName === currentUser && (
                        <button
                          onClick={() => updateNote(match.id, match.note)}
                          className="absolute top-2 right-2 text-blue-600 text-xs hover:underline flex items-center"
                        >
                          <Pencil className="w-4 h-4 mr-1" /> Edit
                        </button>
                      )}
                    </div>
                  )}

                  <div className="mt-3">
                    <h4 className="text-sm font-semibold text-gray-700 mb-1 flex items-center">
                      <Users className="mr-2 h-4 w-4" /> Players ({1 + match.joinRequests.length})
                    </h4>
                    <ul className="text-sm text-gray-800 ml-2">
                      <li>{match.creatorName} (creator)</li>
                      {Array.isArray(match.joinRequests) ? (
  match.joinRequests.map((r: any) => (
    <li key={r.id}>
      {r.guestName}
      {r.guestName === currentUser && (
        <button
          onClick={() => removePlayer(match.id)}
          className="ml-2 text-red-600 text-xs hover:underline"
        >
          Remove participation
        </button>
      )}
    </li>
  ))
) : (
  <li className="text-sm text-gray-500 italic">No players joined yet.</li>
)}


                    </ul>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>

            <footer className="text-center text-sm text-gray-500 mt-10">
              Hecho por{" "}
              <a
                href="https://www.linkedin.com/in/samuel-déniz-galván"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:underline"
              >
                Samuel Déniz Galván
              </a>
            </footer>
          </div>
        </div>
      )}
    </>
  );
}

export default App;