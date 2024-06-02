const socket = io();

let playerNumber;
let gameState;
let selectedMonster = null;

// Handle the event when the server sends the player's number
socket.on('playerNumber', (number) => {
    playerNumber = number;
    document.getElementById('player-number').textContent = `You are Player ${number}`;
});

// Handle the event when the server sends the start game signal
socket.on('startGame', (players) => {
    initializeBoard();
    updateStats(players);
});

// Handle the event when the server sends an updated game state
socket.on('updateGameState', (state) => {
    console.log('Received game state:', state);
    gameState = state;
    updateBoard(state.board);
    updateTurnInfo(state);
    updateStats(state.players);
});

// Handle the event when the game is over and announce the winner
socket.on('gameOver', (winner) => {
    alert(`Player ${winner} wins the game!`);
});

// Initialize the game board
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

    // Add row labels and cells
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
            cell.addEventListener('click', handleCellClick);
            boardElement.appendChild(cell);
        }
    }

    // Add end turn button event listener
    document.getElementById('end-turn').addEventListener('click', () => {
        if (gameState.turnOrder[gameState.currentPlayer] === playerNumber) {
            console.log('Ending turn for player:', playerNumber);
            socket.emit('endTurn');
            selectedMonster = null;
            clearHighlights();
        } else {
            console.log("It's not your turn.");
        }
    });
}

// Handle cell click events for selecting and moving monsters
function handleCellClick(event) {
    const cell = event.target;
    const row = parseInt(cell.dataset.row);
    const col = parseInt(cell.dataset.col);
    const cellContent = gameState.board[row][col];

    if (!selectedMonster && cellContent && cellContent.player === playerNumber) {
        // Select monster
        selectedMonster = { row, col, monster: cellContent };
        highlightSelectedMonster(row, col);
    } else if (selectedMonster) {
        // Move selected monster
        if (isValidMove(selectedMonster.row, selectedMonster.col, row, col)) {
            console.log('Moving monster to new position:', { startRow: selectedMonster.row, startCol: selectedMonster.col, endRow: row, endCol: col });
            socket.emit('moveMonster', { startRow: selectedMonster.row, startCol: selectedMonster.col, endRow: row, endCol: col, playerNumber });
            selectedMonster = null;
            clearHighlights();
        } else {
            console.log("Invalid move. Please try again.");
        }
    } else if (!cellContent && gameState.turnOrder[gameState.currentPlayer] === playerNumber) {
        // Place monster
        const monsterType = document.getElementById('monster-type').value;
        if (isValidPlacement(playerNumber, row, col) && gameState.board[row][col] === null) {
            if (monsterType && ['V', 'W', 'G'].includes(monsterType)) {
                console.log('Placing new monster:', { playerNumber, monsterType, position: { row, col } });
                socket.emit('placeMonster', { playerNumber, monsterType, position: { row, col } });
            }
        } else {
            console.log("Invalid placement. You can only place one monster per turn.");
        }
    }
}

// Update the game board based on the game state
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

// Get the CSS class for a monster type
function getMonsterClass(type) {
    switch (type) {
        case 'V': return 'vampire';
        case 'W': return 'werewolf';
        case 'G': return 'ghost';
    }
}

// Update the player statistics display
function updateStats(players) {
    const statsElement = document.getElementById('game-stats');
    statsElement.innerHTML = players.map(player => `
        Player ${player.number}: 
        Monsters: ${player.monsters} 
        Lost Monsters: ${player.lostMonsters} 
        Wins: ${player.wins} 
        Losses: ${player.losses}
    `).join('<br>');
}

// Update the turn information display
function updateTurnInfo(state) {
    const turnInfo = document.getElementById('turn-info');
    turnInfo.textContent = `Round ${state.rounds} - Player ${state.turnOrder[state.currentPlayer]}'s turn (Turn ${state.turnCounter})`;
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
function isValidMove(fromRow, fromCol, toRow, toCol) {
    if (toRow < 0 || toRow >= 10 || toCol < 0 || toCol >= 10) return false;
    const rowDiff = Math.abs(toRow - fromRow);
    const colDiff = Math.abs(toCol - fromCol);

    if (rowDiff === colDiff && rowDiff <= 2) return true;
    if (rowDiff === 0 || colDiff === 0) return true;

    return false;
}

// Highlight the selected monster's cell
function highlightSelectedMonster(row, col) {
    clearHighlights();
    const cell = document.querySelector(`[data-row="${row}"][data-col="${col}"]`);
    if (cell) {
        cell.classList.add('selected');
    }
}

// Clear all cell highlights
function clearHighlights() {
    const cells = document.querySelectorAll('.selected');
    cells.forEach(cell => cell.classList.remove('selected'));
}
