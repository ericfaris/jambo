(function () {
  // NOTE: This namespace must match JAMBO_CAST_NAMESPACE in src/cast/contracts.ts
  var NAMESPACE = 'urn:x-cast:com.jambo.game.v1';
  var TV_MUSIC_PLAYLIST = [
    '/audio/African_Village_Afternoon_Soundscape.mp3',
    '/audio/Market_Morning_Mosaic.mp3',
    '/audio/River_Paths_Village_Hearts_Voice.mp3',
    '/audio/Sun_In_Our_Hands.mp3',
    '/audio/Sun_on_the_Courtyard.mp3',
    '/audio/Golden_Hour_Kalimba.mp3',
  ];

  // Keep in sync with src/ui/useBackgroundMusic.ts
  var TV_AMBIENCE_URL = '/audio/Market_Ambience_Loop.mp3';
  var TV_AMBIENCE_VOLUME = 0.1;
  var TV_TRACK_GAP_MS = 20000;

  var cafPlayerManager = null;

  var roomState = {
    roomCode: null,
    roomMode: null,
    senderPlayerSlot: null,
    apiBaseUrl: null,
    castAccessToken: null,
    updatedAtMs: null,
  };
  var pollTimer = null;
  var streamSource = null;
  var streamRetryTimer = null;
  var publicRoomSnapshot = null;
  var tvMusic = {
    playlist: [],
    index: 0,
    enabled: false,
    gapTimer: null,
  };

  var placeholderEl = document.getElementById('placeholder');
  var screenEl = document.getElementById('screen');

  var connectionEl = document.getElementById('connection');
  var connectionBoardEl = document.getElementById('connectionBoard');
  var roomEl = document.getElementById('room');
  var detailEl = document.getElementById('detail');
  var roomBoardEl = document.getElementById('roomBoard');

  var player1PanelEl = document.getElementById('player1Panel');
  var player2PanelEl = document.getElementById('player2Panel');
  var player1ActiveTagEl = document.getElementById('player1ActiveTag');
  var player2ActiveTagEl = document.getElementById('player2ActiveTag');

  var player1StatsEl = document.getElementById('player1Stats');
  var player2StatsEl = document.getElementById('player2Stats');
  var player1MarketEl = document.getElementById('player1Market');
  var player2MarketEl = document.getElementById('player2Market');
  var player1UtilitiesEl = document.getElementById('player1Utilities');
  var player2UtilitiesEl = document.getElementById('player2Utilities');
  var player1WaitingEl = document.getElementById('player1Waiting');
  var player2WaitingEl = document.getElementById('player2Waiting');

  var centerChipsEl = document.getElementById('centerChips');
  var supplyEl = document.getElementById('supply');
  var deckDiscardEl = document.getElementById('deckDiscard');
  var endgameEl = document.getElementById('endgame');
  var gameLogEl = document.getElementById('gameLog');

  function shufflePlaylist(source) {
    var shuffled = source.slice();
    for (var i = shuffled.length - 1; i > 0; i -= 1) {
      var j = Math.floor(Math.random() * (i + 1));
      var temp = shuffled[i];
      shuffled[i] = shuffled[j];
      shuffled[j] = temp;
    }
    return shuffled;
  }

  function startTvAmbience() {
    var el = document.getElementById('bgAmbience');
    if (!el || !el.paused) return;
    var baseUrl = (roomState.apiBaseUrl || '').replace(/\/+$/, '');
    el.src = baseUrl + TV_AMBIENCE_URL;
    el.loop = true;
    el.volume = TV_AMBIENCE_VOLUME;
    el.play().catch(function (err) {
      console.warn('[TV Music] Ambience play failed:', err);
    });
  }

  function stopTvMusic() {
    tvMusic.enabled = false;
    if (tvMusic.gapTimer !== null) {
      clearTimeout(tvMusic.gapTimer);
      tvMusic.gapTimer = null;
    }
    var ambienceEl = document.getElementById('bgAmbience');
    if (ambienceEl) {
      ambienceEl.pause();
      ambienceEl.src = '';
    }
    if (cafPlayerManager) {
      try { cafPlayerManager.stop(); } catch { /* ignore */ }
    }
    var bgMusicEl = document.getElementById('bgMusic');
    if (bgMusicEl) {
      bgMusicEl.pause();
      bgMusicEl.src = '';
    }
  }

  function playNextTvTrack() {
    if (!tvMusic.enabled || tvMusic.playlist.length === 0) {
      return;
    }
    if (!cafPlayerManager) {
      console.warn('[TV Music] cafPlayerManager not ready');
      return;
    }
    if (tvMusic.index >= tvMusic.playlist.length) {
      tvMusic.playlist = shufflePlaylist(TV_MUSIC_PLAYLIST);
      tvMusic.index = 0;
    }
    var baseUrl = (roomState.apiBaseUrl || '').replace(/\/+$/, '');
    var trackUrl = baseUrl + tvMusic.playlist[tvMusic.index];
    console.log('[TV Music] Loading track via CAF:', trackUrl);
    tvMusic.index += 1;

    var mediaInfo = new cast.framework.messages.MediaInformation();
    mediaInfo.contentId = trackUrl;
    mediaInfo.contentType = 'audio/mpeg';
    mediaInfo.streamType = cast.framework.messages.StreamType.BUFFERED;

    var loadRequest = new cast.framework.messages.LoadRequestData();
    loadRequest.media = mediaInfo;
    loadRequest.autoplay = true;

    cafPlayerManager.load(loadRequest).then(function () {
      console.log('[TV Music] CAF load() succeeded');
      var bgMusicEl = document.getElementById('bgMusic');
      if (bgMusicEl) bgMusicEl.volume = 0.15;
    }).catch(function (err) {
      console.warn('[TV Music] CAF load() failed:', err);
      // Skip to next track after a short delay
      setTimeout(function () {
        if (tvMusic.enabled) playNextTvTrack();
      }, 2000);
    });
  }

  function ensureTvMusicPlaying() {
    startTvAmbience();
    if (!tvMusic.enabled) {
      tvMusic.enabled = true;
      tvMusic.playlist = shufflePlaylist(TV_MUSIC_PLAYLIST);
      tvMusic.index = 0;
      playNextTvTrack();
      return;
    }
    // If already enabled but paused (e.g. after error recovery), restart —
    // unless it's just the quiet gap between tracks
    var bgMusicEl = document.getElementById('bgMusic');
    if (bgMusicEl && bgMusicEl.paused && cafPlayerManager && tvMusic.gapTimer === null) {
      playNextTvTrack();
    }
  }

  function setConnection(text, isWarning) {
    connectionEl.textContent = text;
    connectionEl.className = 'status-text ' + (isWarning ? 'warn' : 'ok');

    if (connectionBoardEl) {
      connectionBoardEl.textContent = text;
      connectionBoardEl.className = 'status-text ' + (isWarning ? 'warn' : 'ok');
    }
  }

  function toTitleCase(text) {
    return String(text)
      .split('_')
      .map(function (part) {
        if (!part) return '';
        return part[0].toUpperCase() + part.slice(1);
      })
      .join(' ');
  }

  function formatWareName(ware) {
    return toTitleCase(ware);
  }

  function formatCardName(cardId) {
    if (!cardId) return '-';
    var base = String(cardId).replace(/_\d+$/, '');
    return toTitleCase(base);
  }

  function clearNode(node) {
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }
  }

  function appendMetaRow(target, text) {
    var row = document.createElement('div');
    row.textContent = text;
    target.appendChild(row);
  }

  function appendSlot(target, text, isEmpty) {
    var chip = document.createElement('div');
    chip.className = 'slot' + (isEmpty ? ' empty' : '');
    chip.textContent = text;
    target.appendChild(chip);
  }

  function appendStat(target, label, value) {
    var item = document.createElement('div');
    item.className = 'stat-item';

    var labelEl = document.createElement('div');
    labelEl.className = 'stat-label';
    labelEl.textContent = label;

    var valueEl = document.createElement('div');
    valueEl.className = 'stat-value';
    valueEl.textContent = String(value);

    item.appendChild(labelEl);
    item.appendChild(valueEl);
    target.appendChild(item);
  }

  function renderPlayerStats(target, player) {
    clearNode(target);
    appendStat(target, 'Gold', player.gold);
    appendStat(target, 'Hand', player.handCount);
    appendStat(target, 'Stands', player.smallMarketStands);
  }

  function renderMarket(target, market) {
    clearNode(target);
    if (!Array.isArray(market) || market.length === 0) {
      appendSlot(target, 'No wares', true);
      return;
    }

    for (var i = 0; i < market.length; i += 1) {
      var ware = market[i];
      if (ware === null) {
        appendSlot(target, 'Empty', true);
      } else {
        appendSlot(target, formatWareName(ware), false);
      }
    }
  }

  function renderUtilities(target, utilities) {
    clearNode(target);
    if (!Array.isArray(utilities) || utilities.length === 0) {
      appendSlot(target, 'None', true);
      return;
    }

    for (var i = 0; i < utilities.length; i += 1) {
      var utility = utilities[i];
      var text = utility && utility.designId ? toTitleCase(utility.designId) : 'Unknown';
      if (utility && utility.usedThisTurn) {
        text += ' (used)';
      }
      appendSlot(target, text, false);
    }
  }

  function renderSupply(target, supply) {
    clearNode(target);
    var order = ['trinkets', 'hides', 'tea', 'silk', 'fruit', 'salt'];
    for (var i = 0; i < order.length; i += 1) {
      var ware = order[i];
      appendSlot(target, toTitleCase(ware) + ': ' + String(supply && supply[ware] !== undefined ? supply[ware] : '?'), false);
    }
  }

  function renderCenterChips(target, state) {
    clearNode(target);

    var chips = [
      'Phase: ' + state.phase,
      'Turn: ' + state.turn,
      'Current: P' + String(state.currentPlayer + 1),
      'Actions: ' + state.actionsLeft,
    ];

    if (state.pendingResolutionType) {
      chips.push('Resolving: ' + state.pendingResolutionType);
    }

    for (var i = 0; i < chips.length; i += 1) {
      var chip = document.createElement('div');
      chip.className = 'chip' + (chips[i].indexOf('Current:') === 0 ? ' active' : '');
      chip.textContent = chips[i];
      target.appendChild(chip);
    }
  }

  function getWaitingInfo(state) {
    if (state.phase === 'GAME_OVER') {
      return { targetPlayer: null, message: '' };
    }

    if (state.pendingGuardReaction) {
      return {
        targetPlayer: state.pendingGuardReaction.targetPlayer,
        message: 'Player ' + String(state.pendingGuardReaction.targetPlayer + 1) + ' may react with Guard.',
      };
    }

    if (state.pendingWareCardReaction) {
      return {
        targetPlayer: state.pendingWareCardReaction.targetPlayer,
        message: 'Player ' + String(state.pendingWareCardReaction.targetPlayer + 1) + ' may react with Rain Maker.',
      };
    }

    if (state.pendingResolutionType && (state.waitingOnPlayer === 0 || state.waitingOnPlayer === 1)) {
      return {
        targetPlayer: state.waitingOnPlayer,
        message: 'Player ' + String(state.waitingOnPlayer + 1) + ' is choosing (' + state.pendingResolutionType + ').',
      };
    }

    return { targetPlayer: null, message: '' };
  }

  function setActivePlayer(currentPlayer) {
    var p1Active = currentPlayer === 0;
    var p2Active = currentPlayer === 1;

    player1PanelEl.className = 'player-panel' + (p1Active ? ' active' : '');
    player2PanelEl.className = 'player-panel' + (p2Active ? ' active' : '');

    player1ActiveTagEl.textContent = p1Active ? 'Active Turn' : 'Waiting';
    player2ActiveTagEl.textContent = p2Active ? 'Active Turn' : 'Waiting';

    player1ActiveTagEl.className = 'chip' + (p1Active ? ' active' : '');
    player2ActiveTagEl.className = 'chip' + (p2Active ? ' active' : '');
  }

  function renderDeckDiscard(state) {
    clearNode(deckDiscardEl);
    appendMetaRow(deckDiscardEl, 'Deck: ' + String(state.deckCount));
    appendMetaRow(deckDiscardEl, 'Discard Count: ' + String(Array.isArray(state.discardPile) ? state.discardPile.length : 0));
    var topDiscard = Array.isArray(state.discardPile) && state.discardPile.length > 0 ? state.discardPile[0] : null;
    appendMetaRow(deckDiscardEl, 'Top Discard: ' + (topDiscard ? formatCardName(topDiscard) : 'None'));
  }

  function renderEndgame(state) {
    clearNode(endgameEl);
    var p1Gold = state.players && state.players[0] ? state.players[0].gold : 0;
    var p2Gold = state.players && state.players[1] ? state.players[1].gold : 0;

    if (state.phase !== 'GAME_OVER') {
      appendMetaRow(endgameEl, 'Not in endgame.');
      appendMetaRow(endgameEl, 'P1/P2 Gold: ' + String(p1Gold) + '/' + String(p2Gold));
      return;
    }

    var result = 'Tie';
    if (p1Gold > p2Gold) result = 'Player 1 wins';
    if (p2Gold > p1Gold) result = 'Player 2 wins';

    appendMetaRow(endgameEl, result);
    appendMetaRow(endgameEl, 'Final Gold P1/P2: ' + String(p1Gold) + '/' + String(p2Gold));
  }

  function renderGameLog(state) {
    clearNode(gameLogEl);

    var log = Array.isArray(state.log) ? state.log : [];
    if (log.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'No actions yet.';
      gameLogEl.appendChild(empty);
      return;
    }

    var startIndex = Math.max(0, log.length - 14);
    for (var i = log.length - 1; i >= startIndex; i -= 1) {
      var entry = log[i];
      var item = document.createElement('div');
      item.className = 'log-item';

      var details = entry.details ? ' - ' + entry.details : '';
      item.textContent =
        'T' + String(entry.turn) + ' P' + String(entry.player + 1) + ': ' + String(entry.action) + details;
      gameLogEl.appendChild(item);
    }
  }

  function renderRoomMeta(state) {
    var senderRole = roomState.senderPlayerSlot === null
      ? 'TV'
      : 'Player ' + String(roomState.senderPlayerSlot + 1);

    roomEl.textContent = 'Room ' + roomState.roomCode + ' (' + roomState.roomMode + ')';
    detailEl.textContent = 'Sender role: ' + senderRole + ' | Last sync: ' + new Date(roomState.updatedAtMs).toLocaleTimeString();

    clearNode(roomBoardEl);
    appendMetaRow(roomBoardEl, 'Room: ' + roomState.roomCode + ' (' + roomState.roomMode + ')');
    appendMetaRow(roomBoardEl, 'Sender Role: ' + senderRole);
    appendMetaRow(roomBoardEl, 'Updated: ' + new Date(roomState.updatedAtMs).toLocaleTimeString());
    appendMetaRow(roomBoardEl, 'Mode: ' + (state.roomMode === 'ai' ? 'Solo vs AI' : 'PvP'));
  }

  function renderGameState(state) {
    var publicState = state.publicState;

    setActivePlayer(publicState.currentPlayer);
    renderPlayerStats(player1StatsEl, publicState.players[0]);
    renderPlayerStats(player2StatsEl, publicState.players[1]);
    renderMarket(player1MarketEl, publicState.players[0].market);
    renderMarket(player2MarketEl, publicState.players[1].market);
    renderUtilities(player1UtilitiesEl, publicState.players[0].utilities);
    renderUtilities(player2UtilitiesEl, publicState.players[1].utilities);

    var waitingInfo = getWaitingInfo(publicState);
    player1WaitingEl.textContent = waitingInfo.targetPlayer === 0 ? waitingInfo.message : '';
    player2WaitingEl.textContent = waitingInfo.targetPlayer === 1 ? waitingInfo.message : '';

    renderCenterChips(centerChipsEl, publicState);
    renderSupply(supplyEl, publicState.wareSupply);
    renderDeckDiscard(publicState);
    renderEndgame(publicState);
    renderGameLog(publicState);
  }

  function renderRoom() {
    if (!roomState.roomCode) {
      placeholderEl.className = 'placeholder';
      screenEl.className = 'screen';
      roomEl.textContent = 'No room synced yet.';
      detailEl.textContent = '';
      if (roomBoardEl) clearNode(roomBoardEl);
      return;
    }

    if (!publicRoomSnapshot || !publicRoomSnapshot.publicState) {
      placeholderEl.className = 'placeholder';
      screenEl.className = 'screen';
      renderRoomMeta({ roomMode: roomState.roomMode });
      detailEl.textContent = 'Waiting for room state...';
      return;
    }

    placeholderEl.className = 'placeholder hidden';
    screenEl.className = 'screen visible';

    renderRoomMeta(publicRoomSnapshot);
    renderGameState(publicRoomSnapshot);
  }

  function clearPollTimer() {
    if (pollTimer !== null) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  async function pollPublicRoomState() {
    if (!roomState.roomCode || !roomState.apiBaseUrl) {
      return;
    }

    var endpoint = roomState.apiBaseUrl.replace(/\/+$/, '') +
      '/api/cast/public-room?code=' + encodeURIComponent(roomState.roomCode) +
      '&token=' + encodeURIComponent(roomState.castAccessToken);
    try {
      var response = await fetch(endpoint, {
        method: 'GET',
        cache: 'no-store',
      });
      if (!response.ok) {
        setConnection('Receiver state: polling failed (' + String(response.status) + ')', true);
        return;
      }
      try {
        publicRoomSnapshot = await response.json();
      } catch {
        setConnection('Receiver state: polling response parse error', true);
        return;
      }
      setConnection('Receiver state: ready', false);
      renderRoom();
    } catch {
      setConnection('Receiver state: polling failed', true);
    }
  }

  function restartPolling() {
    clearPollTimer();
    if (!roomState.roomCode || !roomState.apiBaseUrl || !roomState.castAccessToken) {
      renderRoom();
      return;
    }
    void pollPublicRoomState();
    pollTimer = setInterval(function () {
      void pollPublicRoomState();
    }, 1500);
  }

  function closeStreamSource() {
    if (streamSource !== null) {
      streamSource.close();
      streamSource = null;
    }
  }

  function clearStreamRetryTimer() {
    if (streamRetryTimer !== null) {
      clearTimeout(streamRetryTimer);
      streamRetryTimer = null;
    }
  }

  function restartStream() {
    closeStreamSource();
    clearStreamRetryTimer();
    if (!roomState.roomCode || !roomState.apiBaseUrl || !roomState.castAccessToken) {
      return;
    }

    var endpoint = roomState.apiBaseUrl.replace(/\/+$/, '') +
      '/api/cast/stream-room?code=' + encodeURIComponent(roomState.roomCode) +
      '&token=' + encodeURIComponent(roomState.castAccessToken);

    try {
      setConnection('Receiver state: connecting stream...', false);
      streamSource = new EventSource(endpoint);
      streamSource.addEventListener('room', function (event) {
        try {
          publicRoomSnapshot = JSON.parse(event.data);
          setConnection('Receiver state: ready (stream)', false);
          renderRoom();
        } catch {
          setConnection('Receiver state: stream payload parse failed', true);
        }
      });
      streamSource.addEventListener('room_deleted', function () {
        stopTvMusic();
        publicRoomSnapshot = null;
        renderRoom();
        setConnection('Receiver state: room deleted', true);
      });
      streamSource.onerror = function () {
        closeStreamSource();
        setConnection('Receiver state: stream disconnected; using polling fallback', true);
        restartPolling();
        clearStreamRetryTimer();
        streamRetryTimer = setTimeout(function () {
          clearPollTimer();
          restartStream();
        }, 4000);
      };
    } catch {
      setConnection('Receiver state: stream unavailable; using polling fallback', true);
      restartPolling();
    }
  }

  function restartRealtimeSync() {
    clearPollTimer();
    closeStreamSource();
    clearStreamRetryTimer();
    publicRoomSnapshot = null;
    if (!roomState.roomCode || !roomState.apiBaseUrl || !roomState.castAccessToken) {
      stopTvMusic();
      renderRoom();
      return;
    }
    ensureTvMusicPlaying();
    if (typeof EventSource === 'function') {
      restartStream();
      return;
    }
    restartPolling();
  }

  function sendToSender(senderId, payload) {
    var context = cast.framework.CastReceiverContext.getInstance();
    // Pass the object directly — the CAF SDK handles JSON serialization.
    // Wrapping in JSON.stringify would cause double-serialization on the sender side.
    context.sendCustomMessage(NAMESPACE, senderId, payload);
  }

  function sendSynced(senderId, roomCode) {
    sendToSender(senderId, {
      type: 'RECEIVER_ROOM_SYNCED',
      roomCode: roomCode,
      timestampMs: Date.now(),
    });
  }

  function sendError(senderId, code, message) {
    sendToSender(senderId, {
      type: 'RECEIVER_ERROR',
      code: code,
      message: message,
    });
  }

  function handleCustomMessage(event) {
    var senderId = event.senderId;
    var rawData = event.data;
    var payload;

    // CAF receiver SDK auto-parses JSON strings, so event.data may already be
    // an object. Handle both cases defensively.
    if (typeof rawData === 'object' && rawData !== null) {
      payload = rawData;
    } else {
      try {
        payload = JSON.parse(rawData);
      } catch {
        sendError(senderId, 'INVALID_PAYLOAD', 'Payload is not valid JSON.');
        return;
      }
    }

    if (!payload || typeof payload !== 'object' || typeof payload.type !== 'string') {
      sendError(senderId, 'INVALID_PAYLOAD', 'Payload shape is invalid.');
      return;
    }

    if (payload.type === 'TOGGLE_DEBUG') {
      var overlay = document.getElementById('debugOverlay');
      if (overlay) {
        var isVisible = overlay.classList.toggle('visible');
        // Enable log capture even if ?debug wasn't in the URL
        if (isVisible && !window.__debugEnabled) {
          window.__debugEnabled = true;
          window.dispatchEvent(new CustomEvent('enable-debug'));
        }
        console.log('[Debug] Overlay toggled:', isVisible ? 'ON' : 'OFF');
        sendToSender(senderId, {
          type: 'RECEIVER_DEBUG_TOGGLED',
          enabled: isVisible,
          timestampMs: Date.now(),
        });
      }
      return;
    }

    if (payload.type !== 'SYNC_ROOM') {
      sendError(senderId, 'INVALID_PAYLOAD', 'Unknown message type: ' + String(payload.type));
      return;
    }

    if (typeof payload.roomCode !== 'string' || payload.roomCode.length === 0) {
      sendError(senderId, 'INVALID_PAYLOAD', 'Missing or invalid roomCode.');
      return;
    }
    if (payload.roomMode !== 'ai' && payload.roomMode !== 'pvp') {
      sendError(senderId, 'INVALID_PAYLOAD', 'roomMode must be ai or pvp.');
      return;
    }
    if (!(payload.senderPlayerSlot === null || payload.senderPlayerSlot === 0 || payload.senderPlayerSlot === 1)) {
      sendError(senderId, 'INVALID_PAYLOAD', 'senderPlayerSlot must be null, 0, or 1.');
      return;
    }
    if (payload.apiBaseUrl !== undefined && typeof payload.apiBaseUrl !== 'string') {
      sendError(senderId, 'INVALID_PAYLOAD', 'apiBaseUrl must be a string when provided.');
      return;
    }
    if (typeof payload.castAccessToken !== 'string' || payload.castAccessToken.length < 8) {
      sendError(senderId, 'INVALID_PAYLOAD', 'Missing or invalid castAccessToken.');
      return;
    }

    roomState.roomCode = payload.roomCode;
    roomState.roomMode = payload.roomMode;
    roomState.senderPlayerSlot = payload.senderPlayerSlot;
    roomState.apiBaseUrl = payload.apiBaseUrl || null;
    roomState.castAccessToken = payload.castAccessToken;
    roomState.updatedAtMs = Date.now();
    restartRealtimeSync();
    renderRoom();
    sendSynced(senderId, payload.roomCode);
  }

  function main() {
    var context = cast.framework.CastReceiverContext.getInstance();
    var playerManager = context.getPlayerManager();

    // Register the dedicated <audio> element with CAF's PlayerManager
    var bgMusicEl = document.getElementById('bgMusic');
    if (bgMusicEl) {
      playerManager.setMediaElement(bgMusicEl);
    }
    cafPlayerManager = playerManager;

    // When a track finishes naturally, advance to the next one
    playerManager.addEventListener(
      cast.framework.events.EventType.MEDIA_FINISHED,
      function () {
        if (tvMusic.enabled) {
          console.log('[TV Music] Track ended, next one after the gap');
          if (tvMusic.gapTimer !== null) clearTimeout(tvMusic.gapTimer);
          tvMusic.gapTimer = setTimeout(function () {
            tvMusic.gapTimer = null;
            if (tvMusic.enabled) playNextTvTrack();
          }, TV_TRACK_GAP_MS);
        }
      }
    );

    playerManager.setMessageInterceptor(
      cast.framework.messages.MessageType.LOAD,
      function (loadRequestData) {
        // Ensure background music volume after CAF processes the load
        setTimeout(function () {
          if (bgMusicEl) bgMusicEl.volume = 0.15;
        }, 100);
        return loadRequestData;
      }
    );
    context.addCustomMessageListener(NAMESPACE, handleCustomMessage);
    context.addEventListener(
      cast.framework.system.EventType.SENDER_DISCONNECTED,
      function () {
        if (context.getSenders().length === 0) {
          console.log('All senders disconnected, receiver staying alive');
        }
      }
    );
    context.start({ disableIdleTimeout: true, maxInactivity: 120 });
    setConnection('Receiver state: ready', false);
    renderRoom();
  }

  main();
})();
