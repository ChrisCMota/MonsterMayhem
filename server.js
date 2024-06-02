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
    monsterPlacedThisTurn: false,
    movedMonsters: {},
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
                gameState.board[row][col] = { type: monsterType, player: playerNumber, roundPlaced: gameState.rounds };
                players[playerNumber - 1].monsters++;
                gameState.monsterPlacedThisTurn = true;
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
        const { from, to, playerNumber } = data;
        const { fromRow, fromCol } = from;
        const { toRow, toCol } = to;

        if (gameState.board[fromRow] && gameState.board[fromRow][fromCol]) {
            const movingMonster = gameState.board[fromRow][fromCol];

            if (
                gameState.turnOrder[gameState.currentPlayer] === playerNumber &&
                isValidMove(playerNumber, fromRow, fromCol, toRow, toCol) &&
                movingMonster.roundPlaced < gameState.rounds &&
                (!gameState.movedMonsters[playerNumber] || !gameState.movedMonsters[playerNumber][movingMonster.roundPlaced])
            ) {
                gameState.board[toRow][toCol] = { ...movingMonster };
                gameState.board[fromRow][fromCol] = null;

                // Mark the monster as moved this turn
                if (!gameState.movedMonsters[playerNumber]) {
                    gameState.movedMonsters[playerNumber] = {};
                }
                gameState.movedMonsters[playerNumber][movingMonster.roundPlaced] = true;

                handleConflicts(toRow, toCol);
                console.log(`Player ${movingMonster.player} moved a monster from (${fromRow}, ${fromCol}) to (${toRow}, ${toCol})`);
                updateGameState();
            } else {
                console.log(`Invalid move by Player ${movingMonster.player} from (${fromRow}, ${fromCol}) to (${toRow}, ${toCol})`);
            }
        } else {
            console.log(`Invalid move attempt from (${fromRow}, ${fromCol}) to (${toRow}, ${toCol})`);
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
    gameState.turnCounter = 0;
    gameState.monsterPlacedThisTurn = false;
    gameState.movedMonsters = {};
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
    gameState.turnCounter++;
    gameState.monsterPlacedThisTurn = false;
    gameState.movedMonsters = {};

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
    const conflictingMonster = gameState.board[row][col];

    if (conflictingMonster) {
        if ((currentMonster.type === 'V' && conflictingMonster.type === 'W') ||
            (currentMonster.type === 'W' && conflictingMonster.type === 'G') ||
            (currentMonster.type === 'G' && conflictingMonster.type === 'V')) {
            gameState.board[row][col] = currentMonster;
        } else if (currentMonster.type === conflictingMonster.type) {
            gameState.board[row][col] = null;
        } else {
            gameState.board[row][col] = conflictingMonster;
        }
        players[conflictingMonster.player - 1].monsters--;
        checkElimination(conflictingMonster.player);
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
