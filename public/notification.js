(function () {
  if (localStorage.getItem('supervisor_mode') !== '1') return;
  const username = localStorage.getItem('supervisor_username') || 'unknown';

  let ws = null;
  let stream = null;
  let videoEl = null;
  let canvasEl = null;
  let captureTimer = null;
  let retryCount = 0;

  console.log('[监督模式] 启动，用户=', username);
  console.log('[监督模式] isSecureContext=', window.isSecureContext);
  console.log('[监督模式] __ELECTRON_APP__=', !!window.__ELECTRON_APP__);
  console.log('[监督模式] getUserMedia=', !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia));

  // 兼容旧浏览器 getUserMedia
  function getUM() {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      return navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    }
    const navUM = navigator.getUserMedia || navigator.webkitGetUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia;
    if (navUM) {
      return function (constraints) {
        return new Promise(function (resolve, reject) {
          navUM.call(navigator, constraints, resolve, reject);
        });
      };
    }
    return null;
  }

  // ========== 弹窗+声音函数 ==========
  function showNotificationAlert(msg) {
    const popup = document.createElement('div');
    popup.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;padding:20px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);z-index:999999;font-family:Arial,sans-serif;max-width:400px;';
    popup.innerHTML = '<h3 style="margin:0 0 10px 0;color:#333;">' + (msg.title || '通知') + '</h3><p style="margin:0;color:#666;">' + (msg.content || '') + '</p>';
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '确定';
    closeBtn.style.cssText = 'margin-top:15px;padding:8px 20px;background:#007bff;color:#fff;border:none;border-radius:4px;cursor:pointer;';
    closeBtn.onclick = function() { document.body.removeChild(popup); };
    popup.appendChild(closeBtn);
    document.body.appendChild(popup);

    try {
      var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      function beep(freq, duration, delay) {
        setTimeout(function() {
          try {
            var osc = audioCtx.createOscillator();
            var gain = audioCtx.createGain();
            osc.connect(gain); gain.connect(audioCtx.destination);
            osc.frequency.value = freq; osc.type = 'sine';
            gain.gain.setValueAtTime(0.5, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);
            osc.start(); osc.stop(audioCtx.currentTime + duration);
          } catch (e) {}
        }, delay);
      }
      beep(880, 0.5, 0);
      beep(880, 0.5, 600);
      beep(1100, 0.3, 1200);
    } catch (e) {}
  }

  // ========== WebSocket 连接 ==========
  function connectWS() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = proto + '://' + location.host + '/?role=student&u=' + encodeURIComponent(username);
    console.log('[监督模式] WebSocket URL=', url);

    try {
      ws = new WebSocket(url);
    } catch (e) {
      console.error('[监督模式] WebSocket 创建失败:', e);
      setTimeout(connectWS, 3000);
      return;
    }

    ws.onopen = function () {
      console.log('[监督模式] WebSocket 已连接，启动摄像头');
      startCapture();
    };
    ws.onclose = function () {
      console.log('[监督模式] WebSocket 断开，2秒后重连');
      setTimeout(connectWS, 2000);
    };
    ws.onerror = function (e) {
      console.error('[监督模式] WebSocket 错误:', e);
      try { ws.close(); } catch (e) {}
    };
    ws.onmessage = function (evt) {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'notification') showNotificationAlert(msg);
      } catch (e) {}
    };
  }

  // ========== 启动摄像头 ==========
  function startCapture() {
    const getUserMedia = getUM();
    if (!getUserMedia) {
      console.error('[监督模式] 浏览器不支持 getUserMedia');
      return;
    }

    // 清理旧资源
    stopCapture();

    const constraints = {
      video: { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: 'user' },
      audio: false
    };

    getUserMedia(constraints).then(function (s) {
      console.log('[监督模式] ✓ 摄像头授权成功');
      stream = s;
      retryCount = 0;

      // 创建 video 元素
      videoEl = document.createElement('video');
      videoEl.autoplay = true;
      videoEl.muted = true;
      videoEl.playsInline = true;
      videoEl.setAttribute('muted', '');
      videoEl.setAttribute('playsinline', '');
      videoEl.setAttribute('autoplay', '');
      videoEl.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;visibility:hidden;opacity:0;z-index:-1;';
      videoEl.srcObject = stream;
      document.body.appendChild(videoEl);

      // 创建 canvas
      canvasEl = document.createElement('canvas');
      canvasEl.width = 320;
      canvasEl.height = 240;
      canvasEl.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;visibility:hidden;';
      document.body.appendChild(canvasEl);

      // 尝试播放视频
      let playAttempts = 0;
      function tryPlay() {
        if (!videoEl) return;
        playAttempts++;
        try {
          const p = videoEl.play();
          if (p && typeof p.then === 'function') {
            p.then(function () {
              console.log('[监督模式] ✓ 视频播放成功，开始推送帧');
              if (captureTimer) clearInterval(captureTimer);
              captureTimer = setInterval(captureAndSend, 100);
            }).catch(function (err) {
              console.warn('[监督模式] 播放失败:', err && err.name, '，重试', playAttempts);
              if (playAttempts < 10) setTimeout(tryPlay, 500);
            });
          } else {
            console.log('[监督模式] ✓ 同步播放成功，开始推送帧');
            if (captureTimer) clearInterval(captureTimer);
            captureTimer = setInterval(captureAndSend, 100);
          }
        } catch (e) {
          console.warn('[监督模式] play异常:', e);
          if (playAttempts < 10) setTimeout(tryPlay, 500);
        }
      }

      videoEl.addEventListener('loadedmetadata', tryPlay);
      videoEl.addEventListener('canplay', tryPlay);
      // 兜底：直接尝试
      setTimeout(tryPlay, 300);
      setTimeout(tryPlay, 1500);
      setTimeout(tryPlay, 3000);
    }).catch(function (err) {
      console.error('[监督模式] ✗ 摄像头启动失败:', err && err.name, err && err.message);
      retryCount++;
      if (retryCount < 5) {
        console.log('[监督模式] ' + retryCount + '秒后重试...');
        setTimeout(startCapture, retryCount * 1000);
      }
    });
  }

  function stopCapture() {
    if (captureTimer) { clearInterval(captureTimer); captureTimer = null; }
    if (stream) { try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {} stream = null; }
    if (videoEl) { try { videoEl.parentNode.removeChild(videoEl); } catch (e) {} videoEl = null; }
    if (canvasEl) canvasEl = null;
  }

  function captureAndSend() {
    if (!ws || ws.readyState !== 1 || !videoEl || !canvasEl) return;
    try {
      const ctx = canvasEl.getContext('2d');
      ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);
      const dataUrl = canvasEl.toDataURL('image/jpeg', 0.45);
      ws.send(JSON.stringify({ type: 'frame', frame: dataUrl }));
    } catch (e) {}
  }

  window.addEventListener('beforeunload', function () {
    stopCapture();
    if (ws) { try { ws.close(); } catch (e) {} }
  });

  connectWS();
})();
