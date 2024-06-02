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
    turnCounter: 0,
    eliminatedPlayers: [],
    turnOrder: [],
    monsterPlacedThisTurn: false, // Track if a monster has been placed this turn
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
        startNewRound();
        io.emit('startGame', players);
    }

    socket.on('placeMonster', (data) => {
        const { playerNumber, monsterType, position } = data;
        const { row, col } = position;

        if (gameState.turnOrder[gameState.currentPlayer] === playerNumber && !gameState.monsterPlacedThisTurn) {
            if (isValidPlacement(playerNumber, row, col) && gameState.board[row][col] === null) {
                gameState.board[row][col] = { type: monsterType, player: playerNumber, placedThisTurn: true };
                players[playerNumber - 1].monsters++;
                gameState.monsterPlacedThisTurn = true; // Mark that a monster has been placed this turn
                console.log(`Player ${playerNumber} placed a ${monsterType} at (${row}, ${col})`);
                updateGameState();
            } else {
                console.log(`Invalid placement by Player ${playerNumber} at (${row}, ${col})`);
            }
        } else {
            console.log(`Player ${playerNumber} is not allowed to place a monster now.`);
        }
    });

    socket.on('moveMonster', (data) => {
        const { from, to } = data;
        const { fromRow, fromCol } = from;
        const { toRow, toCol } = to;

        const movingMonster = gameState.board[fromRow][fromCol];

        if (movingMonster && isValidMove(movingMonster.player, fromRow, fromCol, toRow, toCol) && !movingMonster.placedThisTurn) {
            gameState.board[toRow][toCol] = { ...movingMonster, placedThisTurn: false };
            gameState.board[fromRow][fromCol] = null;
            handleConflicts(toRow, toCol);
            console.log(`Player ${movingMonster.player} moved a monster from (${fromRow}, ${fromCol}) to (${toRow}, ${toCol})`);
            updateGameState();
        } else {
            console.log(`Invalid move by Player ${movingMonster.player} from (${fromRow}, ${fromCol}) to (${toRow}, ${toCol})`);
        }
    });

    socket.on('endTurn', () => {
        const currentPlayer = gameState.turnOrder[gameState.currentPlayer];
        if (currentPlayer === getPlayerNumber(socket.id)) {
            endTurn();
            updateGameState();
        }
    });

    socket.on('disconnect', () => {
        console.log('A player disconnected:', socket.id);
        players = players.filter(player => player.id !== socket.id);
        io.emit('playerDisconnected', socket.id);
    });
});

function startNewRound() {
    gameState.rounds++;
    gameState.turnCounter = 0; // Reset turn counter at the start of a new round
    gameState.monsterPlacedThisTurn = false; // Reset monster placement flag
    if (gameState.rounds === 1) {
        gameState.turnOrder = players.map(player => player.number).sort(() => Math.random() - 0.5);
    } else {
        gameState.turnOrder = determineTurnOrder();
    }
    gameState.currentPlayer = 0;
    updateGameState();
}

function determineTurnOrder() {
    const activePlayers = players.filter(player => !gameState.eliminatedPlayers.includes(player.number));
    activePlayers.sort((a, b) => a.monsters - b.monsters);
    let minMonsters = activePlayers[0].monsters;
    let playersWithMinMonsters = activePlayers.filter(player => player.monsters === minMonsters);
    if (playersWithMinMonsters.length > 1) {
        playersWithMinMonsters = playersWithMinMonsters.sort(() => Math.random() - 0.5);
    }
    return playersWithMinMonsters.map(player => player.number);
}

function endTurn() {
    gameState.turnCounter++; // Increment turn counter whenever a turn ends
    gameState.monsterPlacedThisTurn = false; // Reset monster placement flag for the new turn
    for (let i = 0; i < 10; i++) {
        for (let j = 0; j < 10; j++) {
            const monster = gameState.board[i][j];
            if (monster) {
                monster.placedThisTurn = false;
            }
        }
    }

    if (gameState.currentPlayer < gameState.turnOrder.length - 1) {
        gameState.currentPlayer++;
    } else {
        startNewRound();
    }
}

function updateGameState() {
    console.log('Updating game state:', gameState);
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
        players[monster2.player - 1].monsters--;
        checkElimination(monster2.player);
    } else if (monster1.type === monster2.type) {
        gameState.board[row1][col1] = null;
        gameState.board[row2][col2] = null;
        players[monster1.player - 1].monsters--;
        players[monster2.player - 1].monsters--;
        checkElimination(monster1.player);
        checkElimination(monster2.player);
    }
}

function checkElimination(playerNumber) {
    if (players[playerNumber - 1].monsters >= 10) {
        gameState.eliminatedPlayers.push(playerNumber);
        if (gameState.eliminatedPlayers.length === players.length - 1) {
            io.emit('gameOver', gameState.turnOrder.filter(player => !gameState.eliminatedPlayers.includes(player))[0]);
        }
    }
}

function isValidPlacement(playerNumber, row, col) {
    if (playerNumber === 1 && col === 0) return true;
    if (playerNumber === 2 && col === 9) return true;
    if (playerNumber === 3 && row === 0) return true;
    if (playerNumber === 4 && row === 9) return true;
    return false;
}

function isValidMove(playerNumber, fromRow, fromCol, toRow, toCol) {
    const movingMonster = gameState.board[fromRow][fromCol];
    if (!movingMonster || movingMonster.player !== playerNumber) return false;
    if (toRow < 0 || toRow >= 10 || toCol < 0 || toCol >= 10) return false;

    const rowDiff = Math.abs(toRow - fromRow);
    const colDiff = Math.abs(toCol - fromCol);

    if (rowDiff === colDiff && rowDiff <= 2) return true;
    if (rowDiff === 0 || colDiff === 0) return true;

    return false;
}

function getPlayerNumber(socketId) {
    const player = players.find(player => player.id === socketId);
    return player ? player.number : null;
}

server.listen(3000, () => {
    console.log('Server is running on port 3000');
});
