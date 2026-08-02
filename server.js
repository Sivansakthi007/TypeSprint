require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const jwt = require('jsonwebtoken');

const db = require('./db');
const { JWT_SECRET } = require('./middleware/auth');
const { errorHandler, apiLimiter } = require('./middleware/error');

// Import routes
const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');
const typingRoutes = require('./routes/typing');
const shopRoutes = require('./routes/shop');
const socialRoutes = require('./routes/social');
const adminRoutes = require('./routes/admin');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

// Port configuration
const PORT = process.env.PORT || 3000;

// Security and utility middlewares
app.use(cors());
// Helmet setup. Disable CSP (Content Security Policy) restrictions for scripts/styles in local execution if using CDN
app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limit generic APIs
app.use('/api/', apiLimiter);

// Bind static assets folder
app.use(express.static(path.join(__dirname, 'public')));

// Mount REST API endpoints
app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/typing', typingRoutes);
app.use('/api/shop', shopRoutes);
app.use('/api/social', socialRoutes);
app.use('/api/admin', adminRoutes);

// Expose environment variables to frontend dynamically
app.get('/config.js', (req, res) => {
    res.type('application/javascript');
    res.send(`
        window.ENV = {
            API_BASE_URL: ${JSON.stringify(process.env.API_BASE_URL || '/api')},
            SOCKET_URL: ${JSON.stringify(process.env.SOCKET_URL || '')}
        };
    `);
});

// Catch-all to serve index.html for SPA frontend routing
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use(errorHandler);


// ========================================================
// SOCKET.IO REAL-TIME LOGIC
// ========================================================

const onlineUsers = new Map(); // userId -> { socketId, username, profile }
const activeRooms = new Map(); // roomCode -> { players: [], text: '', countdownStarted: false, started: false }
const publicQueue = []; // socketIds of players waiting for matchmaking

// Generate randomized text/sentences for online lobbies
const MULTIPLAYER_TEXTS = [
    "Typing speed is not just about moving your fingers quickly. It is about flow, rhythm, and accuracy. Consistency yields progress.",
    "Web development combines art and logic. HTML structures the page, CSS shapes the beauty, and JavaScript brings interactions to life.",
    "Experience is simply the name we give our mistakes. Do not fear typing errors; they highlight exactly where to train next.",
    "A journey of a thousand miles begins with a single step. Every typing test you finish brings you closer to keyboard mastery."
];

function generateRoomCode() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

io.use((socket, next) => {
    const token = socket.handshake.auth.token || socket.handshake.query.token;
    if (token && token !== 'null') {
        jwt.verify(token, JWT_SECRET, (err, decoded) => {
            if (err) {
                socket.user = { guest: true, username: `Guest_${socket.id.substring(0, 5)}` };
            } else {
                socket.user = decoded; // { id, username, role }
            }
            next();
        });
    } else {
        socket.user = { guest: true, username: `Guest_${socket.id.substring(0, 5)}` };
        next();
    }
});

