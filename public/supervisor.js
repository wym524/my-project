// supervisor.js — 学生端摄像头实时推送（仅内存中转，不保存任何内容）
(function () {
  // 非管理员且登录页勾选了「开启监督模式」时才启用
  if (localStorage.getItem('supervisor_mode') !== '1') return;
  const username = localStorage.getItem('supervisor_username') || 'unknown';

  // 全局状态
  let ws = null;
  let stream = null;
  let videoEl = null;
  let canvasEl = null;
  let captureTimer = null;
  let reconnectTimer = null;
  let online = false;

  // UI：右上角红色指示灯 + 设置按钮
  function initUI() {
    if (document.getElementById('supervisorIndicator')) return;
    const wrap = document.createElement('div');
    wrap.id = 'supervisorIndicator';
    wrap.innerHTML =
      '<div id="svCamDot" class="sv-dot" title="摄像头开启中，实时上传画面"></div>' +
      '<span id="svCamText" class="sv-text">摄像头开启中</span>';
    wrap.style.cssText =
      'position:fixed;top:12px;right:12px;z-index:999999;display:flex;align-items:center;gap:8px;' +
      'background:rgba(0,0,0,0.65);color:#fff;padding:6px 12px;border-radius:18px;font-size:12px;line-height:1;';
    document.body.appendChild(wrap);

    // 注入样式（动画呼吸红点）
    if (!document.getElementById('svStyle')) {
      const s = document.createElement('style');
      s.id = 'svStyle';
      s.textContent =
        '.sv-dot{width:8px;height:8px;background:#ef4444;border-radius:50%;' +
        'box-shadow:0 0 0 0 rgba(239,68,68,0.7);animation:sv-pulse 1.4s infinite;}' +
        '@keyframes sv-pulse{0%{box-shadow:0 0 0 0 rgba(239,68,68,0.7);}' +
        '70%{box-shadow:0 0 0 10px rgba(239,68,68,0);}100%{box-shadow:0 0 0 0 rgba(239,68,68,0);}}';
      document.head.appendChild(s);
    }
  }

  function setStatus(text, show) {
    if (!document.getElementById('supervisorIndicator')) return;
    document.getElementById('supervisorIndicator').style.display = show ? 'flex' : 'none';
    const t = document.getElementById('svCamText');
    if (t && text) t.textContent = text;
  }

  // 连接 WebSocket
  function connectWS() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = `${proto}://${location.host}/?role=student&u=${encodeURIComponent(username)}`;
    try { ws = new WebSocket(url); } catch (e) { return; }

    ws.onopen = () => { online = true; setStatus('摄像头开启中', true); startCapture(); };
    ws.onclose = () => { online = false; stopCapture(); scheduleReconnect(); };
    ws.onerror = () => { try { ws.close(); } catch (e) {} };
  }

  function scheduleReconnect() {
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => { reconnectTimer = null; connectWS(); }, 2000);
  }

  // 打开摄像头并定时抓帧
  function startCapture() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus('浏览器不支持摄像头', true);
      return;
    }

    navigator.mediaDevices.getUserMedia({
      video: { width: 320, height: 240, facingMode: 'user' },
      audio: false,
    }).then(function (s) {
      stream = s;
      videoEl = document.createElement('video');
      videoEl.autoplay = true;
      videoEl.muted = true;
      videoEl.playsInline = true;
      videoEl.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;';
      videoEl.srcObject = stream;
      document.body.appendChild(videoEl);

      canvasEl = document.createElement('canvas');
      canvasEl.width = 320;
      canvasEl.height = 240;

      videoEl.onloadedmetadata = function () {
        videoEl.play().catch(() => {});
        // 每 300ms 抓一帧上传（约 3 帧/秒，实时够用且流量可控）
        if (captureTimer) clearInterval(captureTimer);
        captureTimer = setInterval(captureAndSend, 300);
      };
    }).catch(function (err) {
      setStatus('未授权摄像头', true);
    });
  }

  function stopCapture() {
    if (captureTimer) { clearInterval(captureTimer); captureTimer = null; }
    if (stream) { try { stream.getTracks().forEach(function (t) { t.stop(); }); } catch (e) {} stream = null; }
    if (videoEl) { try { videoEl.parentNode.removeChild(videoEl); } catch (e) {} videoEl = null; }
    if (canvasEl) canvasEl = null;
  }

  function captureAndSend() {
    if (!online || !ws || ws.readyState !== 1 || !videoEl || !canvasEl) return;
    try {
      const ctx = canvasEl.getContext('2d');
      ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);
      const dataUrl = canvasEl.toDataURL('image/jpeg', 0.5); // 低质量 JPEG 省流量
      ws.send(JSON.stringify({ type: 'frame', frame: dataUrl }));
    } catch (e) {}
  }

  // 页面关闭时释放资源
  window.addEventListener('beforeunload', function () {
    stopCapture();
    if (ws) { try { ws.close(); } catch (e) {} ws = null; }
  });

  // DOM 就绪后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUI);
  } else {
    initUI();
  }
  connectWS();
})();
