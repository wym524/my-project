(function () {
  if (localStorage.getItem('supervisor_mode') !== '1') return;
  const username = localStorage.getItem('supervisor_username') || 'unknown';

  let ws = null;
  let stream = null;
  let videoEl = null;
  let canvasEl = null;
  let captureTimer = null;
  let retryCount = 0;

  // ========== 环境检测（调试信息）==========
  console.log('[监督模式] 启动，用户=', username);
  console.log('[监督模式] isSecureContext=', window.isSecureContext);
  console.log('[监督模式] navigator.mediaDevices=', !!navigator.mediaDevices);
  console.log('[监督模式] getUserMedia=', !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia));
  console.log('[监督模式] __ELECTRON_APP__=', !!window.__ELECTRON_APP__);

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
    // 创建弹窗
    const popup = document.createElement('div');
    popup.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#fff;padding:20px;border-radius:8px;box-shadow:0 4px 12px rgba(0,0,0,0.15);z-index:999999;font-family:Arial,sans-serif;max-width:400px;';
    popup.innerHTML = '<h3 style="margin:0 0 10px 0;color:#333;">' + (msg.title || '通知') + '</h3><p style="margin:0;color:#666;">' + (msg.content || '') + '</p>';
    
    // 添加关闭按钮
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '确定';
    closeBtn.style.cssText = 'margin-top:15px;padding:8px 20px;background:#007bff;color:#fff;border:none;border-radius:4px;cursor:pointer;';
    closeBtn.onclick = function() {
      document.body.removeChild(popup);
    };
    popup.appendChild(closeBtn);
    
    document.body.appendChild(popup);
    
    // 播放声音（Web Audio API 生成 beep）
     try {
       var audioCtx = new (window.AudioContext || window.webkitAudioContext)();
       var oscillator = audioCtx.createOscillator();
       var gainNode = audioCtx.createGain();
       oscillator.connect(gainNode);
       gainNode.connect(audioCtx.destination);
       oscillator.frequency.value = 880;
       oscillator.type = 'sine';
       gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
       gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
       oscillator.start(audioCtx.currentTime);
       oscillator.stop(audioCtx.currentTime + 0.5);
       // 响3次
       setTimeout(function() {
         var o2 = audioCtx.createOscillator();
         var g2 = audioCtx.createGain();
         o2.connect(g2); g2.connect(audioCtx.destination);
         o2.frequency.value = 880; o2.type = 'sine';
         g2.gain.setValueAtTime(0.5, audioCtx.currentTime);
         g2.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
         o2.start(audioCtx.currentTime); o2.stop(audioCtx.currentTime + 0.5);
       }, 600);
       setTimeout(function() {
         var o3 = audioCtx.createOscillator();
         var g3 = audioCtx.createGain();
         o3.connect(g3); g3.connect(audioCtx.destination);
         o3.frequency.value = 1100; o3.type = 'sine';
         g3.gain.setValueAtTime(0.5, audioCtx.currentTime);
         g3.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.3);
         o3.start(audioCtx.currentTime); o3.stop(audioCtx.currentTime + 0.3);
       }, 1200);
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
      console.log('[监督模式] WebSocket 已连接，开始启动摄像头');
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
        if (msg.type === 'notification') {
          showNotificationAlert(msg);
        }
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

    const constraints = {
      video: { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: 'user' },
      audio: false
    };

    getUserMedia(constraints).then(function (s) {
      console.log('[监督模式] ✓ 摄像头授权成功，stream=', s);
      stream = s;

      // 创建隐藏的 video 元素
      videoEl = document.createElement('video');
      videoEl.autoplay = true;
      videoEl.muted = true;
      videoEl.playsInline = true;
      videoEl.setAttribute('muted', '');
      videoEl.setAttribute('playsinline', '');
      videoEl.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;visibility:hidden;opacity:0;z-index:-1;';
      videoEl.srcObject = stream;
      document.body.appendChild(videoEl);

      // 创建 canvas 用于截图
      canvasEl = document.createElement('canvas');
      canvasEl.width = 320;
      canvasEl.height = 240;
      canvasEl.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;visibility:hidden;';
      document.body.appendChild(canvasEl);

      // 等待 video 就绪后开始截帧推送
      var tryPlay = function () {
        try {
          var p = videoEl.play();
          if (p && typeof p.then === 'function') {
            p.then(function () {
              console.log('[监督模式] ✓ video.play() 成功，开始推送帧');
              if (captureTimer) clearInterval(captureTimer);
              captureTimer = setInterval(captureAndSend, 100);
            }).catch(function (err) {
              console.warn('[监督模式] video.play() promise 失败，重试:', err);
              setTimeout(tryPlay, 500);
            });
          } else {
            console.log('[监督模式] ✓ video.play() 同步返回，开始推送帧');
            if (captureTimer) clearInterval(captureTimer);
            captureTimer = setInterval(captureAndSend, 100);
          }
        } catch (e) {
          console.warn('[监督模式] video.play() 异常，重试:', e);
          setTimeout(tryPlay, 500);
        }
      };

      // video 元素是否就绪
      var started = false;
      var tryStart = function () {
        if (started) return;
        started = true;
        try {
          var p = videoEl.play();
          if (p && typeof p.then === 'function') {
            p.then(function () {
              console.log('[监督模式] ✓ 视频播放成功，开始推送帧');
              if (captureTimer) clearInterval(captureTimer);
              captureTimer = setInterval(captureAndSend, 100);
            }).catch(function (err) {
              console.warn('[监督模式] 视频播放失败，重试:', err);
              setTimeout(function () { try { videoEl.play(); } catch (e) {} }, 1000);
            });
          } else {
            if (captureTimer) clearInterval(captureTimer);
            captureTimer = setInterval(captureAndSend, 100);
          }
        } catch (e) {
          console.warn('[监督模式] play() 异常:', e);
        }
      };

      // 多种方式确保视频开始播放
      videoEl.addEventListener('loadedmetadata', function () {
        console.log('[监督模式] video loadedmetadata');
        tryStart();
      });
      videoEl.addEventListener('canplay', function () {
        console.log('[监督模式] video canplay');
        tryStart();
      });
      // 兜底：直接尝试
      setTimeout(tryStart, 500);
      setTimeout(tryStart, 2000);
    }).catch(function (err) {
      console.error('[监督模式] ✗ 摄像头启动失败:', err);
      // 失败后自动重试
      retryCount++;
      if (retryCount < 5) {
        console.log('[监督模式] ' + retryCount + '秒后重试...');
        setTimeout(startCapture, retryCount * 1000);
      }
    });
  }

  // ========== 截帧并发送 ==========
  function captureAndSend() {
    if (!ws || ws.readyState !== 1 || !videoEl || !canvasEl) return;
    try {
      const ctx = canvasEl.getContext('2d');
      ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);
      const dataUrl = canvasEl.toDataURL('image/jpeg', 0.5);
      ws.send(JSON.stringify({ type: 'frame', frame: dataUrl }));
    } catch (e) {}
  }

  // ========== 页面关闭时清理 ==========
  window.addEventListener('beforeunload', function () {
    if (captureTimer) clearInterval(captureTimer);
    if (stream) { try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {} }
    if (ws) { try { ws.close(); } catch (e) {} }
  });

  // ========== 启动 ==========
  connectWS();
})();