io.on('connection', (socket) => {
    const user = socket.user;
    
    // Register online user status
    if (user.id) {
        onlineUsers.set(user.id, {
            socketId: socket.id,
            username: user.username,
            lastActive: new Date()
        });
        // Notify friends that this user is now online
        socket.broadcast.emit('friend_status_change', { userId: user.id, status: 'online' });
    }
    
    console.log(`🔌 Connection: Socket ${socket.id} joined as ${user.username}`);

    // --- CHAT SERVICE ---
    socket.on('join_chat_lobby', (friendId) => {
        socket.join(`chat_${friendId}_${user.id}`);
        socket.join(`chat_${user.id}_${friendId}`);
    });

    socket.on('send_chat_message', (data) => {
        const { receiverId, message } = data;
        const msgPayload = {
            id: Date.now(),
            sender_id: user.id || null,
            sender_username: user.username,
            receiver_id: receiverId,
            message: message,
            created_at: new Date()
        };
        // Emit to target rooms
        io.to(`chat_${user.id}_${receiverId}`).emit('new_chat_message', msgPayload);
        io.to(`chat_${receiverId}_${user.id}`).emit('new_chat_message', msgPayload);
    });


    // --- MULTIPLAYER GAME SERVICE ---

    // 1. Create a private room
    socket.on('create_room', () => {
        const roomCode = generateRoomCode();
        const randText = MULTIPLAYER_TEXTS[Math.floor(Math.random() * MULTIPLAYER_TEXTS.length)];
        
        activeRooms.set(roomCode, {
            code: roomCode,
            text: randText,
            players: [],
            countdownStarted: false,
            started: false
        });

        joinPlayerToRoom(socket, roomCode);
    });

    // 2. Join a private room by code
    socket.on('join_room', (roomCode) => {
        const code = roomCode.toUpperCase().trim();
        const room = activeRooms.get(code);

        if (!room) {
            return socket.emit('join_room_error', { error: 'Room does not exist.' });
        }
        if (room.started) {
            return socket.emit('join_room_error', { error: 'Race has already started.' });
        }
        if (room.players.length >= 5) {
            return socket.emit('join_room_error', { error: 'Room is full (max 5 players).' });
        }

        joinPlayerToRoom(socket, code);
    });

    // 3. Quick Play / Public matchmaking queue
    socket.on('join_matchmaking', () => {
        if (!publicQueue.includes(socket.id)) {
            publicQueue.push(socket.id);
        }

        // Try to pair players when queue reaches 2 or more
        if (publicQueue.length >= 2) {
            const p1SocketId = publicQueue.shift();
            const p2SocketId = publicQueue.shift();
            
            const p1Socket = io.sockets.sockets.get(p1SocketId);
            const p2Socket = io.sockets.sockets.get(p2SocketId);

            if (p1Socket && p2Socket) {
                const roomCode = 'PUB_' + generateRoomCode();
                const randText = MULTIPLAYER_TEXTS[Math.floor(Math.random() * MULTIPLAYER_TEXTS.length)];
                
                activeRooms.set(roomCode, {
                    code: roomCode,
                    text: randText,
                    players: [],
                    countdownStarted: false,
                    started: false,
                    isPublic: true
                });

                joinPlayerToRoom(p1Socket, roomCode);
                joinPlayerToRoom(p2Socket, roomCode);

                io.to(roomCode).emit('matchmaker_found', { roomCode });
                startLobbyCountdown(roomCode);
            }
        } else {
            socket.emit('matchmaking_queued', { message: 'Searching for online opponents...' });
        }
    });

    // Cancel Matchmaking
    socket.on('leave_matchmaking', () => {
        const idx = publicQueue.indexOf(socket.id);
        if (idx !== -1) {
            publicQueue.splice(idx, 1);
        }
        socket.emit('matchmaking_left');
    });

    // Helper to join players to rooms
    function joinPlayerToRoom(s, roomCode) {
        const room = activeRooms.get(roomCode);
        if (!room) return;

        s.join(roomCode);
        s.currentRoom = roomCode;

        // Player structure
        const playerObj = {
            id: s.id,
            userId: s.user.id || null,
            username: s.user.username,
            progress: 0,
            wpm: 0,
            finished: false,
            ready: false
        };

        room.players.push(playerObj);
        activeRooms.set(roomCode, room);

        // Notify client
        s.emit('room_joined', {
            roomCode,
            text: room.text,
            players: room.players
        });

        // Notify room members
        s.to(roomCode).emit('room_players_updated', { players: room.players });
    }

    // Host or client ready trigger (for manual race start)
    socket.on('toggle_ready', () => {
        const roomCode = socket.currentRoom;
        const room = activeRooms.get(roomCode);
        if (!room) return;

        const player = room.players.find(p => p.id === socket.id);
        if (player) {
            player.ready = !player.ready;
            io.to(roomCode).emit('room_players_updated', { players: room.players });

            // If everyone is ready (and there are >= 2 players), start the countdown
            const allReady = room.players.every(p => p.ready);
            if (allReady && room.players.length >= 2 && !room.countdownStarted) {
                startLobbyCountdown(roomCode);
            }
        }
    });

    // Start lobby countdown sequence
    function startLobbyCountdown(roomCode) {
        const room = activeRooms.get(roomCode);
        if (!room || room.countdownStarted) return;

        room.countdownStarted = true;
        activeRooms.set(roomCode, room);

        let countdown = 10;
        const timer = setInterval(() => {
            io.to(roomCode).emit('race_countdown', { count: countdown });
            countdown--;

            if (countdown < 0) {
                clearInterval(timer);
                room.started = true;
                activeRooms.set(roomCode, room);
                io.to(roomCode).emit('race_started');
            }
        }, 1000);
    }

    // 4. Update typing progress during race
    socket.on('race_progress', (data) => {
        const { progress, wpm } = data; // progress is fraction from 0.0 to 1.0
        const roomCode = socket.currentRoom;
        const room = activeRooms.get(roomCode);
        if (!room) return;

        const player = room.players.find(p => p.id === socket.id);
        if (player && !player.finished) {
            player.progress = progress;
            player.wpm = wpm;

            // Broadcast to other racers
            socket.to(roomCode).emit('opponent_progress', {
                id: socket.id,
                progress,
                wpm
            });
        }
    });

    // 5. Complete race run
    socket.on('race_finished', (data) => {
        const { wpm, accuracy } = data;
        const roomCode = socket.currentRoom;
        const room = activeRooms.get(roomCode);
        if (!room) return;

        const player = room.players.find(p => p.id === socket.id);
        if (player && !player.finished) {
            player.finished = true;
            player.wpm = wpm;
            player.accuracy = accuracy;
            
            // Calculate final placement order
            const finishersCount = room.players.filter(p => p.finished).length;
            player.place = finishersCount;

            io.to(roomCode).emit('opponent_finished', {
                id: socket.id,
                username: player.username,
                wpm,
                accuracy,
                place: player.place
            });

            // Check if all players are finished
            const allFinished = room.players.every(p => p.finished);
            if (allFinished) {
                // Broadcast final scoreboard
                const resultsSorted = [...room.players].sort((a, b) => b.wpm - a.wpm);
                io.to(roomCode).emit('race_results', { results: resultsSorted });
                
                // Clean up room after 1 minute
                setTimeout(() => {
                    activeRooms.delete(roomCode);
                }, 60000);
            }
        }
    });

    // 6. Handle socket disconnects
    socket.on('disconnect', () => {
        console.log(`🔌 Disconnect: Socket ${socket.id}`);
        
        // Remove from online list
        if (user.id) {
            onlineUsers.delete(user.id);
            socket.broadcast.emit('friend_status_change', { userId: user.id, status: 'offline' });
        }

        // Remove from matchmaking queue
        const idx = publicQueue.indexOf(socket.id);
        if (idx !== -1) {
            publicQueue.splice(idx, 1);
        }

        // Clean up from race rooms
        const roomCode = socket.currentRoom;
        if (roomCode) {
            const room = activeRooms.get(roomCode);
            if (room) {
                room.players = room.players.filter(p => p.id !== socket.id);
                activeRooms.set(roomCode, room);

                if (room.players.length === 0) {
                    activeRooms.delete(roomCode);
                } else {
                    io.to(roomCode).emit('room_players_updated', { players: room.players });
                    io.to(roomCode).emit('opponent_left', { id: socket.id });
                }
            }
        }
    });
});

// Initialize database check and then start listening
server.listen(PORT, () => {
    console.log(`🚀 TypeSprint Server running at http://localhost:${PORT}`);
});
