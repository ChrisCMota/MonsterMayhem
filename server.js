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
    movedMonsters: new Set(),
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
        const { startRow, startCol, endRow, endCol, playerNumber } = data;

        if (gameState.board[startRow] && gameState.board[startRow][startCol]) {
            const movingMonster = gameState.board[startRow][startCol];

            if (
                gameState.turnOrder[gameState.currentPlayer] === playerNumber &&
                isValidMove(startRow, startCol, endRow, endCol, playerNumber) &&
                movingMonster.roundPlaced < gameState.rounds &&
                !gameState.movedMonsters.has(movingMonster)
            ) {
                const targetCell = gameState.board[endRow][endCol];
                if (targetCell) {
                    if (targetCell.player === movingMonster.player) return;
                    resolveConflict(movingMonster, targetCell, startRow, startCol, endRow, endCol);
                } else {
                    gameState.board[startRow][startCol] = null;
                    gameState.board[endRow][endCol] = movingMonster;
                }

                gameState.movedMonsters.add(movingMonster);
                console.log(`Player ${movingMonster.player} moved a monster from (${startRow}, ${startCol}) to (${endRow}, ${endCol})`);
                updateGameState();
            } else {
                console.log(`Invalid move by Player ${movingMonster.player} from (${startRow}, ${startCol}) to (${endRow}, ${endCol})`);
            }
        } else {
            console.log(`Invalid move attempt from (${startRow}, ${startCol}) to (${endRow}, ${endCol})`);
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
    gameState.movedMonsters.clear();
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
    gameState.movedMonsters.clear();

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

function resolveConflict(movingMonster, targetMonster, startRow, startCol, endRow, endCol) {
    const outcomes = {
        'V': { 'W': 'removeTarget', 'G': 'removeMoving' },
        'W': { 'G': 'removeTarget', 'V': 'removeMoving' },
        'G': { 'V': 'removeTarget', 'W': 'removeMoving' }
    };
    const outcome = outcomes[movingMonster.type][targetMonster.type];
    if (outcome === 'removeTarget') {
        removeMonster(endRow, endCol, targetMonster);
        gameState.board[endRow][endCol] = movingMonster;
        gameState.board[startRow][startCol] = null;
    } else if (outcome === 'removeMoving') {
        removeMonster(startRow, startCol, movingMonster);
    } else {
        removeMonster(startRow, startCol, movingMonster);
        removeMonster(endRow, endCol, targetMonster);
    }
}

function removeMonster(row, col, monster) {
    const playerIndex = monster.player - 1;
    players[playerIndex].monsters--;
    gameState.board[row][col] = null;
    checkElimination(monster.player);
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

function isValidMove(fromRow, fromCol, toRow, toCol, playerNumber) {
    const movingMonster = gameState.board[fromRow][fromCol];
    if (!movingMonster) return false;
    if (toRow < 0 || toRow >= 10 || toCol < 0 || toCol >= 10) return false;

    const rowDiff = Math.abs(toRow - fromRow);
    const colDiff = Math.abs(toCol - fromCol);

    if (rowDiff === colDiff && rowDiff <= 2) return true;
    if (rowDiff === 0 || colDiff === 0) return true;

    // Check if path is clear (no other player's monsters in the way)
    if (rowDiff > 0 && colDiff === 0) {
        const step = (toRow - fromRow) / rowDiff;
        for (let i = 1; i < rowDiff; i++) {
            if (gameState.board[fromRow + i * step][fromCol] && gameState.board[fromRow + i * step][fromCol].player !== playerNumber) {
                return false;
            }
        }
    } else if (colDiff > 0 && rowDiff === 0) {
        const step = (toCol - fromCol) / colDiff;
        for (let i = 1; i < colDiff; i++) {
            if (gameState.board[fromRow][fromCol + i * step] && gameState.board[fromRow][fromCol + i * step].player !== playerNumber) {
                return false;
            }
        }
    } else if (rowDiff === colDiff) {
        const rowStep = (toRow - fromRow) / rowDiff;
        const colStep = (toCol - fromCol) / colDiff;
        for (let i = 1; i < rowDiff; i++) {
            if (gameState.board[fromRow + i * rowStep][fromCol + i * colStep] && gameState.board[fromRow + i * rowStep][fromCol + i * colStep].player !== playerNumber) {
                return false;
            }
        }
    }

    return true;
}

function getPlayerNumber(socketId) {
    const player = players.find(player => player.id === socketId);
    return player ? player.number : null;
}

server.listen(3000, () => {
    console.log('Server is running on port 3000');
});
