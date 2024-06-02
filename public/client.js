const socket = io();

let playerNumber;

socket.on('playerNumber', (number) => {
    playerNumber = number;
    document.getElementById('player-number').textContent = `You are Player ${number}`;
});

socket.on('startGame', (players) => {
    // Initialize game board and stats
});

socket.on('updateGameState', (gameState) => {
    // Update the game board and stats based on the new game state
});

document.getElementById('board').addEventListener('click', (e) => {
    if (e.target.classList.contains('grid-item')) {
        // Handle placing or moving a monster
        socket.emit('placeMonster', { playerNumber, /* additional data */ });
    }
});
