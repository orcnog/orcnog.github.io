"use strict";

// Create a broadcast channel to communicate between open tabs/windows
const channel = new BroadcastChannel('orcnog-initiative-controller-broadcast-channel');

channel.onmessage = (event) => {
    console.log("Message from another tab:", event.data);
    // Handle the message data as needed
};

window.addEventListener('click', function(event) {
    if (event.target.classList.contains('initiative-tracker-link')) {
        event.preventDefault()
        const data = JSON.parse(event.target?.dataset?.encounter);
        console.log("Encounter Data:", data)
        channel.postMessage({
            "new_initiative_board": {
                // Expects a property, `creatures`, which is an array like [{"name":"Cyclops","order":13},{"name":"White Dragon","order":2}],
                "players": data.creatures,
                "currentRound": 1,
                "currentTurn": 1
            }
        })
    }
})
