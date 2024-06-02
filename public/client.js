const socket = io();

let playerNumber;
let gameState;

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
        if (e.target.classList.contains('grid-item') && gameState.turnOrder[gameState.currentPlayer] === playerNumber) {
            const row = e.target.dataset.row;
            const col = e.target.dataset.col;
            if (gameState.rounds === 1) {
                const monsterType = prompt("Enter monster type (V/W/G):");
                if (monsterType && ['V', 'W', 'G'].includes(monsterType)) {
                    socket.emit('placeMonster', { playerNumber, monsterType, position: { row, col } });
                }
            } else {
                if (gameState.board[row][col] === null) {
                    const monsterType = prompt("Enter monster type (V/W/G):");
                    if (monsterType && ['V', 'W', 'G'].includes(monsterType)) {
                        socket.emit('placeMonster', { playerNumber, monsterType, position: { row, col } });
                    }
                } else {
                    const fromRow = prompt("Enter row of the monster to move:");
                    const fromCol = prompt("Enter col of the monster to move:");
                    socket.emit('moveMonster', { from: { fromRow, fromCol }, to: { row, col } });
                }
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

function updateTurnInfo(state) {
    const turnInfo = document.getElementById('turn-info');
    turnInfo.textContent = `Player ${state.turnOrder[state.currentPlayer]}'s turn`;
}
