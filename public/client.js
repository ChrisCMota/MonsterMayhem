const socket = io();

let playerNumber;
let gameState;
let selectedMonster = null;
let movePhase = false;

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

    boardElement.appendChild(document.createElement('div'));
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
            cell.addEventListener('click', handleCellClick);
            cell.setAttribute('draggable', true);
            cell.addEventListener('dragstart', handleDragStart);
            cell.addEventListener('dragover', handleDragOver);
            cell.addEventListener('drop', handleDrop);
            boardElement.appendChild(cell);
        }
    }

    document.getElementById('end-turn').addEventListener('click', () => {
        if (gameState.turnOrder[gameState.currentPlayer] === playerNumber) {
            console.log('Ending turn for player:', playerNumber);
            socket.emit('endTurn');
            selectedMonster = null;
            clearHighlights();
            movePhase = false;
        } else {
            console.log("It's not your turn.");
        }
    });
}

function handleCellClick(event) {
    const cell = event.target;
    const row = parseInt(cell.dataset.row);
    const col = parseInt(cell.dataset.col);
    const cellContent = gameState.board[row][col];

    if (!movePhase) {
        const monsterType = document.getElementById('monster-type').value;
        if (isValidPlacement(playerNumber, row, col) && gameState.board[row][col] === null) {
            if (monsterType && ['V', 'W', 'G'].includes(monsterType)) {
                console.log('Placing new monster:', { playerNumber, monsterType, position: { row, col } });
                socket.emit('placeMonster', { playerNumber, monsterType, position: { row, col } });
                movePhase = true;
            }
        } else {
            console.log("Invalid placement. You can only place one monster per turn.");
        }
    }
}

function handleDragStart(event) {
    const cell = event.target;
    const row = parseInt(cell.dataset.row);
    const col = parseInt(cell.dataset.col);
    const cellContent = gameState.board[row][col];

    if (cellContent && cellContent.player === playerNumber && cellContent.roundPlaced < gameState.rounds && !gameState.movedMonsters.has(cellContent)) {
        selectedMonster = { row, col, monster: cellContent };
        event.dataTransfer.setData('text/plain', JSON.stringify(selectedMonster));
        event.dataTransfer.effectAllowed = 'move';
    } else {
        event.preventDefault();
    }
}

function handleDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
}

function handleDrop(event) {
    event.preventDefault();
    const cell = event.target;
    const row = parseInt(cell.dataset.row);
    const col = parseInt(cell.dataset.col);

    const data = event.dataTransfer.getData('text/plain');
    const draggedMonster = JSON.parse(data);

    if (gameState.board[row][col] === null && isValidMove(draggedMonster.row, draggedMonster.col, row, col)) {
        console.log('Moving monster to new position:', { startRow: draggedMonster.row, startCol: draggedMonster.col, endRow: row, endCol: col });
        socket.emit('moveMonster', { startRow: draggedMonster.row, startCol: draggedMonster.col, endRow: row, endCol: col, playerNumber });
        selectedMonster = null;
        clearHighlights();
    } else {
        console.log("Invalid move. Please try again.");
    }
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
                cell.setAttribute('draggable', true);
            } else {
                cell.className = 'grid-item';
                cell.setAttribute('draggable', false);
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

function isValidMove(fromRow, fromCol, toRow, toCol) {
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

function clearHighlights() {
    const cells = document.querySelectorAll('.selected');
    cells.forEach(cell => cell.classList.remove('selected'));
}
