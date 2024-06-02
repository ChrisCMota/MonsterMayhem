const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static('public'));

let players = [];
let gameState = {
    board: Array(10).fill(null).map(() => Array(10).fill(null)),
    currentPlayer: 0,
    rounds: 0
};

io.on('connection', (socket) => {
    console.log('A player connected:', socket.id);

    if (players.length < 4) {
        const playerNumber = players.length + 1;
        players.push({ id: socket.id, number: playerNumber, monsters: 0, wins: 0, losses: 0 });
        socket.emit('playerNumber', playerNumber);
    }

    if (players.length === 4) {
        io.emit('startGame', players);
    }

    socket.on('placeMonster', (data) => {
        // Handle placing monster logic here
        io.emit('updateGameState', gameState);
    });

    socket.on('disconnect', () => {
        console.log('A player disconnected:', socket.id);
        players = players.filter(player => player.id !== socket.id);
        io.emit('playerDisconnected', socket.id);
    });
});

server.listen(3000, () => {
    console.log('Server is running on port 3000');
});
