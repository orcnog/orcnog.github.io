// TODO:
// 1. make a row with an assigned statblock un-assignable.
// 2. make a monster row duplicateable.

import { VOICE_APP_PATH } from "./controller-config.js";

(async function () {
	let lastPeerId = null;
	let peer = null; // Own peer object
	let conn = null;
	let p2pconnected = false;
	let recvIdInput = document.getElementById("receiver-id");
	let status = document.getElementById("status");
	let message = document.getElementById("message");
	let sendMessageBox = document.getElementById("sendMessageBox");
	let sendButton = document.getElementById("sendButton");
	let clearMsgsButton = document.getElementById("clearMsgsButton");
	let connectButton = document.getElementById("connect-button");
	let cueString = "<span class=\"cueMsg\">Cue: </span>";
	let activeAlerts = [];
	let isRowHoverEnabled = true;
	let isMicActive = false;

	const themes = await fetchJSON(`${VOICE_APP_PATH}/../styles/themes/themes.json`);
	const slideshows = await fetchJSON(`${VOICE_APP_PATH}/../slideshow/slideshow-config.json`);
	const musicPlaylists = await fetchJSON(`${VOICE_APP_PATH}/../audio/playlists.json`);
	const ambiencePlaylists = await fetchJSON(`${VOICE_APP_PATH}/../audio/ambience.json`);

	function initPeer2Peer () {
		peer = new Peer(null, { debug: 2 });
		peer.on("open", function (id) {
			if (peer.id === null) {
				peer.id = lastPeerId;
			} else {
				lastPeerId = peer.id;
			}
			console.debug(`peer.on('open')`);
			checkForKeyAndJoin();
		});
		peer.on("connection", function (c) {
			console.debug(`peer.on('connection')`);
			c.on("open", function () {
				c.send("Sender does not accept incoming connections");
				setTimeout(function () { c.close(); }, 500);
			});
		});
		peer.on("disconnected", function () {
			console.debug(`peer.on('disconnected')`);
			p2pconnected = false;
			status.innerHTML = "<span class=\"red\">Connection lost. Please reconnect</span>";
			document.querySelectorAll(".control-panel").forEach(c => { c.classList.add("closed"); });
			peer.id = lastPeerId;
			peer._lastServerId = lastPeerId;
			peer.reconnect();
		});
		peer.on("close", function () {
			console.debug(`peer.on('close')`);
			p2pconnected = false;
			conn = null;
			status.innerHTML = "<span class=\"red\">Connection destroyed. Please refresh</span>";
			document.querySelectorAll(".control-panel").forEach(c => { c.classList.add("closed"); });
		});
		peer.on("error", function (err) {
			p2pconnected = false;
			showAlert(`${err}`);
		});
	}

	async function signal(sigName) {
		// If mic is active, wait for it to become inactive
		if (isMicActive) {
			console.warn("Signal delayed: Waiting for microphone to become inactive...");
			
			await new Promise(resolve => {
				// Create a function to check mic status
				function checkMic() {
					if (!isMicActive) {
						resolve();
					} else {
						// Check again in 250ms
						setTimeout(checkMic, 250);
					}
				}
				// Start checking
				checkMic();
			});
		}
	
		// Now send the signal
		if (conn && conn.open) {
			conn.send(sigName);
			addMessage(cueString + sigName);
		} else {
			console.error("No connection found.");
			showAlert("No connection found.");
		}
	}

	async function openOmnibox(value) {
		return new Promise(resolve => {
			// Set value and focus
			const input = document.querySelector(".omni__input");
			input.value = value;
			input.focus();

			// Show the output wrapper
			document.querySelector(".omni__wrp-output")?.classList.remove("ve-hidden");

			// Try to open search results div immediately
			Omnisearch._pHandleClickSubmit();

			// If it doesn't open immediately, wait for the TYPE_TIMEOUT_MS duration before triggering search
			setTimeout(async () => {
				if (document.querySelector(".omni__wrp-output").classList.contains("ve-hidden")) {
					await Omnisearch._pHandleClickSubmit();
				}
				resolve();
			}, Omnisearch._TYPE_TIMEOUT_MS);
		});
	}

	function closeOmnibox() {
		// Clear and blur the input
		document.querySelector(".omni__input").value = "";
		document.querySelector(".omni__input").blur();
		
		// Hide the output
		document.querySelector(".omni__wrp-output").classList.add("ve-hidden");
	}

	// Function to populate theme selectbox with received data
	function populateThemesData (themes) {
		const selectElement = document.getElementById("updateTheme");
		selectElement.innerHTML = ""; // empty it out first
		themes?.forEach(theme => {
			const option = document.createElement("option");
			option.value = theme.name;
			option.textContent = theme.name;
			option.setAttribute("data-image", theme.img);
			selectElement.appendChild(option);
		});
	}

	// Function to populate slideshows selectbox with received data
	function populateSlideshowsData (slideshows) {
		const selectElement = document.getElementById("updateSlideshowContext");
		selectElement.innerHTML = ""; // empty it out first

		// Insert a blank option into the slideshows object
		slideshows = { "": { id: "", name: "None" }, ...slideshows };

		for (const [id, config] of Object.entries(slideshows)) {
			const option = document.createElement("option");
			option.value = id;
			option.textContent = config.name;
			selectElement.appendChild(option);
		}
	}

	// Function to populate playlist data
	function populatePlaylistData (playlist, elemId) {
		const selectElement = document.getElementById(elemId);
		selectElement.innerHTML = ""; // empty it out first

		// Insert a blank option into the playlist object
		playlist = { "": [], ...playlist };

		for (const [id] of Object.entries(playlist)) {
			const option = document.createElement("option");
			option.value = id;
			const name = !id ? "None" : id.replace(/^dnd_/, "D&D ").replace(/^sw_/, "Starwars ").replace(/_/g, " ").replace(/\b\w/g, char => char.toUpperCase());
			option.textContent = name;
			selectElement.appendChild(option);
		}
	}

	function populateTrackData (playlistId, musicOrAmbience) {
		// Find the selected playlist based on the playlistId
		const selectedPlaylist = musicOrAmbience === "ambience" ? ambiencePlaylists[playlistId] : musicPlaylists[playlistId]; // Access the playlist based on its ID (e.g., 'dnd_calm')

		// Clear the current select options
		const selectElement = document.getElementById(`update_${musicOrAmbience}_track`);
		selectElement.innerHTML = ""; // Clear existing options

		// If the playlist is found and contains tracks, loop through them
		if (selectedPlaylist) {
			let i = 0;
			selectedPlaylist.forEach(trackPath => {
				// Extract the file name and format it using the replacements
				const title = trackPath
					.split("/").pop() // Get the file name
					.replace(/\.[^/.]+$/, "") // Remove file extension
					.replace(/_s_/g, "'s ")
					.replace(/_m_/g, "'m ")
					.replace(/_t_/g, "'t ")
					.replace(/_d_/g, "'d ")
					.replace(/_/g, " "); // Replace underscores with spaces

				// Create a new option element for the select dropdown
				const optionElement = document.createElement("option");
				optionElement.value = i; // Set the value to the track number (starting at 0)
				optionElement.textContent = title; // Set the displayed text to the formatted title

				// Append the option to the select element
				selectElement.appendChild(optionElement);
				i++;
			});
		}
	}

	async function createRadioButtons (containerId, groupName, currentSlideshow) {
		if (typeof currentSlideshow === "undefined") return false;
		const container = document.getElementById(containerId);
		const totalSlides = currentSlideshow?.scenes?.length || 0;
		container.innerHTML = ""; // Clear previous radio buttons

		for (let i = 1; i <= totalSlides; i++) {
			const radioInput = document.createElement("input");
			radioInput.type = "radio";
			radioInput.id = `${groupName}_${i}`;
			radioInput.name = groupName;
			radioInput.value = i;

			// Add the click event listener to the radio input
			radioInput.onclick = function (event) {
				signal(`${containerId}:${event.target.value}`);
			};

			const radioLabel = document.createElement("label");
			radioLabel.htmlFor = radioInput.id;
			radioLabel.textContent = i;
			radioLabel.classList.add("radio-button");

			// Check if the currentSlideshow contains images, and set the background-image
			if (currentSlideshow.scenes[i - 1]) {
				const config = currentSlideshow.scenes[i - 1];
				let imageUrl;
				const fromTop = config.focalPointDistanceFromTop ?? "50%";
				const fromLeft = config.focalPointDistanceFromLeft ?? "50%";
				let title;
				if (config.image) {
					imageUrl = `${VOICE_APP_PATH}../${config.image}`;
				} else if (config.url) {
					const url = config.url;
					const response = await fetch(`../${url}`);
					const htmlString = await response.text(); // Get HTML as text

					// Create a temporary DOM element to parse the HTML string
					const tempDiv = document.createElement("div");
					tempDiv.innerHTML = htmlString;

					// Check if there is an <img> tag in the parsed HTML
					if (tempDiv.querySelector(".slideshow-content img")) {
						imageUrl = `${VOICE_APP_PATH}../${tempDiv.querySelector("img").getAttribute("src")}`;
						console.log("Image URL:", imageUrl);
					}
				}
				if (config.caption) {
					title = config.caption;
					if (config.subcap) {
						title += `\n${config.subcap}`;
					}
				}
				radioLabel.style.backgroundImage = `url("${imageUrl}")`;
				radioLabel.style.backgroundSize = "cover";
				radioLabel.style.backgroundPosition = `${fromLeft} ${fromTop}`;
				if (title) radioLabel.title = title;
			}

			container.appendChild(radioInput);
			container.appendChild(radioLabel);
		}
	}

	function join (forcedPasskey) {
		const passkey = forcedPasskey || recvIdInput.value;
		if (passkey) {
			setCookie("passkey", passkey);
			if (conn) { conn.close(); }
			conn = peer.connect(`orcnog-${passkey}`, { label: "CONTROLLER", reliable: true });
			conn.on("open", function () {
				console.debug(`conn.on('open')`);
				p2pconnected = true;
				status.innerHTML = `Connected to: ${conn.peer.split("orcnog-")[1]}`;
				document.querySelectorAll(".control-panel").forEach(c => { c.classList.remove("closed"); });
			});
			conn.on("data", function (data) {
				console.debug(`conn.on('data')`);
				if (typeof data === "object") {
					handleDataObject(data);
				} else {
					addMessage(`<span class="peerMsg">Peer:</span> ${data}`);
				}
			});
			conn.on("close", function () {
				console.debug(`conn.on('close')`);
				p2pconnected = false;
				status.innerHTML = "<span class=\"red\">Connection closed</span>";
				document.querySelectorAll(".control-panel").forEach(c => { c.classList.add("closed"); });
			});
		}
	}

	function checkForKeyAndJoin () {
		let passkey;

		if (!p2pconnected) {
			// Get the current URL search parameters
			const urlParams = new URLSearchParams(window.location.search);

			// Check if the 'key' parameter exists
			if (urlParams.has("id")) {
				// Get the value of the 'key' parameter
				const qsIdVal = urlParams.get("id");
				passkey = qsIdVal;
				// Call the join function with the value
				join(passkey);
			}
		}
		if (!passkey) passkey = getCookie("passkey");
		if (passkey) recvIdInput.value = passkey;

		recvIdInput.focus();
	}

	function updateMicStatus(isActive) {
		isMicActive = isActive;
		// Update the visual indicator
		const micStatus = document.getElementById("mic_status");
		if (isActive) {
			micStatus?.classList.add("active");
		} else {
			micStatus?.classList.remove("active");
		}
	}

	async function handleDataObject (data) {
		if (data.controllerData) {
			const obj = data.controllerData;
			console.debug(obj);

			if (obj.hasOwnProperty("debug")) console.log(obj.debug);
			if (obj.hasOwnProperty("hotMic")) handleMicData(obj);
			if (obj.hasOwnProperty("currentTheme")) handleCurrentThemeData(obj);
			if (obj.hasOwnProperty("currentSlideshow")) await handleCurrentSlideshowData(obj);
			if (obj.hasOwnProperty("currentSlideshowId")) handleCurrentSlideshowIdData(obj);
			if (obj.hasOwnProperty("currentSlideNum") && typeof obj.currentSlideNum === "number") handleCurrentSlideNumData(obj);
			if (obj.hasOwnProperty("initiativeActive") && obj.initiativeActive === true) handleInitiativeActiveData();
			if (obj.hasOwnProperty("currentAppScale")) handleCurrentAppScaleData(obj);
			if (obj.hasOwnProperty("currentFontSize")) handleCurrentFontSizeData(obj);
			if (obj.hasOwnProperty("currentCombatPlaylist")) handleCurrentCombatPlaylistData(obj);
			if (obj.hasOwnProperty("currentMusicPlaylist")) handleCurrentMusicPlaylistData(obj);
			if (obj.hasOwnProperty("currentMusicTrack")) handleCurrentMusicTrackData(obj);
			if (obj.hasOwnProperty("currentMusicVolume")) handleCurrentMusicVolumeData(obj);
			if (obj.hasOwnProperty("musicWillFade")) handleWillFadeData(obj, "music");
			if (obj.hasOwnProperty("musicIsPlaying")) handleMusicIsPlayingData(obj.musicIsPlaying);
			if (obj.hasOwnProperty("musicIsLooping")) handleMusicIsLoopingData(obj.musicIsLooping);
			if (obj.hasOwnProperty("musicIsShuffling")) handleMusicIsShufflingData(obj.musicIsShuffling);
			if (obj.hasOwnProperty("ambienceIsPlaying")) handleAmbienceIsPlayingData(obj.ambienceIsPlaying);
			if (obj.hasOwnProperty("currentAmbienceVolume")) handleCurrentAmbienceVolumeData(obj);
			if (obj.hasOwnProperty("ambienceWillFade")) handleWillFadeData(obj, "ambience");
			if (obj.hasOwnProperty("currentAmbiencePlaylist")) handleCurrentAmbiencePlaylistData(obj);
			if (obj.hasOwnProperty("currentAmbienceTrack")) handleCurrentAmbienceTrackData(obj);
			if (obj.hasOwnProperty("currentPlayers")) handleCurrentPlayersData(obj);
			if (obj.hasOwnProperty("currentRound")) handleCurrentRoundData(obj);
			if (obj.hasOwnProperty("currentTurn")) handleCurrentTurnData(obj);
		}
	}

	// Function to handle hotMic data
	function handleMicData (obj) {
		const isHotMic = obj.hotMic === true;
		if (isHotMic) {
			document.getElementById("mic_status").classList.add("hot");
			updateMicStatus(true);
		} else {
			document.getElementById("mic_status").classList.remove("hot");
			updateMicStatus(false);
		}
	}

	// Function to handle currentTheme data
	function handleCurrentThemeData (obj) {
		document.getElementById("updateTheme").value = obj.currentTheme;
		const themeImage = document.getElementById("updateTheme").selectedOptions[0].getAttribute("data-image");
		document.getElementById("back_to_initiative").style.backgroundImage = `url("${VOICE_APP_PATH}${themeImage}")`;
	}

	// Function to handle currentSlideshow data and create radio buttons
	async function handleCurrentSlideshowData (obj) {
		await createRadioButtons("go_to_slide", "goToSlideGroup", obj.currentSlideshow);
	}

	// Function to handle currentSlideshowId data
	function handleCurrentSlideshowIdData (obj) {
		const id = obj.currentSlideshowId;
		document.getElementById("updateSlideshowContext").value = id;
		document.getElementById("slideshow_slide_buttons").style.display = id ? "block" : "none";
	}

	// Function to handle currentSlideNum data
	function handleCurrentSlideNumData (obj) {
		const radioToCheck = document.querySelector(`input[name="goToSlideGroup"][value="${obj.currentSlideNum}"]`);

		if (radioToCheck) {
			radioToCheck.checked = true;
		}

		if (obj.currentSlideNum > 0) {
			document.getElementById("back_to_initiative").classList.remove("active");
			document.getElementById("go_to_slide").classList.add("active");
		}
	}

	// Function to handle initiativeActive data
	function handleInitiativeActiveData () {
		document.getElementById("back_to_initiative").classList.add("active");
		document.getElementById("go_to_slide").classList.remove("active");
	}

	// Function to handle currentPlayers data and populate the table
	async function handleCurrentPlayersData (obj) {
		const players = obj.currentPlayers;

		const table = document.getElementById("initiative_order").querySelector("tbody");

		// Clear the table before inserting new rows
		table.innerHTML = "";

		// Loop through each player and create a row
		for (const player of players) {
			// Create a table row for each combatant
			const row = await createPlayerRow(player);
			// Append the row to the table
			table.appendChild(row);
		}

		async function createPlayerRow (player) {
			const row = document.createElement("tr");

			// UrlUtil.autoEncodeHash(mon)

			// add data-attributes for each of the following, if they exist in the incoming player obj
			["id", "name", "spoken", "fromapp", "hash", "isNpc", "scaledCr"].forEach(prop => {
				if (player[prop] != null) row.dataset[prop] = player[prop];
			});

			if (player.bloodied) row.classList.add("bloodied");
			if (player.dead) row.classList.add("dead");

			// Create and append the "order" cell
			const orderCell = document.createElement("td");
			const orderInput = document.createElement("input");
			orderInput.type = "text";
			orderInput.value = player.order;
			orderInput.className = "player-order";
			orderInput.addEventListener("focus", () => { orderInput.select(); });
			orderInput.addEventListener("change", () => { signal(`update_player:{"id":"${player.id}","order":${orderInput.value}}`); });
			orderCell.addEventListener("click", async (e) => {
				e.preventDefault();
				const userSelection = await popoverChooseRollableValue(orderInput, "Initiative");
				if (userSelection !== null) {
					if (userSelection === 3) {
						const rollAnimationMinMax = {min: await calculateNewInit(mon, 2), max: await calculateNewInit(mon, 1)};
						const newInit = await calculateNewInit(mon, 3);
						animateNumber(orderInput, newInit, rollAnimationMinMax).then(() => {
							signal(`update_player:{"id":"${player.id}","order":${newInit}}`);
						});
					} else {
						const newInit = await calculateNewInit(mon, userSelection);
						signal(`update_player:{"id":"${player.id}","order":${newInit}}`);
					}
				}
			});
			orderCell.appendChild(orderInput);
			row.appendChild(orderCell);

			// Create and append the "name" cell
			const nameCell = document.createElement("td");
			const nameInput = document.createElement("input");
			nameInput.type = "text";
			nameInput.value = player.name;
			nameInput.className = "player-name";

			// Set the width based on the character count plus a small buffer
			function adjustInputWidth (input) {
				input.style.width = `${Math.max(input.value.length, 1) + 2}ch`;
			}

			nameInput.addEventListener("click", () => { nameInput.focus(); });
			nameInput.addEventListener("focus", () => { nameInput.select(); });
			nameInput.addEventListener("change", () => {
				adjustInputWidth(nameInput);
				signal(`update_player:{"id":"${player.id}","name":"${nameInput.value}"}`);
			});

			adjustInputWidth(nameInput); // Adjust the width on initial load
			nameCell.appendChild(nameInput); // Append the input to the table cell and the cell to the row
			row.appendChild(nameCell);

			// Create and append the "statblock-lock-status" cell
			const lockCell = document.createElement("td");
			const lockSpan = document.createElement("span");
			lockSpan.classList.add("statblock-lock-status");
			lockCell.appendChild(lockSpan);
			row.appendChild(lockCell);

			const mon = await get5etMonsterByHash(player.hash, player.scaledCr);
			// For creatures with statblocks...
			if (mon) {
				// Create and append the "hp" cell
				let hp = getCookie(`${player.id}__hp`);
				if (!hp) {
					hp = mon?.hp?.average;
				}
				const hpCell = document.createElement("td");
				const hpInput = document.createElement("input");
				const hpCookieSuffix = "__hp";
				hpInput.type = "text";
				hpInput.setAttribute("pattern", "[\\+\\-]?\\d+");
				hpInput.className = "player-hp";
				hpInput.dataset.cookie = hpCookieSuffix;
				setPlayerHp(hpInput, player.id, hp, hpCookieSuffix);
				hpInput.addEventListener("focus", handleHpFocus);
				hpInput.addEventListener("change", handleHpChange);
				hpInput.addEventListener("keydown", handleHpKeydown);
				hpCell.addEventListener("click", () => { hpInput.select(); });
				hpCell.appendChild(hpInput);
				row.appendChild(hpCell);

				// Create and append the "maxhp" cell
				let maxhp = getCookie(`${player.id}__hpmax`);
				if (!maxhp) {
					maxhp = mon.hp?.average;
				}
				const maxhpCell = document.createElement("td");
				maxhpCell.className = "td-player-maxhp";
				const maxhpInput = document.createElement("input");
				const maxhpCookieSuffix = "__hpmax";
				maxhpInput.type = "text";
				maxhpInput.setAttribute("pattern", "[\\+\\-]?\\d+");
				maxhpInput.className = "player-maxhp";
				maxhpInput.dataset.cookie = maxhpCookieSuffix;
				setPlayerHp(maxhpInput, player.id, maxhp, maxhpCookieSuffix);
				maxhpInput.addEventListener("focus", handleHpFocus);
				maxhpInput.addEventListener("change", handleHpChange);
				maxhpInput.addEventListener("keydown", handleHpKeydown);
				maxhpInput.addEventListener("click", async (e) => {
					e.preventDefault();
					const userSelection = await popoverChooseRollableValue(maxhpInput, "HP");
					if (userSelection !== null) {
						const rollAnimationMinMax = userSelection === 3 ? {min: await calculateNewHp(mon, 2), max: await calculateNewHp(mon, 1)} : null;
						const newHp = await calculateNewHp(mon, userSelection);
						setPlayerHp(maxhpInput, player.id, newHp, maxhpCookieSuffix, rollAnimationMinMax);
					}
				});
				maxhpCell.appendChild(maxhpInput);
				row.appendChild(maxhpCell);
			} else {
				// add an "assign monster" btn that spans 2 cells
				row.appendChild(document.createElement("td")); // blank td
				const td = document.createElement("td");
				const span = document.createElement("span");
				span.className = "player-assign-btn assign-a-monster";
				td.appendChild(span);
				row.appendChild(td);
			}

			// Create and append the "badge" cell (if it exists)
			const badgeCell = document.createElement("td");
			const badgeInput = document.createElement("input");
			badgeInput.type = "text";
			badgeInput.className = "player-badge";
			if (player.dead) {
				badgeInput.value = "Dead";
			} else if (player.bloodied) {
				badgeInput.value = "Bloodied";
			} else {
				badgeInput.value = "Healthy";
			}
			badgeInput.addEventListener("mousedown", (e) => {
				e.preventDefault();
				e.target.blur(); // prevent cursor from flashing visibily inside the text field
			});
			badgeInput.addEventListener("click", (e) => {
				e.preventDefault();
				if (player.dead) {
					signal(`update_player:{"id":"${player.id}","dead":false,"bloodied":false}`); // cycle back to healthy
				} else if (player.bloodied) {
					signal(`update_player:{"id":"${player.id}","dead":true,"bloodied":false}`); // from bloodied to dead
				} else {
					signal(`update_player:{"id":"${player.id}","dead":false,"bloodied":true}`); // from healthy to bloodied
				}
			});
			badgeCell.appendChild(badgeInput);
			row.appendChild(badgeCell);

			const showStatblockOnEvent = (e) => {
				const tr = e.target.closest("tr");
				const { name, id, hash, scaledCr } = tr.dataset;
				displayStatblock(name, id, hash, scaledCr);
				highlightRow(tr);
			};

			// If it's a monster, add the statblock display on hover
			row.addEventListener("mouseover", (e) => {
				// If hover is enabled, show the statblock
				if (isRowHoverEnabled && "hash" in row.dataset) {
					showStatblockOnEvent(e);

					// Bind the keydown event to the document
					const keydownHandler = (event) => {
						if (event.shiftKey) {
							isRowHoverEnabled = false; // Disable hover on Shift key press
							document.removeEventListener("keydown", keydownHandler); // Unbind the keydown event
						}
					};

					// Add the keydown event listener to the document
					document.addEventListener("keydown", keydownHandler);
				}
			});

			table.addEventListener("mouseleave", (e) => {
				if (!table.contains(e.relatedTarget)) {
					if (!document.querySelector(".statblock-lock-status.locked")) {
						isRowHoverEnabled = true;
					}
				}
			});

			row.addEventListener("click", (e) => {
				if (e.target.tagName === "INPUT" || !("hash" in row.dataset)) return;
				showStatblockOnEvent(e);

				// Get the clicked row's statblock-lock-status
				const statBlockLockCell = e.target?.closest("tr")?.querySelector(".statblock-lock-status");

				if (statBlockLockCell) {
					// Check if the row is currently locked
					if (statBlockLockCell.classList.contains("locked")) {
						// If locked, remove the class and enable row hover
						statBlockLockCell.classList.remove("locked");
						isRowHoverEnabled = true;
					} else {
						// If not locked, add the class and disable row hover
						document.querySelectorAll(".statblock-lock-status.locked").forEach((c) => c.classList.remove("locked"));
						statBlockLockCell.classList.add("locked");
						isRowHoverEnabled = false;
					}
				}
			});

			// Add a dragover event handler to allow dropping
			row.addEventListener("dragover", (evt) => {
				evt.preventDefault(); // Prevent default to allow drop
				evt.stopPropagation(); // Stop the event from bubbling up
			});
			row.addEventListener("dragenter", (evt) => {
				evt.target.closest("tr")?.classList.add("drop-highlight");
			});
			row.addEventListener("dragleave", (evt) => {
				if (row.contains(evt.relatedTarget)) return;
				evt.target.closest("tr")?.classList.remove("drop-highlight");
			});
			// Add a drop event handler to the row
			row.addEventListener("drop", async (evt) => {
				evt.preventDefault(); // Prevent default behavior
				evt.stopPropagation(); // Stop the event from bubbling up
				evt.target.closest("tr")?.classList.remove("drop-highlight");

				// Log the dataTransfer object to see what is received
				const hash = evt.dataTransfer.getData("text/plain").split("#")?.[1];
				await assignMonsterToRow(row, hash);
			});

			return row;
		}
	}

	function handleCurrentRoundData (obj) {
		document.getElementById("round_tracker").textContent = Number(obj.currentRound);
	}

	function handleCurrentTurnData (obj) {
		const turnNum = Number(obj.currentTurn);
		const table = document.getElementById("initiative_order").querySelector("tbody");
		table.querySelector("tr.active")?.classList.remove("active");
		const playerRow = table.querySelector(`tr:nth-of-type(${turnNum})`);
		playerRow?.classList.add("active");
	}

	function handleCurrentMusicVolumeData (obj) {
		const newVol = Number(obj.currentMusicVolume);
		if (typeof newVol === "number") document.getElementById("volume_music").value = newVol * 100;
	}

	let fadeInterval;
	function handleWillFadeData (obj, musicOrAmbience) {
		const { start, finish, duration, id } = obj[`${musicOrAmbience}WillFade`];

		if (typeof start === "number" && typeof finish === "number" && typeof duration === "number") {
			const startTime = Date.now(); // Record the start time

			// Calculate the change in volume per interval (assuming fade is linear)
			const fadeStep = (finish - start) / (duration / 250); // Change per 250ms

			let currentVolume = start;

			fadeInterval = setInterval(() => {
				const elapsedTime = Date.now() - startTime;
				currentVolume += fadeStep;

				// Update the volume slider or volume display
				document.getElementById(`volume_${musicOrAmbience}`).value = currentVolume * 100;
				document.getElementById(`volume_${musicOrAmbience}`).disabled = true;

				// Check if the duration has been reached
				if (elapsedTime >= duration) finishFade();
			}, 250);

			// Ensure the interval clears after the specified duration
			setTimeout(finishFade, duration);
		}
		function finishFade () {
			clearInterval(fadeInterval); // Stop the interval
			document.getElementById(`volume_${musicOrAmbience}`).value = finish * 100; // Ensure it ends at the target volume
			document.getElementById(`volume_${musicOrAmbience}`).disabled = false;
		}
	}

	function handleCurrentAppScaleData (obj) {
		document.getElementById("update_app_scale").value = obj.currentAppScale;
	}

	function handleCurrentFontSizeData (obj) {
		document.getElementById("update_font_size").value = obj.currentFontSize;
	}

	function handleCurrentCombatPlaylistData (obj) {
		document.getElementById("update_combat_playlist").value = obj.currentCombatPlaylist;
	}

	function handleCurrentMusicPlaylistData (obj) {
		document.getElementById("update_music_playlist").value = obj.currentMusicPlaylist;
		populateTrackData(obj.currentMusicPlaylist, "music");
	}

	function handleCurrentMusicTrackData (obj) {
		document.getElementById("update_music_track").value = obj.currentMusicTrack;
	}

	function handleMusicIsPlayingData (isPlaying) {
		if (isPlaying) document.querySelector(".music-player").classList.add("playing");
		else document.querySelector(".music-player").classList.remove("playing");
	}

	function handleMusicIsLoopingData (isLooping) {
		if (isLooping) document.querySelector(".music-player").classList.add("looping");
		else document.querySelector(".music-player").classList.remove("looping");
	}

	function handleMusicIsShufflingData (isShuffling) {
		if (isShuffling) document.querySelector(".music-player").classList.add("shuffling");
		else document.querySelector(".music-player").classList.remove("shuffling");
	}

	function handleAmbienceIsPlayingData (isPlaying) {
		if (isPlaying) document.querySelector(".ambience-player").classList.add("playing");
		else document.querySelector(".ambience-player").classList.remove("playing");
	}

	function handleCurrentAmbienceVolumeData (obj) {
		const newVol = Number(obj.currentAmbienceVolume);
		if (typeof newVol === "number") document.getElementById("volume_ambience").value = newVol * 100;
	}

	function handleCurrentAmbiencePlaylistData (obj) {
		document.getElementById("update_ambience_playlist").value = obj.currentAmbiencePlaylist;
		populateTrackData(obj.currentAmbiencePlaylist, "ambience");
	}

	function handleCurrentAmbienceTrackData (obj) {
		document.getElementById("update_ambience_track").value = obj.currentAmbienceTrack;
	}

	function addMessage (msg) {
		let now = new Date();
		let h = now.getHours();
		let m = addZero(now.getMinutes());
		let s = addZero(now.getSeconds());
		if (h > 12) h -= 12; else if (h === 0) h = 12;
		function addZero (t) { if (t < 10) t = `0${t}`; return t; }
		message.innerHTML = `${message.innerHTML}<span class="msg-time">${h}:${m}:${s}</span> - ${msg}<br/>`;
		message.scrollTo({
			top: message.scrollHeight,
			behavior: "smooth",
		});
	}

	function clearMessages () {
		message.innerHTML = "";
		addMessage("Msgs cleared");
	}

	async function fetchJSON (url) {
		const response = await fetch(url);
		return response.json();
	}

	function getDataOrNull (value) {
		return (value === undefined || value === null || value === "null" || value === "undefined" || value === "") ? null : value;
	}

	function generatePlayerID () {
		const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
		const idLength = 6;
		let newID;

		const playerRows = document.querySelectorAll("[data-playerid]");
		const ids = Array.from(playerRows).map(p => p.dataset.playerid); // Extract all existing player IDs

		do {
			newID = "";
			for (let i = 0; i < idLength; i++) {
				newID += characters.charAt(Math.floor(Math.random() * characters.length));
			}
		} while (ids.includes(newID)); // Keep generating until a unique ID is found

		return newID;
	}

	function highlightRow (tr, clazz = "statblock") {
		[...tr.parentNode.children].forEach(sibling => sibling !== tr && sibling.classList.remove(`${clazz}-highlight`));
		tr.classList.add(`${clazz}-highlight`);
	}

	async function get5etMonsterByHash (hash, scaledCr) {
		if (!hash) return;
		const baseMon = await DataLoader.pCacheAndGetHash(UrlUtil.PG_BESTIARY, hash);
		// If it's a scaled CR, grab the scaled version from cache, otherwise, use the base version
		const mon = (scaledCr !== undefined && scaledCr !== null && scaledCr !== "null") ? await ScaleCreature.scale(baseMon, scaledCr) : baseMon;
		return mon;
	}

	async function displayStatblock (name, id, hash, scaledCr) {
		name = getDataOrNull(name);
		id = getDataOrNull(id);
		hash = getDataOrNull(hash);
		scaledCr = getDataOrNull(scaledCr);

		// If it's got hash, it's a... it's a MONSTER!! (or npc with a statblock)!!
		if (id && hash) {
			// Add a statblock display on mouseover
			const mon = await get5etMonsterByHash(hash, scaledCr);
			const statblock = Renderer.hover.$getHoverContent_stats(UrlUtil.PG_BESTIARY, mon);
			const scrollTop = window.scrollY;
			$("#initiative-statblock-display").html("").append(statblock);
			$("#initiative-statblock-display").off("cr_update").on("cr_update", (e, scaledMon) => {
				const cr = Parser?.crToNumber(scaledMon?.cr);
				signal(`update_player:{"id":"${id}","scaledCr":"${cr}"}`);
				postProcessStatblockTitle(name, scaledMon);
			});
			$("#initiative-statblock-display").off("cr_reset").on("cr_reset", (e, resetMon) => {
				signal(`update_player:{"id":"${id}","scaledCr":null}`);
				postProcessStatblockTitle(name, resetMon);
			});
			postProcessStatblockTitle(name, mon);
			window.scrollTo(0, scrollTop);
		} else {
			const $btnAddMonster = $(`<button class="assign-a-monster" title="Assign a creature...">Assign a creature...</button>`);
			$("#initiative-statblock-display").html("").append($btnAddMonster);
		}
	}

	function postProcessStatblockTitle (name, mon) {
		// Update display name, if name was provided.
		if (name && name !== mon.name) document.getElementById("initiative-statblock-display").querySelector("h1").textContent = `${name} [${mon._displayName || mon.name}]`;
	}

	async function assignMonsterToRow(row, hash) {
		// Update row's hash
		row.dataset.hash = hash;
		
		// Get player data from row
		const player = {
			name: row.dataset.name,
			id: row.dataset.id,
			order: row.querySelector('.player-order').value
		};
	
		// Get monster data and create player object
		const dmon = await get5etMonsterByHash(hash);
		const playerObjToUpdate = getPlayerObjFromMon({
			name: player.name, 
			id: player.id, 
			order: player.order, 
			hash: hash, 
			mon: dmon
		});
	
		// Clear max HP cookie and update
		removeCookie(`${player.id}__hpmax`);
		signal(`update_player:${JSON.stringify(playerObjToUpdate)}`);
	
		// Close omnibox and update display
		closeOmnibox();
		displayStatblock(player.name, player.id, hash);
		highlightRow(row);
	}

	function showAlert (title, $modalContent) {
		if (activeAlerts.includes($modalContent)) return; // if $modalContent is already in our array of active alerts, don't show a duplicate
		const {$modalInner} = UiUtil.getShowModal({
			title: title || "Alert",
			isMinHeight0: true,
			cbClose: () => { activeAlerts.splice(activeAlerts.indexOf($modalContent), 1); }, // remove $modalContent from our array of active alerts
		});
		$modalInner.append($modalContent);
		activeAlerts.push($modalContent);
	}

	function showModal (title, $modalContent) {
		const {$modalInner} = UiUtil.getShowModal({
			title: title,
		});
		$modalInner.append($modalContent);
	}

	async function clearEncounterConfirmAndDo (title, htmlDescription) {
		// Ask user if they want to clear everything, or just the monsters?
		const userVal = await InputUiUtil.pGetUserGenericButton({
			title: title || "Clear Creatures",
			buttons: [
				new InputUiUtil.GenericButtonInfo({
					text: "Clear Everything",
					clazzIcon: "glyphicon glyphicon-ok",
					value: "everything",
				}),
				new InputUiUtil.GenericButtonInfo({
					text: "Clear Monsters",
					clazzIcon: "glyphicon glyphicon-remove",
					isPrimary: true,
					value: "monsters",
				}),
				new InputUiUtil.GenericButtonInfo({
					text: "Cancel",
					clazzIcon: "glyphicon glyphicon-stop",
					isSmall: true,
					value: "cancel",
				}),
			],
			htmlDescription: htmlDescription || `<p>Do you want to clear everything from the encounter?  Or, clear only the monsters (those with assigned statblocks)?</p>`,
		});

		// handle user response...
		switch (userVal) {
			case "everything": {
				clearAll();
				return true;
			}

			case "monsters": {
				clearMonsters();
				return true;
			}

			case null:
			case "cancel": {
				return false;
			}

			default: throw new Error(`Unexpected value "${userVal}"`);
		}
	}

	function clearMonsters () {
		// clear out only the rows that are mapped to statblocks
		$(".initiative-tracker tr").each((i, el) => {
			const $el = $(el);
			if ($(el).is("[data-hash]")) {
				const playerId = $(el).data("id");
				signal(`update_player:{"id":"${playerId}","name":""}`);
				removeCookie(`${playerId}__hp`);
				removeCookie(`${playerId}__hpmax`);
			}
		});
	}

	async function clearAll () {
		signal(`clear_initiative`);
		$("#initiative-statblock-display").html("");

		// Clear all "[playerId]__hp" cookies
		const cookies = document.cookie.split(";"); // Get all cookies
		cookies.forEach(cookie => {
			const cookieName = cookie.split("=")[0].trim(); // Get the cookie name
			if (cookieName.endsWith("__hp")) {
				// If the cookie name ends with "__hp", delete it
				removeCookie(cookieName);
			}
		});
	}
	async function modalChooseCreatureMaxHP (ele) {
		// Ask user what kinda max HP to set: average, maximum, minimum, or rolled.
		const userVal = await InputUiUtil.pGetUserGenericButton({
			title: "Choose Max HP Type",
			buttons: [
				new InputUiUtil.GenericButtonInfo({
					text: "Average HP",
					isPrimary: true,
					isSmall: true,
					value: 0,
				}),
				new InputUiUtil.GenericButtonInfo({
					text: "Maximum Rollable HP",
					isSmall: true,
					value: 1,
				}),
				new InputUiUtil.GenericButtonInfo({
					text: "Minimum Rollable HP",
					isSmall: true,
					value: 2,
				}),
				new InputUiUtil.GenericButtonInfo({
					text: "Roll for HP!",
					isSmall: true,
					value: 3,
				}),
			],
			htmlDescription: `<p>Select which fixed HP value you would like to assign to this creature, or roll for a random HP value.</p>`,
		});
		return userVal;
	}

	async function popoverChooseRollableValue (ele, title) {
		return new Promise((resolve) => {
			// Create a table to hold the icons
			const popover = createPopover(ele, (popov) => {
				const table = document.createElement("div");
				table.className = "popover-choose-roll";

				// Create and append each cell individually
				const cell1 = document.createElement("button");
				cell1.className = "popover-choose-roll-btn";
				cell1.innerHTML = "Avg";
				cell1.title = `Set to Average ${title} value.`;
				cell1.value = 0;
				cell1.addEventListener("click", () => {
					resolve(0); // Resolve with the value 0 for "average"
					destroyPopover();
				});
				table.appendChild(cell1);

				const cell2 = document.createElement("button");
				cell2.className = "popover-choose-roll-btn";
				cell2.innerHTML = "Max";
				cell2.title = `Set to Maximum rollable ${title} value.`;
				cell2.value = 1;
				cell2.addEventListener("click", () => {
					resolve(1); // Resolve with the value 1 for "maximum"
					destroyPopover();
				});
				table.appendChild(cell2);

				const cell3 = document.createElement("button");
				cell3.className = "popover-choose-roll-btn";
				cell3.innerHTML = "Min";
				cell3.title = `Set to Minimum rollable ${title} value.`;
				cell3.value = 2;
				cell3.addEventListener("click", () => {
					resolve(2); // Resolve with the value 2 for "minimum"
					destroyPopover();
				});
				table.appendChild(cell3);

				const cell4 = document.createElement("button");
				cell4.className = "popover-choose-roll-btn";
				cell4.innerHTML = `<svg fill="#ffffff" height="20" width="20" version="1.1" id="Layer_1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="-50.75 -50.75 609.02 609.02" xml:space="preserve" stroke="#ffffff" stroke-width="0.0050752" transform="rotate(0)"><g id="SVGRepo_iconCarrier"> <g> <g> <g> <polygon points="386.603,185.92 488.427,347.136 488.427,138.944 "></polygon> <polygon points="218.283,18.645 30.827,125.781 131.883,167.893 "></polygon> <polygon points="135.787,202.325 27.264,374.144 235.264,383.189 "></polygon> <polygon points="352.597,170.667 253.781,0 253.739,0 154.923,170.667 "></polygon> <polygon points="471.915,123.051 289.237,18.645 375.445,167.573 "></polygon> <polygon points="19.093,144 19.093,347.136 120.661,186.325 "></polygon> <polygon points="243.093,507.52 243.093,404.843 48.661,396.416 "></polygon> <polygon points="272.235,383.232 480.256,374.144 371.733,202.325 "></polygon> <polygon points="264.427,507.52 458.837,396.416 264.427,404.885 "></polygon> <polygon points="154.475,192 253.76,372.523 353.045,192 "></polygon> </g> </g> </g> </g></svg>`;
				cell4.title = `Roll for ${title}!`;
				cell4.value = 3;
				cell4.addEventListener("click", () => {
					resolve(3); // Resolve with the value 3 for "roll"
					destroyPopover();
				});
				table.appendChild(cell4);

				return table;
			});

			function destroyPopover (e) {
				if (!e || e.relatedTarget === null || (e.relatedTarget !== ele && !popover.contains(e.relatedTarget))) {
					if (popover && document.body.contains(popover)) {
						document.body.removeChild(popover);
					}
					ele.removeEventListener("focusout", destroyPopover);
					ele.removeEventListener("change", destroyPopover);
					resolve(null); // Resolve with null if the popover is closed without a choice
				}
			}

			ele.addEventListener("focusout", destroyPopover);
			ele.addEventListener("change", destroyPopover);

			return popover;
		});
	}

	function createPopover (ele, htmlFunc) {
		// Create the popover element
		const popover = document.createElement("div");
		popover.className = "controller-popover";
		popover.style.position = "absolute";
		popover.style.backgroundColor = "black";
		popover.style.border = "1px solid #222";
		popover.style.zIndex = "1000";
		popover.style.boxShadow = "0 2px 10px rgba(0, 0, 0, 0.1)";
		popover.appendChild(htmlFunc(popover));

		// Append the popover to the body to measure its dimensions
		document.body.appendChild(popover);

		// Position the popover above the element
		const rect = ele.getBoundingClientRect();
		const popoverHeight = popover.offsetHeight; // Get the height after appending

		// Adjust the top position to account for the popover's height and scroll position
		popover.style.top = `${rect.top + window.scrollY - popoverHeight}px`; // Position above the element
		popover.style.left = `${rect.left + (rect.width / 2) - (popover.offsetWidth / 2)}px`; // Center horizontally

		return popover;
	}

	function getPlayerObjFromMon ({ name, id, order, hash, mon }) {
		if (!id || !hash || !mon) return;
		const displayName = name || mon.name;
		const initiativeOrder = order !== null ? order : Parser.getAbilityModNumber(mon.dex || 10);
		return {
			"name": displayName,
			"order": initiativeOrder,
			"id": id, // custom
			"hash": hash, // custom
			"isNpc": mon.isNpc ? mon.isNpc : null,
		};
	}

	/**
	 * @param {*} mon a 5et monster object (hopefully containing an `hp` property obj)
	 * @param {*} hpType 0 = average HP, 1 = max HP, 2 = min HP, 3 = roll HP
	 * @returns {Number} HP
	 */
	async function calculateNewHp (mon, hpType) {
		if (!mon.hp?.formula) {
			console.error("`formula` must be defined in `mon`.");
			return;
		}
		if (hpType === 1) {
			const hpMaximum = Renderer.dice.parseRandomise2(`dmax(${mon.hp.formula})`);
			return hpMaximum;
		}
		if (hpType === 2) {
			const hpMinimum = Renderer.dice.parseRandomise2(`dmin(${mon.hp.formula})`);
			return hpMinimum;
		}
		if (hpType === 3) {
			const hpRandom = await Renderer.dice.pRoll2(mon.hp.formula, {
				isUser: false,
				name: mon.name,
				label: "HP",
			}, {isResultUsed: true});
			return hpRandom;
		}
		// Default or hpType === 0
		const hpAverage = mon.hp.average;
		return hpAverage;
	}

	/**
	 * @param {*} mon a 5et monster object (hopefully containing a `dex` property)
	 * @param {*} rolltype 0 = average, 1 = max, 2 = min, 3 = roll
	 * @returns {Number} Initiative roll
	 */
	async function calculateNewInit (mon, rollType) {
		if (typeof mon.dex !== "number") {
			console.error("`dex` must be defined in `mon`.");
			return;
		}
		const initiativeModifier = mon ? Parser.getAbilityModNumber(mon.dex) : 0;
		const initiativeFormula = `1d20${UiUtil.intToBonus(initiativeModifier)}`;
		if (rollType === 1) {
			const initMaximum = Renderer.dice.parseRandomise2(`dmax(${initiativeFormula})`);
			return initMaximum;
		}
		if (rollType === 2) {
			const initMinimum = Renderer.dice.parseRandomise2(`dmin(${initiativeFormula})`);
			return initMinimum;
		}
		if (rollType === 3) {
			const initRandom = await Renderer.dice.pRoll2(initiativeFormula, {
				isUser: false,
				name: mon.name,
				label: "Initiative",
			}, {isResultUsed: true});
			return initRandom;
		}
		// Default or rollType === 0
		const initAverage = 10 + initiativeModifier;
		return initAverage;
	}

	function setPlayerHp (ele, id, hp, cookieSuffix, rollAnimationMinMax) {
		const hpInput = ele; // Use the passed element
		hpInput.dataset.lastHp = hp; // Update the last HP value in the dataset
		if (rollAnimationMinMax) {
			animateNumber(ele, hp, rollAnimationMinMax);
		} else {
			hpInput.value = hp; // Set the input value to the new HP
		}

		// First try to get playerId from parameter
		let playerId = id;
		
		// If no playerId provided, try to get it from DOM
		if (!playerId) {
			const playerRow = hpInput?.closest("tr");
			playerId = playerRow?.dataset?.id;
		}

		if (playerId) {
			setCookie(`${playerId}${cookieSuffix}`, hp); // Save the new HP value in a cookie
		} else {
			console.error("Player ID not found in the row.");
		}
	}

	async function animateNumber (element, finalNumber, rollAnimationMinMax) {
		return new Promise((resolve) => {
			const totalUpdates = 14; // Total number of updates
			const interval = 3; // duration / totalUpdates; // Base time between updates
			let currentUpdate = 0; // Current update count
			let randomMin = rollAnimationMinMax?.min || 1;
			let randomMax = rollAnimationMinMax?.max || 100;
			// Function to generate a random number
			function getRandomNumber () {
				return Math.floor(Math.random() * (randomMax - randomMin + 1)) + randomMin; // Random number between min and max (inclusive)
			}

			// Animation function
			function updateNumber () {
				if (currentUpdate < totalUpdates) {
					// Calculate the delay for the current update
					const speedFactor = Math.pow(1.35, currentUpdate); // Exponential increase
					const randomNumber = getRandomNumber();

					// Update the element's text content
					if (element.tagName === "INPUT") element.value = randomNumber;
					element.textContent = randomNumber;

					// Schedule the next update
					currentUpdate++;
					setTimeout(updateNumber, interval * speedFactor);
				} else {
					// Final number display
					if (element.tagName === "INPUT") element.value = finalNumber;
					element.textContent = finalNumber;
					resolve();
				}
			}

			// Start the animation
			updateNumber();
		});
	}

	// Function to handle HP input focus
	function handleHpFocus (e) {
		const hpInput = e.target;
		hpInput.select();
	}

	// Function to handle HP value changes
	function handleHpChange (e) {
		const hpInput = e.target;
		const raw = hpInput.value.trim();
		const cur = Number(hpInput.dataset.lastHp); // Ensure cur is a number
		const cookieSuffix = getDataOrNull(hpInput.dataset.cookie) || "__hp";
		const id = hpInput.dataset.id;

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
		setPlayerHp(hpInput, id, result, cookieSuffix);
	}

	function handleHpKeydown (e) {
		const hpInput = e.target;
		const cur = Number(hpInput.dataset.lastHp); // Get the current HP as a number
		const cookieSuffix = getDataOrNull(hpInput.dataset.cookie) || "__hp";
		const id = hpInput.dataset.id;
		let result;

		if (e.key === "ArrowUp") {
			e.preventDefault(); // Prevent the default action (scrolling)
			if (e.shiftKey) {
				result = Number(cur) + 10; // Increment HP by 10
			} else {
				result = Number(cur) + 1; // Increment HP by 1
			}
			setPlayerHp(hpInput, id, result, cookieSuffix);
		} else if (e.key === "ArrowDown") {
			e.preventDefault(); // Prevent the default action (scrolling)
			if (e.shiftKey) {
				result = Number(cur) - 10; // Decrement HP by 10
			} else {
				result = Number(cur) - 1; // Decrement HP by 1
			}
			setPlayerHp(hpInput, id, result, cookieSuffix);
		} else if (e.key === ".") {
			e.preventDefault();
		} else if (e.key === "Enter") {
			e.preventDefault();
			e.target.blur();
		}
	}

	/**
	 * Cookie Management
	 */

	function setCookie (name, value) {
		document.cookie = `${name}=${value}; path=/`;
	}

	function getCookie (name) {
		const value = `; ${document.cookie}`;
		const parts = value.split(`; ${name}=`);
		if (parts.length === 2) return parts.pop().split(";").shift();
	}

	function removeCookie (name) {
		document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
	}

	async function initializeDOM () {
		/**
		 * Populate some elements in the DOM
		 */

		populateThemesData(themes);
		populateSlideshowsData(slideshows);
		populatePlaylistData(musicPlaylists, "update_music_playlist");
		populatePlaylistData(musicPlaylists, "update_combat_playlist");
		populatePlaylistData(ambiencePlaylists, "update_ambience_playlist");

		/**
		 * Event listeners and handling
		 */

		// Theme dropdown
		document.getElementById("updateTheme").addEventListener("change", (e) => {
			signal(`updateTheme:${e.target.value}`);
		});
	
		// Combat playlist dropdown
		document.getElementById("update_combat_playlist").addEventListener("change", (e) => {
			signal(`updateCombatPlaylist:${e.target.value}`);
		});
	
		// Slideshow context dropdown
		document.getElementById("updateSlideshowContext").addEventListener("change", (e) => {
			signal(`updateSlideshowContext:${e.target.value}`);
		});
	
		// App scale input
		document.getElementById("update_app_scale").addEventListener("change", (e) => {
			signal(`updateAppScale:${e.target.value}`);
		});
	
		// Font size input
		document.getElementById("update_font_size").addEventListener("change", (e) => {
			signal(`updateFontSize:${e.target.value}`);
		});
	
		// Initiative tracker button
		document.getElementById("back_to_initiative").addEventListener("click", () => {
			signal("back_to_initiative");
		});
	
		// Turn navigation
		document.getElementById("prev_turn").addEventListener("click", () => {
			signal("prev_turn");
		});
		document.getElementById("next_turn").addEventListener("click", () => {
			signal("next_turn");
		});
	
		// Music controls
		document.getElementById("repeat_music").addEventListener("click", () => {
			signal("repeat_music");
		});
		document.getElementById("prev_track_music").addEventListener("click", () => {
			signal("prev_track_music");
		});
		document.getElementById("play_music").addEventListener("click", () => {
			signal("play_music");
		});
		document.getElementById("pause_music").addEventListener("click", () => {
			signal("pause_music");
		});
		document.getElementById("next_track_music").addEventListener("click", () => {
			signal("next_track_music");
		});
		document.getElementById("shuffle_music").addEventListener("click", () => {
			signal("shuffle_music");
		});
		document.getElementById("volume_music").addEventListener("click", (e) => {
			signal(`volume_music:${e.target.value/100}`);
		});
	
		// Music playlist/track selection
		document.getElementById("update_music_playlist").addEventListener("change", (e) => {
			signal(`update_music:${e.target.value}`);
		});
		document.getElementById("update_music_track").addEventListener("change", (e) => {
			signal(`update_music_track:${e.target.value}`);
		});
	
		// Audio kill switch
		document.getElementById("audio_kill_switch").addEventListener("click", () => {
			signal("kill_audio");
		});
	
		// Ambience controls
		document.getElementById("prev_track_ambience").addEventListener("click", () => {
			signal("prev_track_ambience");
		});
		document.getElementById("play_ambience").addEventListener("click", () => {
			signal("play_ambience");
		});
		document.getElementById("pause_ambience").addEventListener("click", () => {
			signal("pause_ambience");
		});
		document.getElementById("next_track_ambience").addEventListener("click", () => {
			signal("next_track_ambience");
		});
		document.getElementById("volume_ambience").addEventListener("click", (e) => {
			signal(`volume_ambience:${e.target.value/100}`);
		});
	
		// Ambience playlist/track selection
		document.getElementById("update_ambience_playlist").addEventListener("change", (e) => {
			signal(`update_ambience:${e.target.value}`);
		});
		document.getElementById("update_ambience_track").addEventListener("change", (e) => {
			signal(`update_ambience_track:${e.target.value}`);
		});

		document.querySelectorAll(".toggle").forEach(tog => {
			tog.addEventListener("click", (e) => {
				const toggle = e.target.closest(".toggle");
				toggle?.classList.toggle("active");
				document.querySelector(toggle?.dataset.target)?.classList.toggle("closed");
			});
		});

		document.getElementById("update_music_playlist").addEventListener("change", function (e) {
			populateTrackData(e.target.value, "music");
		});
		document.getElementById("update_ambience_playlist").addEventListener("change", function (e) {
			populateTrackData(e.target.value, "ambience");
		});

		sendMessageBox.addEventListener("keypress", function (e) {
			if (e.key == "Enter") sendButton.click();
		});

		sendButton.addEventListener("click", function () {
			if (conn && conn.open) {
				let msg = sendMessageBox.value;
				sendMessageBox.value = "";
				conn.send(msg);
				addMessage(`<span class="selfMsg">Self: </span>${msg}`);
			}
		});

		clearMsgsButton.addEventListener("click", clearMessages);
		connectButton.addEventListener("click", () => { join(); });
		recvIdInput.addEventListener("focus", function (e) {
			e.target.select();
		});
		recvIdInput.addEventListener("keypress", function (e) {
			if (e.key == "Enter") connectButton.click();
		});
		recvIdInput.addEventListener("input", () => {
			recvIdInput.value = recvIdInput.value.toLowerCase().replace(/\s+/g, "-"); // Convert to lowercase and replace spaces with dashes
		});

		document.getElementById("new_player").addEventListener("submit", (e) => {
			e.preventDefault(); // Prevent default form submission

			// Get form data
			const name = document.getElementById("new_player_name").value;
			const number = document.getElementById("new_player_roll").value;

			signal(`add_player:{"name":"${name}","order":"${number}"}`);
		});

		document.getElementById("new_player_master").addEventListener("submit", (e) => {
			e.preventDefault(); // Prevent default form submission

			// Get form data
			const name = document.getElementById("new_player_name_master").value;
			const number = document.getElementById("new_player_roll_master").value;

			signal(`add_player:{"name":"${name}","order":"${number}"}`);
		});

		document.body.addEventListener("click", async (e) => {
			if (e.target.classList.contains("assign-a-monster")) {
				const dismissedNotice = getCookie("assign_monster_notice_dismissed") === "true";
				if (!dismissedNotice) {
					if (await InputUiUtil.pGetUserBoolean({title: "How to Assign a Creature", htmlDescription: `<ol><li>Search for a creature in the global search box.</li><li>Drag and drop that creature's name onto a combatant name in the initiative tracker.</li></ol>`, textYes: "Do not show this again", textNo: "Okay"})) {
						setCookie("assign_monster_notice_dismissed", "true");
					}
				}
				await openOmnibox("in:bestiary ");
					const row = e.target.closest(".initiative-tracker tr");
					if (row) {
					const assignClickedMonsterToRow = (e) => {
						if (e.target.tagName === "A" && e.target.dataset.vetPage === "bestiary.html") {
							e.preventDefault();
							e.stopImmediatePropagation();
							const hash = e.target.dataset.vetHash;
							assignMonsterToRow(row, hash)
							.catch(err => console.error("Error assigning monster:", err))
							.finally(() => {
								// Clean up event listener after assignment completes
								document.querySelector(`.omni__output`).removeEventListener("click", assignClickedMonsterToRow);
							});
						}
					};
					document.querySelector(`.omni__output`).addEventListener("click", assignClickedMonsterToRow);
				}
			}
		});

		document.getElementById("clear_initiative").addEventListener("click", async () => { await clearEncounterConfirmAndDo(); });
	}

	function initTab2Tab () {
		// Create a broadcast channel to communicate between open tabs/windows
		const channel = new BroadcastChannel("orcnog-initiative-controller-broadcast-channel");
		channel.onmessage = async (event) => {
			console.log("Message from other tab:", event.data);
			if (p2pconnected) {
				if (event?.data?.hasOwnProperty("new_initiative_board")) {
					const newInitObj = event.data.new_initiative_board;
					if (!await clearEncounterConfirmAndDo(
						`Do you want to reset the initiative order with this new encounter data?`,
						`<div class="mt-4"><p>${newInitObj?.players?.map(player => player.name).join("</p><p>")}</p></div>`,
					)) return;
					newInitObj?.players?.forEach((player) => {
						const id = generatePlayerID();
						const playerObjToAdd = getPlayerObjFromMon({name: player.name, id: id, order: null, hash: player.hash, mon: player});
						// playerObjToAdd.id = id;
						signal({ "add_player": playerObjToAdd });
					});
					handleDataObject({"controllerData": newInitObj});
					const activeRow = document.querySelector(".initiative-tracker tr.active");
					displayStatblock(activeRow.dataset.name, activeRow.dataset.id, activeRow.dataset.hash);
					highlightRow(activeRow);
				}
			}
		};
	}

	initPeer2Peer();
	initTab2Tab();
	initializeDOM();
})();