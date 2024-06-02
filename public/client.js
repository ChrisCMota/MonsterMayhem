const socket = io();

let playerNumber;

socket.on('playerNumber', (number) => {
    playerNumber = number;
    document.getElementById('player-number').textContent = `You are Player ${number}`;
});

socket.on('startGame', (players) => {
    // Initialize game board and stats
    initializeBoard();
    updateStats(players);
});

socket.on('updateGameState', (gameState) => {
    // Update the game board and stats based on the new game state
    updateBoard(gameState.board);
});

function initializeBoard() {
    const boardElement = document.getElementById('board');
    boardElement.innerHTML = '';
    for (let i = 0; i < 10; i++) {
        for (let j = 0; j < 10; j++) {
            const cell = document.createElement('div');
            cell.classList.add('grid-item');
            cell.dataset.row = i;
            cell.dataset.col = j;
            boardElement.appendChild(cell);
        }
    }

    boardElement.addEventListener('click', (e) => {
        if (e.target.classList.contains('grid-item')) {
            const row = e.target.dataset.row;
            const col = e.target.dataset.col;
            const monsterType = prompt("Enter monster type (V/W/G):");
            if (monsterType && ['V', 'W', 'G'].includes(monsterType)) {
                socket.emit('placeMonster', { playerNumber, monsterType, position: { row, col } });
            }
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
                cell.textContent = cellContent.type;
                cell.className = 'grid-item';
                cell.classList.add(`player-${cellContent.player}`);
            } else {
                cell.textContent = '';
                cell.className = 'grid-item';
            }
        }
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
