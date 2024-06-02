const socket = io();

let playerNumber;
let gameState;
let selectedMonster = null;

socket.on('playerNumber', (number) => {
    playerNumber = number;
    document.getElementById('player-number').textContent = `You are Player ${number}`;
});

socket.on('startGame', (players) => {
    initializeBoard();
    updateStats(players);
});

socket.on('updateGameState', (state) => {
    console.log('Received game state:', state);
    gameState = state;
    updateBoard(state.board);
    updateTurnInfo(state);
});

socket.on('gameOver', (winner) => {
    alert(`Player ${winner} wins the game!`);
});

function initializeBoard() {
    const boardElement = document.getElementById('board');
    boardElement.innerHTML = '';

    // Add top row labels
    boardElement.appendChild(document.createElement('div')); // Empty corner for alignment
    for (let j = 0; j < 10; j++) {
        const label = document.createElement('div');
        label.className = 'grid-label';
        label.textContent = j;
        boardElement.appendChild(label);
    }

    for (let i = 0; i < 10; i++) {
        const label = document.createElement('div');
        label.className = 'grid-label';
        label.textContent = i;
        boardElement.appendChild(label);

        for (let j = 0; j < 10; j++) {
            const cell = document.createElement('div');
            cell.classList.add('grid-item');
            cell.dataset.row = i;
            cell.dataset.col = j;
            boardElement.appendChild(cell);
        }
    }

    boardElement.addEventListener('click', (e) => {
        if (e.target.classList.contains('grid-item') && gameState.turnOrder[gameState.currentPlayer] === playerNumber) {
            const row = parseInt(e.target.dataset.row);
            const col = parseInt(e.target.dataset.col);

            if (!gameState.monsterPlacedThisTurn) {
                const monsterType = document.getElementById('monster-type').value;
                if (isValidPlacement(playerNumber, row, col) && gameState.board[row][col] === null) {
                    if (monsterType && ['V', 'W', 'G'].includes(monsterType)) {
                        socket.emit('placeMonster', { playerNumber, monsterType, position: { row, col } });
                    }
                } else {
                    alert("Invalid placement. You can only place one monster per turn.");
                }
            } else if (selectedMonster) {
                if (gameState.board[row][col] === null && isValidMove(playerNumber, selectedMonster.row, selectedMonster.col, row, col)) {
                    socket.emit('moveMonster', { from: selectedMonster, to: { row, col }, playerNumber });
                    selectedMonster = null;
                } else {
                    alert("Invalid move. Please try again.");
                }
            } else {
                const cellContent = gameState.board[row][col];
                if (cellContent && cellContent.player === playerNumber && cellContent.roundPlaced < gameState.rounds && (!gameState.movedMonsters[playerNumber] || !gameState.movedMonsters[playerNumber][cellContent.roundPlaced])) {
                    selectedMonster = { row, col };
                } else {
                    alert("You can only move monsters placed in previous rounds.");
                }
            }
        } else {
            alert("It's not your turn.");
        }
    });

    document.getElementById('end-turn').addEventListener('click', () => {
        if (gameState.turnOrder[gameState.currentPlayer] === playerNumber) {
            socket.emit('endTurn');
        } else {
            alert("It's not your turn.");
        }
    });
}

function updateBoard(board) {
    const boardElement = document.getElementById('board');
    for (let i = 0; i < 10; i++) {
        for (let j = 0; j < 10; j++) {
            const cell = boardElement.querySelector(`[data-row="${i}"][data-col="${j}"]`);
            const cellContent = board[i][j];
            if (cellContent) {
                cell.className = 'grid-item';
                cell.classList.add(`player-${cellContent.player}`);
                cell.classList.add(getMonsterClass(cellContent.type));
            } else {
                cell.className = 'grid-item';
            }
        }
    }
}

function getMonsterClass(type) {
    switch (type) {
        case 'V': return 'vampire';
        case 'W': return 'werewolf';
        case 'G': return 'ghost';
    }
}

function updateStats(players) {
    const statsElement = document.getElementById('game-stats');
    statsElement.innerHTML = players.map(player => `
        Player ${player.number}: 
        Monsters: ${player.monsters} 
        Wins: ${player.wins} 
        Losses: ${player.losses}
    `).join('<br>');
}

function updateTurnInfo(state) {
    const turnInfo = document.getElementById('turn-info');
    turnInfo.textContent = `Round ${state.rounds} - Player ${state.turnOrder[state.currentPlayer]}'s turn (Turn ${state.turnCounter})`;
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
