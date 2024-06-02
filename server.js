const express = require('express');
const http = require('http');
const socketIo = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Serve static files from the 'public' directory
app.use(express.static('public'));

let players = []; // List to store player information
let gameState = {
    board: Array(10).fill(null).map(() => Array(10).fill(null)), // 10x10 game board
    currentPlayer: 0, // Index of the current player in turn order
    rounds: 0, // Current round number
    turnCounter: 0, // Counter for turns in the current round
    eliminatedPlayers: [], // List of eliminated players
    turnOrder: [], // Order in which players take turns
    monsterPlacedThisTurn: false, // Flag to indicate if a monster has been placed this turn
    movedMonsters: new Set(), // Set of monsters that have been moved this turn
};

const monsterTypes = ['V', 'W', 'G']; // Monster types: Vampire, Werewolf, Ghost
const playerColors = ['blue', 'red', 'green', 'yellow']; // Colors for players

// Handle new player connections
io.on('connection', (socket) => {
    console.log('A player connected:', socket.id);

    // Add a new player if there are fewer than 4 players
    if (players.length < 4) {
        const playerNumber = players.length + 1;
        players.push({ id: socket.id, number: playerNumber, monsters: 0, wins: 0, losses: 0, lostMonsters: 0, color: playerColors[playerNumber - 1] });
        socket.emit('playerNumber', playerNumber); // Send player number to the client
        console.log(`Player ${playerNumber} connected`);
    }

    // Start the game if there are exactly 4 players
    if (players.length === 4) {
        startNewRound();
        io.emit('startGame', players); // Notify all clients to start the game
    }

    // Handle monster placement requests
    socket.on('placeMonster', (data) => {
        const { playerNumber, monsterType, position } = data;
        const { row, col } = position;

        // Check if it's the player's turn and if they haven't placed a monster yet this turn
        if (gameState.turnOrder[gameState.currentPlayer] === playerNumber && !gameState.monsterPlacedThisTurn) {
            if (isValidPlacement(playerNumber, row, col)) {
                const newMonster = { type: monsterType, player: playerNumber, roundPlaced: gameState.rounds };
                if (gameState.board[row][col] === null) {
                    gameState.board[row][col] = newMonster;
                } else {
                    gameState.board[row][col] = resolveConflict(newMonster, gameState.board[row][col]); // Resolve conflict if the cell is occupied
                }
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

    // Handle monster movement requests
    socket.on('moveMonster', (data) => {
        const { startRow, startCol, endRow, endCol, playerNumber } = data;

        if (gameState.board[startRow] && gameState.board[startRow][startCol]) {
            const movingMonster = gameState.board[startRow][startCol];

            // Check if it's the player's turn, the move is valid, and the path is clear
            if (
                gameState.turnOrder[gameState.currentPlayer] === playerNumber &&
                isValidMove(startRow, startCol, endRow, endCol, playerNumber) &&
                isPathClear(startRow, startCol, endRow, endCol, playerNumber) &&
                movingMonster.roundPlaced < gameState.rounds &&
                !gameState.movedMonsters.has(movingMonster)
            ) {
                const targetCell = gameState.board[endRow][endCol];
                if (targetCell) {
                    gameState.board[endRow][endCol] = resolveConflict(movingMonster, targetCell); // Resolve conflict if the cell is occupied
                } else {
                    gameState.board[endRow][endCol] = movingMonster;
                }
                gameState.board[startRow][startCol] = null;

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

    // Handle end turn requests
    socket.on('endTurn', () => {
        const currentPlayer = gameState.turnOrder[gameState.currentPlayer];
        if (currentPlayer === getPlayerNumber(socket.id)) {
            endTurn();
            updateGameState();
        }
    });

    // Handle player disconnections
    socket.on('disconnect', () => {
        console.log('A player disconnected:', socket.id);
        players = players.filter(player => player.id !== socket.id);
        io.emit('playerDisconnected', socket.id);
    });
});

// Start a new round
function startNewRound() {
    gameState.rounds++;
    gameState.turnCounter = 0;
    gameState.monsterPlacedThisTurn = false;
    gameState.movedMonsters.clear();
    if (gameState.rounds === 1) {
        gameState.turnOrder = players.map(player => player.number).sort(() => Math.random() - 0.5); // Randomize turn order for the first round
    } else {
        gameState.turnOrder = determineTurnOrder();
    }
    gameState.currentPlayer = 0;
    updateGameState();
}

// Determine the turn order for the round based on the number of monsters each player has
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

// End the current player's turn and advance to the next player or start a new round
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

// Send the updated game state to all clients
function updateGameState() {
    console.log('Updating game state:', gameState);
    io.emit('updateGameState', { ...gameState, players });
}

// Resolve conflicts when two monsters occupy the same cell
function resolveConflict(movingMonster, targetMonster) {
    const outcomes = {
        'V': { 'W': 'removeTarget', 'G': 'removeMoving' },
        'W': { 'G': 'removeTarget', 'V': 'removeMoving' },
        'G': { 'V': 'removeTarget', 'W': 'removeMoving' }
    };
    const outcome = outcomes[movingMonster.type][targetMonster.type];
    if (outcome === 'removeTarget') {
        removeMonster(targetMonster);
        return movingMonster;
    } else if (outcome === 'removeMoving') {
        removeMonster(movingMonster);
        return targetMonster;
    } else {
        removeMonster(movingMonster);
        removeMonster(targetMonster);
        return null;
    }
}

// Remove a monster from the game board and update the player's lost monsters count
function removeMonster(monster) {
    const playerIndex = monster.player - 1;
    players[playerIndex].monsters--;
    players[playerIndex].lostMonsters++;
    if (players[playerIndex].lostMonsters >= 10) {
        eliminatePlayer(monster.player);
    }
    checkElimination();
}

// Eliminate a player if they have lost 10 monsters
function eliminatePlayer(playerNumber) {
    gameState.eliminatedPlayers.push(playerNumber);
    console.log(`Player ${playerNumber} has been eliminated.`);
    checkElimination();
}

// Check if only one player remains uneliminated and declare them the winner
function checkElimination() {
    const activePlayers = players.filter(player => !gameState.eliminatedPlayers.includes(player.number));
    if (activePlayers.length === 1) {
        const winner = activePlayers[0].number;
        io.emit('gameOver', winner);
    }
}

// Validate if a placement is valid for a player
function isValidPlacement(playerNumber, row, col) {
    if (playerNumber === 1 && col === 0) return true;
    if (playerNumber === 2 && col === 9) return true;
    if (playerNumber === 3 && row === 0) return true;
    if (playerNumber === 4 && row === 9) return true;
    return false;
}

// Validate if a move is valid for a player
function isValidMove(fromRow, fromCol, toRow, toCol, playerNumber) {
    const movingMonster = gameState.board[fromRow][fromCol];
    if (!movingMonster) return false;
    if (toRow < 0 || toRow >= 10 || toCol < 0 || toCol >= 10) return false;

    const rowDiff = Math.abs(toRow - fromRow);
    const colDiff = Math.abs(toCol - fromCol);

    if (rowDiff === colDiff && rowDiff <= 2) return true;
    if (rowDiff === 0 || colDiff === 0) return true;

    return false;
}

// Check if the path for a move is clear of other players' monsters
function isPathClear(fromRow, fromCol, toRow, toCol, playerNumber) {
    const rowDiff = Math.abs(toRow - fromRow);
    const colDiff = Math.abs(toCol - fromCol);

    if (rowDiff > 0 && colDiff === 0) {
        const step = (toRow - fromRow) / rowDiff;
        for (let i = 1; i < rowDiff; i++) {
            const intermediateCell = gameState.board[fromRow + i * step][fromCol];
            if (intermediateCell && intermediateCell.player !== playerNumber) {
                return false;
            }
        }
    } else if (colDiff > 0 && rowDiff === 0) {
        const step = (toCol - fromCol) / colDiff;
        for (let i = 1; i < colDiff; i++) {
            const intermediateCell = gameState.board[fromRow][fromCol + i * step];
            if (intermediateCell && intermediateCell.player !== playerNumber) {
                return false;
            }
        }
    } else if (rowDiff === colDiff) {
        const rowStep = (toRow - fromRow) / rowDiff;
        const colStep = (toCol - fromCol) / colDiff;
        for (let i = 1; i < rowDiff; i++) {
            const intermediateCell = gameState.board[fromRow + i * rowStep][fromCol + i * colStep];
            if (intermediateCell && intermediateCell.player !== playerNumber) {
                return false;
            }
        }
    }

    return true;
}

// Get the player number based on their socket ID
function getPlayerNumber(socketId) {
    const player = players.find(player => player.id === socketId);
    return player ? player.number : null;
}

// Start the server and listen on port 3000
server.listen(3000, () => {
    console.log('Server is running on port 3000');
});
