const PATH = 'https://192.168.1.151:8913/'

let send;
let signal;

(async function () {
    let lastPeerId = null
    let peer = null // Own peer object
    let conn = null
    let p2pconnected = false
    let recvIdInput = document.getElementById("receiver-id")
    let status = document.getElementById("status")
    let message = document.getElementById("message")
    let sendMessageBox = document.getElementById("sendMessageBox")
    let sendButton = document.getElementById("sendButton")
    let clearMsgsButton = document.getElementById("clearMsgsButton")
    let connectButton = document.getElementById("connect-button")
    let cueString = "<span class=\"cueMsg\">Cue: </span>"

    const themes = await fetchJSON(`${PATH}/../styles/themes/themes.json`)
    const slideshows = await fetchJSON(`${PATH}/../slideshow/slideshow-config.json`)
    const musicPlaylists = await fetchJSON(`${PATH}/../audio/playlists.json`)
    const ambiencePlaylists = await fetchJSON(`${PATH}/../audio/ambience.json`)

    function initPeer2Peer() {
        peer = new Peer(null, { debug: 2 })
        peer.on('open', function (id) {
            if (peer.id === null) {
                peer.id = lastPeerId
            } else {
                lastPeerId = peer.id
            }
            console.log(`peer.on('open')`)
            checkForKeyAndJoin()
        })
        peer.on('connection', function (c) {
            console.log(`peer.on('connection')`)
            c.on('open', function () {
                c.send("Sender does not accept incoming connections")
                setTimeout(function () { c.close() }, 500)
            })
        })
        peer.on('disconnected', function () {
            console.log(`peer.on('disconnected')`)
            p2pconnected = false
            status.innerHTML = "<span class=\"red\">Connection lost. Please reconnect</span>"
            document.querySelectorAll('.control-panel').forEach(c => { c.classList.add('closed') })
            peer.id = lastPeerId
            peer._lastServerId = lastPeerId
            peer.reconnect()
        })
        peer.on('close', function () {
            console.log(`peer.on('close')`)
            p2pconnected = false
            conn = null
            status.innerHTML = "<span class=\"red\">Connection destroyed. Please refresh</span>"
            document.querySelectorAll('.control-panel').forEach(c => { c.classList.add('closed') })
        })
        peer.on('error', function (err) {
            p2pconnected = false
            showAlert('' + err)
        })
    };

    signal = function (sigName) {
        if (conn && conn.open) {
            conn.send(sigName)
            addMessage(cueString + sigName)
        } else {
            console.error('No connection found.')
            showAlert('No connection found.')
        }
    }

    // Function to populate theme selectbox with received data
    function populateThemesData(themes) {
        const selectElement = document.getElementById('updateTheme')
        selectElement.innerHTML = '' // empty it out first
        themes?.forEach(theme => {
            const option = document.createElement('option')
            option.value = theme.name
            option.textContent = theme.name
            option.setAttribute('data-image', theme.img)
            selectElement.appendChild(option)
        })
    }

    // Function to populate slideshows selectbox with received data
    function populateSlideshowsData(slideshows) {
        const selectElement = document.getElementById('updateSlideshowContext')
        selectElement.innerHTML = '' // empty it out first

        // Insert a blank option into the slideshows object
        slideshows = { '': { id: '', name: 'None' }, ...slideshows }

        for (const [id, config] of Object.entries(slideshows)) {
            const option = document.createElement('option')
            option.value = id
            option.textContent = config.name
            selectElement.appendChild(option)
        }
    }

    // Function to populate playlist data
    function populatePlaylistData(playlist, elemId) {
        const selectElement = document.getElementById(elemId)
        selectElement.innerHTML = '' // empty it out first

        // Insert a blank option into the playlist object
        playlist = { '': [], ...playlist }

        for (const [id] of Object.entries(playlist)) {
            const option = document.createElement('option')
            option.value = id
            const name = !id ? 'None' : id.replace(/^dnd_/, 'D&D ').replace(/^sw_/, 'Starwars ').replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase())
            option.textContent = name
            selectElement.appendChild(option)
        }
    }

    function populateTrackData(playlistId, musicOrAmbience) {
        // Find the selected playlist based on the playlistId
        const selectedPlaylist = musicOrAmbience === 'ambience' ? ambiencePlaylists[playlistId] : musicPlaylists[playlistId] // Access the playlist based on its ID (e.g., 'dnd_calm')

        // Clear the current select options
        const selectElement = document.getElementById(`update_${musicOrAmbience}_track`)
        selectElement.innerHTML = '' // Clear existing options

        // If the playlist is found and contains tracks, loop through them
        if (selectedPlaylist) {
            let i = 0
            selectedPlaylist.forEach(trackPath => {
                // Extract the file name and format it using the replacements
                const title = trackPath
                    .split('/').pop() // Get the file name
                    .replace(/\.[^/.]+$/, '') // Remove file extension
                    .replace(/_s_/g, '\'s ')
                    .replace(/_m_/g, '\'m ')
                    .replace(/_t_/g, '\'t ')
                    .replace(/_d_/g, '\'d ')
                    .replace(/_/g, ' ') // Replace underscores with spaces

                // Create a new option element for the select dropdown
                const optionElement = document.createElement('option')
                optionElement.value = i // Set the value to the track number (starting at 0)
                optionElement.textContent = title // Set the displayed text to the formatted title

                // Append the option to the select element
                selectElement.appendChild(optionElement)
                i++
            })
        }
    }

    async function createRadioButtons(containerId, groupName, currentSlideshow) {
        if (typeof currentSlideshow === 'undefined') return false
        const container = document.getElementById(containerId)
        const totalSlides = currentSlideshow?.scenes?.length || 0
        container.innerHTML = '' // Clear previous radio buttons

        for (let i = 1; i <= totalSlides; i++) {
            const radioInput = document.createElement('input')
            radioInput.type = 'radio'
            radioInput.id = `${groupName}_${i}`
            radioInput.name = groupName
            radioInput.value = i

            // Add the click event listener to the radio input
            radioInput.onclick = function (event) {
                signal(containerId + ':' + event.target.value)
            }

            const radioLabel = document.createElement('label')
            radioLabel.htmlFor = radioInput.id
            radioLabel.textContent = i
            radioLabel.classList.add('radio-button')

            // Check if the currentSlideshow contains images, and set the background-image
            if (currentSlideshow.scenes[i - 1]) {
                const config = currentSlideshow.scenes[i - 1]
                let imageUrl
                const fromTop = config.focalPointDistanceFromTop ?? '50%'
                const fromLeft = config.focalPointDistanceFromLeft ?? '50%'
                let title
                if (config.image) {
                    imageUrl =  `${PATH}../${config.image}`
                } else if (config.url) {
                    const url = config.url
                    const response = await fetch('../' + url)
                    const htmlString = await response.text() // Get HTML as text

                    // Create a temporary DOM element to parse the HTML string
                    const tempDiv = document.createElement('div')
                    tempDiv.innerHTML = htmlString

                    // Check if there is an <img> tag in the parsed HTML
                    if (tempDiv.querySelector('.slideshow-content img')) {
                        imageUrl = `${PATH}../${tempDiv.querySelector('img').getAttribute('src')}`
                        console.log('Image URL:', imageUrl)
                    }
                }
                if (config.caption) {
                    title = config.caption
                    if (config.subcap) {
                        title += `\n${config.subcap}`
                    }
                }
                radioLabel.style.backgroundImage = `url("${imageUrl}")`
                radioLabel.style.backgroundSize = 'cover'
                radioLabel.style.backgroundPosition = `${fromLeft} ${fromTop}`
                if (title) radioLabel.title = title
            }

            container.appendChild(radioInput)
            container.appendChild(radioLabel)
        }
    }

    function join(forcedPasskey) {
        const passkey = forcedPasskey || recvIdInput.value
        if (passkey) {
            setCookie('passkey', passkey)
            if (conn) { conn.close() }
            conn = peer.connect(`orcnog-${passkey}`, { label: 'CONTROLLER', reliable: true })
            conn.on('open', function () {
                console.debug(`conn.on('open')`)
                p2pconnected = true
                status.innerHTML = "Connected to: " + conn.peer.split('orcnog-')[1]
                document.querySelectorAll('.control-panel').forEach(c => {c.classList.remove('closed')})
            })
            conn.on('data', function (data) {
                console.debug(`conn.on('data')`)
                if (typeof data === 'object') {
                    handleDataObject(data)
                } else {
                    addMessage("<span class=\"peerMsg\">Peer:</span> " + data)
                }
            })
            conn.on('close', function () {
                console.debug(`conn.on('close')`)
                p2pconnected = false
                status.innerHTML = "<span class=\"red\">Connection closed</span>"
                document.querySelectorAll('.control-panel').forEach(c => {c.classList.add('closed')})
            })
        }
    };

    function checkForKeyAndJoin() {
        let passkey

        if (!p2pconnected) {
            // Get the current URL search parameters
            const urlParams = new URLSearchParams(window.location.search)
            
            // Check if the 'key' parameter exists
            if (urlParams.has('id')) {
                // Get the value of the 'key' parameter
                const qsIdVal = urlParams.get('id')
                passkey = qsIdVal
                // Call the join function with the value
                join(passkey)
            }
        }
        if (!passkey) passkey = getCookie('passkey')
        if (passkey) recvIdInput.value = passkey

        recvIdInput.focus()
    }

    async function handleDataObject(data) {
        if (data.controllerData) {
            const obj = data.controllerData
            console.debug(obj)

            if (obj.hasOwnProperty('debug')) console.log(obj.debug)
            if (obj.hasOwnProperty('hotMic')) handleMicData(obj)
            if (obj.hasOwnProperty('currentTheme')) handleCurrentThemeData(obj)
            if (obj.hasOwnProperty('currentSlideshow')) await handleCurrentSlideshowData(obj)
            if (obj.hasOwnProperty('currentSlideshowId')) handleCurrentSlideshowIdData(obj)
            if (obj.hasOwnProperty('currentSlideNum') && typeof obj.currentSlideNum === 'number') handleCurrentSlideNumData(obj)
            if (obj.hasOwnProperty('initiativeActive') && obj.initiativeActive === true) handleInitiativeActiveData()
            if (obj.hasOwnProperty('currentAppScale')) handleCurrentAppScaleData(obj)
            if (obj.hasOwnProperty('currentFontSize')) handleCurrentFontSizeData(obj)
            if (obj.hasOwnProperty('currentCombatPlaylist')) handleCurrentCombatPlaylistData(obj)
            if (obj.hasOwnProperty('currentMusicPlaylist')) handleCurrentMusicPlaylistData(obj)
            if (obj.hasOwnProperty('currentMusicTrack')) handleCurrentMusicTrackData(obj)
            if (obj.hasOwnProperty('currentMusicVolume')) handleCurrentMusicVolumeData(obj)
            if (obj.hasOwnProperty('musicWillFade')) handleWillFadeData(obj, 'music')
            if (obj.hasOwnProperty('musicIsPlaying')) handleMusicIsPlayingData(obj.musicIsPlaying)
            if (obj.hasOwnProperty('musicIsLooping')) handleMusicIsLoopingData(obj.musicIsLooping)
            if (obj.hasOwnProperty('musicIsShuffling')) handleMusicIsShufflingData(obj.musicIsShuffling)
            if (obj.hasOwnProperty('ambienceIsPlaying')) handleAmbienceIsPlayingData(obj.ambienceIsPlaying)
            if (obj.hasOwnProperty('currentAmbienceVolume')) handleCurrentAmbienceVolumeData(obj)
            if (obj.hasOwnProperty('ambienceWillFade')) handleWillFadeData(obj, 'ambience')
            if (obj.hasOwnProperty('currentAmbiencePlaylist')) handleCurrentAmbiencePlaylistData(obj)
            if (obj.hasOwnProperty('currentAmbienceTrack')) handleCurrentAmbienceTrackData(obj)
            if (obj.hasOwnProperty('currentPlayers')) handleCurrentPlayersData(obj)
            if (obj.hasOwnProperty('currentRound')) handleCurrentRoundData(obj)
            if (obj.hasOwnProperty('currentTurn')) handleCurrentTurnData(obj)
        }
    }

    // Function to handle hotMic data
    function handleMicData(obj) {
        const isHotMic = obj.hotMic === true
        if (isHotMic) document.getElementById('mic_status').classList.add('hot')
        else document.getElementById('mic_status').classList.remove('hot')
    }

    // Function to handle currentTheme data
    function handleCurrentThemeData(obj) {
        document.getElementById('updateTheme').value = obj.currentTheme
        const themeImage = document.getElementById('updateTheme').selectedOptions[0].getAttribute('data-image')
        document.getElementById('back_to_initiative').style.backgroundImage = `url("${PATH}${themeImage}")`
    }

    // Function to handle currentSlideshow data and create radio buttons
    async function handleCurrentSlideshowData(obj) {
        await createRadioButtons('go_to_slide', 'goToSlideGroup', obj.currentSlideshow)
    }

    // Function to handle currentSlideshowId data
    function handleCurrentSlideshowIdData(obj) {
        const id = obj.currentSlideshowId
        document.getElementById('updateSlideshowContext').value = id
        document.getElementById('slideshow_slide_buttons').style.display = id ? "block" : "none"
    }

    // Function to handle currentSlideNum data
    function handleCurrentSlideNumData(obj) {
        const radioToCheck = document.querySelector(`input[name="goToSlideGroup"][value="${obj.currentSlideNum}"]`)

        if (radioToCheck) {
            radioToCheck.checked = true
        }

        if (obj.currentSlideNum > 0) {
            document.getElementById('back_to_initiative').classList.remove('active')
            document.getElementById('go_to_slide').classList.add('active')
        }
    }

    // Function to handle initiativeActive data
    function handleInitiativeActiveData() {
        document.getElementById('back_to_initiative').classList.add('active')
        document.getElementById('go_to_slide').classList.remove('active')
    }

    // Function to handle currentPlayers data and populate the table
    function handleCurrentPlayersData(obj) {
        const players = obj.currentPlayers

        const table = document.getElementById('initiative_order').querySelector('table')

        // Clear the table before inserting new rows
        table.innerHTML = ''

        // Loop through each player and create a row
        players.forEach(player => {
            const row = document.createElement('tr')
            row.dataset.id = player.id
            row.dataset.name = player.name
            row.dataset.source = player.source
            row.dataset.hash = player.hash
            row.dataset.scaledCr = player.scaledCr
            if (player.bloodied) row.classList.add('bloodied')
            if (player.dead) row.classList.add('dead')

            // Create and append the "order" cell
            const orderCell = document.createElement('td')
            const orderInput = document.createElement('input')
            orderInput.type = 'text'
            orderInput.value = player.order
            orderInput.className = 'player-order'
            orderInput.addEventListener('focus', ()=>{ orderInput.select() })
            orderInput.addEventListener('change', ()=>{ signal(`update_player:{"id":"${player.id}","order":${orderInput.value}}`) })
            orderCell.addEventListener('click', ()=>{ orderInput.focus() })
            orderCell.appendChild(orderInput)
            row.appendChild(orderCell)

            // Create and append the "name" cell
            const nameCell = document.createElement('td');
            const nameInput = document.createElement('input');
            nameInput.type = 'text';
            nameInput.value = player.name;
            nameInput.className = 'player-name';

            // Set the width based on the character count plus a small buffer
            function adjustInputWidth(input) {
                input.style.width = `${Math.max(input.value.length, 1) + 2}ch`;
            }

            nameCell.addEventListener('click', () => { nameInput.focus(); });
            nameInput.addEventListener('focus', () => { nameInput.select(); });
            nameInput.addEventListener('change', () => {
                adjustInputWidth(nameInput);
                signal(`update_player:{"id":"${player.id}","name":"${nameInput.value}"}`);
            });

            adjustInputWidth(nameInput); // Adjust the width on initial load
            nameCell.appendChild(nameInput); // Append the input to the table cell and the cell to the row
            row.appendChild(nameCell);

            const hp = getPlayerHp(player)
            if (hp) {
                // Create and append the "hp" cell
                const hpCell = document.createElement('td')
                const hpInput = document.createElement('input')
                hpInput.type = 'text'
                hpInput.setAttribute('pattern', '^[+-]?\\d*$');
                hpInput.className = 'player-hp'
                hpInput.addEventListener('focus', ()=>{
                    hpInput.select()
                })
                setPlayerHp(hpInput, hp)
                hpInput.addEventListener('change', handleHpChange)
                hpInput.addEventListener('keydown', handleHpKeydown)
                hpCell.addEventListener('click', ()=>{
                    hpInput.focus()
                })
                hpCell.appendChild(hpInput)
                row.appendChild(hpCell)

                // Create and append the "maxhp" cell
                const maxhpCell = document.createElement('td')
                const maxhpInput = document.createElement('span')
                const maxhp = player.hp?.average
                maxhpInput.className = 'player-maxhp'
                maxhpInput.textContent = `/ ${maxhp}`
                maxhpCell.appendChild(maxhpInput)
                row.appendChild(maxhpCell)
            } else {
                // add 2 black table cells, then
                row.appendChild(document.createElement('td'))
                row.appendChild(document.createElement('td'))
            }

            // Create and append the "badge" cell (if it exists)
            const badgeCell = document.createElement('td')
            if (player.dead) {
                badgeCell.textContent = 'Dead'
            } else if (player.bloodied) {
                badgeCell.textContent = 'Bloodied'
            } else {
                badgeCell.textContent = 'Healthy'
            }
            badgeCell.addEventListener('click', ()=>{
                if (player.dead) {
                    signal(`update_player:{"id":"${player.id}","dead":false,"bloodied":false}`) // cycle back to healthy
                }
                else if (player.bloodied) {
                    signal(`update_player:{"id":"${player.id}","dead":true,"bloodied":false}`) // from bloodied to dead
                }
                else {
                    signal(`update_player:{"id":"${player.id}","dead":false,"bloodied":true}`) // from healthy to bloodied
                }
            })
            row.appendChild(badgeCell)

            // If it's a monster, add the statblock display on hover
            row.addEventListener('mouseover', () => {insertStatblock(player.page, player.source, player.hash, player.scaledCr)})

            // Append the row to the table
            table.appendChild(row)
        })
    }

    function handleCurrentRoundData(obj) {
        document.getElementById('round_tracker').textContent = Number(obj.currentRound)
    }

    function handleCurrentTurnData(obj) {
        const turnNum = Number(obj.currentTurn)
        const table = document.getElementById('initiative_order').querySelector('table')
        table.querySelector('tr.active')?.classList.remove('active')
        const playerRow = table.querySelector(`tr:nth-of-type(${turnNum})`)
        playerRow?.classList.add('active')
    }


    function handleCurrentMusicVolumeData(obj) {
        const newVol = Number(obj.currentMusicVolume)
        if (typeof newVol === 'number') document.getElementById('volume_music').value = newVol * 100
    }

    function handleWillFadeData(obj, musicOrAmbience) {
        const { start, finish, duration, id } = obj[`${musicOrAmbience}WillFade`]

        if (typeof start === 'number' && typeof finish === 'number' && typeof duration === 'number') {
            const startTime = Date.now() // Record the start time

            // Calculate the change in volume per interval (assuming fade is linear)
            const fadeStep = (finish - start) / (duration / 250) // Change per 250ms

            let currentVolume = start

            let fadeInterval = setInterval(() => {
                const elapsedTime = Date.now() - startTime
                currentVolume += fadeStep

                // Update the volume slider or volume display
                document.getElementById('volume_' + musicOrAmbience).value = currentVolume * 100
                document.getElementById('volume_' + musicOrAmbience).disabled = true

                // Check if the duration has been reached
                if (elapsedTime >= duration) finishFade()
            }, 250)

            // Ensure the interval clears after the specified duration
            setTimeout(finishFade, duration)

            function finishFade() {
                clearInterval(fadeInterval)  // Stop the interval
                document.getElementById('volume_' + musicOrAmbience).value = finish * 100 // Ensure it ends at the target volume
                document.getElementById('volume_' + musicOrAmbience).disabled = false
            }
        }
    }

    function handleCurrentAppScaleData(obj) {
        document.getElementById('update_app_scale').value = obj.currentAppScale
    }

    function handleCurrentFontSizeData(obj) {
        document.getElementById('update_font_size').value = obj.currentFontSize
    }

    function handleCurrentCombatPlaylistData(obj) {
        document.getElementById('update_combat_playlist').value = obj.currentCombatPlaylist
    }

    function handleCurrentMusicPlaylistData(obj) {
        document.getElementById('update_music_playlist').value = obj.currentMusicPlaylist
        populateTrackData(obj.currentMusicPlaylist, 'music')
    }

    function handleCurrentMusicTrackData(obj) {
        document.getElementById('update_music_track').value = obj.currentMusicTrack
    }

    function handleMusicIsPlayingData(isPlaying) {
        if (isPlaying) document.querySelector('.music-player').classList.add('playing')
        else document.querySelector('.music-player').classList.remove('playing')
    }

    function handleMusicIsLoopingData(isLooping) {
        if (isLooping) document.querySelector('.music-player').classList.add('looping')
        else document.querySelector('.music-player').classList.remove('looping')
    }

    function handleMusicIsShufflingData(isShuffling) {
        if (isShuffling) document.querySelector('.music-player').classList.add('shuffling')
        else document.querySelector('.music-player').classList.remove('shuffling')
    }

    function handleAmbienceIsPlayingData(isPlaying) {
        if (isPlaying) document.querySelector('.ambience-player').classList.add('playing')
        else document.querySelector('.ambience-player').classList.remove('playing')
    }

    function handleCurrentAmbienceVolumeData(obj) {
        const newVol = Number(obj.currentAmbienceVolume)
        if (typeof newVol === 'number') document.getElementById('volume_ambience').value = newVol * 100
    }

    function handleCurrentAmbiencePlaylistData(obj) {
        document.getElementById('update_ambience_playlist').value = obj.currentAmbiencePlaylist
        populateTrackData(obj.currentAmbiencePlaylist, 'ambience')
    }

    function handleCurrentAmbienceTrackData(obj) {
        document.getElementById('update_ambience_track').value = obj.currentAmbienceTrack
    }

    function addMessage(msg) {
        let now = new Date()
        let h = now.getHours()
        let m = addZero(now.getMinutes())
        let s = addZero(now.getSeconds())
        if (h > 12) h -= 12; else if (h === 0) h = 12
        function addZero(t) { if (t < 10) t = "0" + t; return t };
        message.innerHTML = `${message.innerHTML}<span class="msg-time">${h}:${m}:${s}</span> - ${msg}<br/>`
        message.scrollTo({
            top: message.scrollHeight,
            behavior: 'smooth'
        })
    }

    function clearMessages() {
        message.innerHTML = ""
        addMessage("Msgs cleared")
    }

    async function fetchJSON(url) {
        const response = await fetch(url)
        return response.json()
    }

    function generatePlayerID() {
        const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        const idLength = 6;
        let newID;

        const playerRows = document.querySelectorAll('[data-playerid]')
        const ids = Array.from(playerRows).map(p => p.dataset.playerid); // Extract all existing player IDs

        do {
            newID = '';
            for (let i = 0; i < idLength; i++) {
                newID += characters.charAt(Math.floor(Math.random() * characters.length))
            }
        } while (ids.includes(newID)); // Keep generating until a unique ID is found

        return newID;
    }

    async function insertStatblock(page, source, hash, scaledCr) {
        // If it's got page, source, and hash, it's a... it's a MONSTER!!
        if (page && source && hash) {
            // Add a statblock display on mouseover
            const baseMon = await DataLoader.pCacheAndGet(page, source, hash)
            const mon = scaledCr !== null ? await ScaleCreature.scale(baseMon, scaledCr) : baseMon;
            const statblock = Renderer.hover.$getHoverContent_stats(page, mon)
            const scrollTop = window.scrollY;
            $('#initiative-statblock-display').html('').append(statblock)
            window.scrollTo(0, scrollTop);
        } else {
            // Add an option to assign a monster statblock
            // const $addMonsterButton = $(`<table><tr><td>Assign a monster...</td></tr></table>`)
            // $addMonsterButton.on('click', async () => {
            //     // nothing yet
            // })
            
            const $btnAddMonster = $(`<button id="orcnog_initiative_tracker_add_monster" title="Add Creature">Add Creature</button>`)
            .on("click", async () => {
                // if (this._state.isLocked) return;

                // const [isDataEntered, monstersToLoad] = await new InitiativeTrackerMonsterAdd({board: this._board, isRollHp: this._state.isRollHp})
                const [isDataEntered, monstersToLoad] = await new InitiativeTrackerMonsterAdd({board: {}, isRollHp: false})
                    .pGetShowModalResults();
                if (!isDataEntered) return;

                // this._state.isRollHp = monstersToLoad.isRollHp;
                this._state.isRollHp = false;

                // const isGroupRollEval = monstersToLoad.count > 1 && this._state.isRollGroups;
                const isGroupRollEval = false;

                const mon = isGroupRollEval
                    ? await DmScreenUtil.pGetScaledCreature({
                        name: monstersToLoad.name,
                        source: monstersToLoad.source,
                        scaledCr: monstersToLoad.scaledCr,
                        scaledSummonSpellLevel: monstersToLoad.scaledSummonSpellLevel,
                        scaledSummonClassLevel: monstersToLoad.scaledSummonClassLevel,
                    })
                    : null;

                const initiative = isGroupRollEval
                    ? await this._roller.pGetRollInitiative({mon})
                    : null;

                const rowsNxt = [...this._state.rows];

                (await [...new Array(monstersToLoad.count)]
                    .pSerialAwaitMap(async () => {
                        const rowNxt = await this._rowStateBuilderActive.pGetNewRowState({
                            name: monstersToLoad.name,
                            source: monstersToLoad.source,
                            initiative,
                            rows: rowsNxt,
                            displayName: monstersToLoad.displayName,
                            customName: monstersToLoad.customName,
                            scaledCr: monstersToLoad.scaledCr,
                            scaledSummonSpellLevel: monstersToLoad.scaledSummonSpellLevel,
                            scaledSummonClassLevel: monstersToLoad.scaledSummonClassLevel,
                        });
                        if (!rowNxt) return;
                        rowsNxt.push(rowNxt);
                    }));

                this._state.rows = rowsNxt;
            });
            $('#initiative-statblock-display').html('').append($btnAddMonster)
        }
    }

    function showAlert(title, $modalContent) {
        const {$modalInner} = UiUtil.getShowModal({
            title: title || 'Alert',
            isMinHeight0: true,
        })
        $modalInner.append($modalContent)
    }

    function showModal(title, $modalContent) {
        const {$modalInner} = UiUtil.getShowModal({
            title: title,
        })
        $modalInner.append($modalContent)
    }

    async function clearAll (force = false) {
        if (!force && !await InputUiUtil.pGetUserBoolean({title: 'Clear Everything?', textYes: 'Confirm', textNo: 'Cancel'})) return

        signal(`clear_initiative`)
        $('#initiative-statblock-display').html('')

        // Clear all "[playerId]__hp" cookies
        const cookies = document.cookie.split(';'); // Get all cookies
        cookies.forEach(cookie => {
            const cookieName = cookie.split('=')[0].trim(); // Get the cookie name
            if (cookieName.endsWith('__hp')) {
                // If the cookie name ends with "__hp", delete it
                document.cookie = `${cookieName}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
            }
        });
    }

    function getPlayerInitiativeRoll(player) {
        return Number(player.initBonus) + 10
    }

    function getPlayerHp(player, cookieSuffix) {
        const cookieHp = getCookie(`${player.id}__hp${cookieSuffix}`)
        const averageHp = Number(player?.hp?.average)
        const minHp = Number(player?.hp?.min)
        const maxHp = Number(player?.hp?.max)
        return cookieHp !== undefined ? cookieHp : averageHp
    }

    function setPlayerHp(ele, hp, cookieSuffix) {
        const hpInput = ele; // Use the passed element
        hpInput.value = hp; // Set the input value to the new HP
        hpInput.dataset.lastHp = hp; // Update the last HP value in the dataset

        // Find the parent row and get the player ID from the data-id attribute
        const playerRow = hpInput.closest('tr'); // Get the closest parent <tr> element
        const playerId = playerRow ? playerRow.dataset.id : null; // Get the data-id attribute

        if (playerId) {
            setCookie(`${playerId}__hp${cookieSuffix}`, hp); // Save the new HP value in a cookie
        } else {
            console.error('Player ID not found in the row.');
        }
    }

    // Function to handle HP value changes
    function handleHpChange(e) {
        const hpInput = e.target
        const raw = hpInput.value.trim();
        const cur = Number(hpInput.dataset.lastHp); // Ensure cur is a number

        let result; // Variable to hold the new HP value

        if (raw.startsWith("=")) {
            // If it starts with "=", force-set to the value provided
            result = Number(raw.slice(1)); // Convert the value after "=" to a number
        } else if (raw.startsWith("+")) {
            // If it starts with "+", add to the current value
            const addValue = Number(raw.slice(1)); // Get the value after "+"
            result = cur + addValue; // Add to current HP
        } else if (raw.startsWith("-")) {
            // If it starts with "-", subtract from the current value
            const subValue = Number(raw.slice(1)); // Get the value after "-"
            result = cur - subValue; // Subtract from current HP
        } else {
            // Otherwise, just set to the incoming value
            result = Number(raw); // Convert the raw input to a number
        }

        // Lock in the value, save it
        setPlayerHp(hpInput, result);
    }

    function handleHpKeydown(e) {
        const hpInput = e.target
        const cur = Number(hpInput.dataset.lastHp) // Get the current HP as a number

        if (e.key === 'ArrowUp') {
            e.preventDefault(); // Prevent the default action (scrolling)
            const result = Number(cur) + 1 // Increment HP by 1
            setPlayerHp(hpInput, result)
        } else if (e.key === 'ArrowDown') {
            e.preventDefault(); // Prevent the default action (scrolling)
            const result = Number(cur) - 1 // Decrement HP by 1
            setPlayerHp(hpInput, result)
        }
    }
    /**
     * Cookie Management
     */

    function setCookie(name, value) {
        document.cookie = `${name}=${value}; path=/`
    }

    function getCookie(name) {
        const value = "; " + document.cookie
        const parts = value.split("; " + name + "=")
        if (parts.length == 2) return parts.pop().split(";").shift()
    }

    async function initializeDOM () {

        /**
         * Populate some elements in the DOM
         */

        populateThemesData(themes)
        populateSlideshowsData(slideshows)
        populatePlaylistData(musicPlaylists, 'update_music_playlist')
        populatePlaylistData(musicPlaylists, 'update_combat_playlist')
        populatePlaylistData(ambiencePlaylists, 'update_ambience_playlist')

        /**
         * Event listeners and handling
         */

        document.querySelectorAll('.toggle').forEach(tog => {tog.addEventListener('click', (e) => {
            const toggle = e.target.closest('.toggle')
            toggle?.classList.toggle('active')
            document.querySelector(toggle?.dataset.target)?.classList.toggle('closed')
        })})

        document.getElementById('update_music_playlist').addEventListener('change', function (e) {
            populateTrackData(e.target.value, 'music')
        })
        document.getElementById('update_ambience_playlist').addEventListener('change', function (e) {
            populateTrackData(e.target.value, 'ambience')
        })

        sendMessageBox.addEventListener('keypress', function (e) {
            if (e.key == 'Enter') sendButton.click()
        })

        sendButton.addEventListener('click', function () {
            if (conn && conn.open) {
                let msg = sendMessageBox.value
                sendMessageBox.value = ""
                conn.send(msg)
                addMessage("<span class=\"selfMsg\">Self: </span>" + msg)
            }
        })

        clearMsgsButton.addEventListener('click', clearMessages)
        connectButton.addEventListener('click', ()=>{join()})
        recvIdInput.addEventListener('focus', function (e) {
            e.target.select()
        })
        recvIdInput.addEventListener('keypress', function (e) {
            if (e.key == 'Enter') connectButton.click()
        })
        recvIdInput.addEventListener('input', () => {
            recvIdInput.value = recvIdInput.value.toLowerCase().replace(/\s+/g, '-') // Convert to lowercase and replace spaces with dashes
        });

        document.getElementById('new_player').addEventListener('submit', (e)=> {
            e.preventDefault(); // Prevent default form submission

            // Get form data
            const name = document.getElementById('new_player_name').value
            const number = document.getElementById('new_player_roll').value

            signal(`add_player:{"name":"${name}","order":"${number}"}`)
        })

        document.getElementById('new_player_master').addEventListener('submit', (e)=> {
            e.preventDefault(); // Prevent default form submission
            
            // Get form data
            const name = document.getElementById('new_player_name_master').value
            const number = document.getElementById('new_player_roll_master').value
            
            signal(`add_player:{"name":"${name}","order":"${number}"}`)
        })
        
        document.getElementById('clear_initiative').addEventListener('click', ()=>{clearAll()})
    }

    function initTab2Tab () {

        // Create a broadcast channel to communicate between open tabs/windows
        const channel = new BroadcastChannel('orcnog-initiative-controller-broadcast-channel');
        channel.onmessage = async (event) => {
            console.log('Message from other tab:', event.data)
            if (p2pconnected) {
                if (event?.data?.hasOwnProperty('new_initiative_board')) {

                    const newInitObj = event.data.new_initiative_board
                    if (!await InputUiUtil.pGetUserBoolean({
                        title: `Do you want to reset the initiative order with this new encounter data?`,
                        htmlDescription: `<div class="mt-4"><p>${newInitObj?.players?.map(player => player.name).join('</p><p>')}</p></div>`,
                        textYes: 'Confirm',
                        textNo: 'Cancel'
                    })) return
                    clearAll(true)
                    newInitObj?.players?.forEach((player) => {
                        const initiativeOrder = getPlayerInitiativeRoll(player)
                        const id = generatePlayerID()
                        player.id = id
                        signal({
                            "add_player": {
                                "name": player.name,
                                "order": initiativeOrder,
                                "id": id,
                                "hp": player.hp,
                                "initBonus": player.initBonus,
                                "page": player.page,
                                "source": player.source,
                                "hash": player.hash,
                                "scaledCr": player.scaledCr,
                            }
                        })
                    })
                    handleDataObject({"controllerData": newInitObj})
                }
            }
        }
    }

    initPeer2Peer()
    initTab2Tab()
    initializeDOM()
})();