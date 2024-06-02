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
    rounds: 0,
    eliminatedPlayers: []
};

const monsterTypes = ['V', 'W', 'G'];
const playerColors = ['blue', 'red', 'green', 'yellow'];

io.on('connection', (socket) => {
    console.log('A player connected:', socket.id);

    if (players.length < 4) {
        const playerNumber = players.length + 1;
        players.push({ id: socket.id, number: playerNumber, monsters: 0, wins: 0, losses: 0, color: playerColors[playerNumber - 1] });
        socket.emit('playerNumber', playerNumber);
        console.log(`Player ${playerNumber} connected`);
    }

    if (players.length === 4) {
        io.emit('startGame', players);
    }

    socket.on('placeMonster', (data) => {
        const { playerNumber, monsterType, position } = data;
        const { row, col } = position;

        if (gameState.board[row][col] === null) {
            gameState.board[row][col] = { type: monsterType, player: playerNumber };
            players[playerNumber - 1].monsters++;
            updateGameState();
        }
    });

    socket.on('moveMonster', (data) => {
        const { from, to } = data;
        const { fromRow, fromCol } = from;
        const { toRow, toCol } = to;
        
        const movingMonster = gameState.board[fromRow][fromCol];
        
        if (movingMonster) {
            gameState.board[toRow][toCol] = movingMonster;
            gameState.board[fromRow][fromCol] = null;
            handleConflicts(toRow, toCol);
            updateGameState();
        }
    });

    socket.on('disconnect', () => {
        console.log('A player disconnected:', socket.id);
        players = players.filter(player => player.id !== socket.id);
        io.emit('playerDisconnected', socket.id);
    });
});

function updateGameState() {
    io.emit('updateGameState', gameState);
}

function handleConflicts(row, col) {
    const currentMonster = gameState.board[row][col];
    let otherMonsters = [];

    for (let r = 0; r < 10; r++) {
        for (let c = 0; c < 10; c++) {
            if (r === row && c === col) continue;
            const monster = gameState.board[r][c];
            if (monster && monster.player !== currentMonster.player) {
                otherMonsters.push({ row: r, col: c, monster });
            }
        }
    }

    for (let { row: otherRow, col: otherCol, monster: otherMonster } of otherMonsters) {
        if (row === otherRow && col === otherCol) {
            resolveConflict(row, col, otherRow, otherCol);
        }
    }
}

function resolveConflict(row1, col1, row2, col2) {
    const monster1 = gameState.board[row1][col1];
    const monster2 = gameState.board[row2][col2];

    if (monster1.type === 'V' && monster2.type === 'W' ||
        monster1.type === 'W' && monster2.type === 'G' ||
        monster1.type === 'G' && monster2.type === 'V') {
        gameState.board[row2][col2] = null;
    } else if (monster1.type === monster2.type) {
        gameState.board[row1][col1] = null;
        gameState.board[row2][col2] = null;
    }
}

server.listen(3000, () => {
    console.log('Server is running on port 3000');
});
