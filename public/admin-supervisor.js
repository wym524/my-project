// admin-supervisor.js — 管理员端查看学生实时画面（纯内存，不保存任何内容）
(function () {
  const container = document.getElementById('adminLiveSupervisor');
  if (!container) return;

  let ws = null;
  const frames = new Map(); // username -> { frame, ts }

  function render() {
    const students = Array.from(frames.entries());
    if (students.length === 0) {
      container.innerHTML =
        '<div style="padding:40px 20px 30px;text-align:center;color:#64748b;background:#f8fafc;border-radius:12px;">' +
        '<div style="font-size:40px;margin-bottom:10px;">📷</div>' +
        '<div style="font-size:15px;margin-bottom:6px;">暂无开启摄像头的学生</div>' +
        '<div style="font-size:13px;color:#94a3b8;">学生在软件中登录并勾选监督模式后，其摄像头画面会自动出现在这里</div>' +
        '<div id="sv-admin-state" style="margin-top:16px;font-size:12px;color:#475569;">正在连接服务器...</div>' +
        '</div>';
      return;
    }

    let html =
      '<div style="margin-bottom:16px;color:#475569;font-size:14px;">📡 在线学生：' + students.length +
      ' 人 — 画面实时刷新，不保存任何内容</div>';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px;">';
    for (const [u, info] of students) {
      html +=
        '<div class="sv-card" data-sv-user="' + u + '" style="background:#fff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.05);">' +
        '<img class="sv-img" src="' + info.frame + '" style="width:100%;display:block;background:#0f172a;" />' +
        '<div style="padding:10px 14px;display:flex;justify-content:space-between;align-items:center;background:#f8fafc;border-top:1px solid #e2e8f0;">' +
        '<span style="font-weight:600;color:#0f172a;">👤 ' + u + '</span>' +
        '<span style="font-size:11px;color:#10b981;">● 实时</span>' +
        '</div></div>';
    }
    html += '</div>';
    container.innerHTML = html;
  }

  // 更新顶部状态文本
  function setState(text, color) {
    const el = document.getElementById('sv-admin-state');
    if (el) {
      el.textContent = text;
      if (color) el.style.color = color;
    }
  }

  // 只更新 img 的 src（避免 DOM 全量重建）
  function updateImages() {
    const students = Array.from(frames.entries());
    if (students.length === 0) { render(); return; }

    const existingUsers = new Set();
    const cards = container.querySelectorAll('.sv-card');
    let count = 0;
    cards.forEach(function (c) { count++; existingUsers.add(c.getAttribute('data-sv-user')); });

    // 如果学生数量或名单变化，则重绘
    if (count !== students.length) { render(); return; }
    for (const [u] of students) {
      if (!existingUsers.has(u)) { render(); return; }
    }

    // 只更新图片 src
    for (const [u, info] of students) {
      const img = container.querySelector('.sv-card[data-sv-user="' + u + '"] .sv-img');
      if (img) img.src = info.frame;
    }
  }

  // 每 5 秒清理超过 10 秒的旧帧
  setInterval(function () {
    const now = Date.now();
    let changed = false;
    for (const [u, info] of frames.entries()) {
      if (now - info.ts > 10000) { frames.delete(u); changed = true; }
    }
    if (changed) updateImages();
  }, 5000);

  function connectWS() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    let username = localStorage.getItem('supervisor_username') || localStorage.getItem('username') || 'admin';
    const url = proto + '://' + location.host + '/?role=admin&u=' + encodeURIComponent(username);
    try { ws = new WebSocket(url); } catch (e) {
      setState('无法建立 WebSocket 连接', '#ef4444'); return;
    }

    ws.onopen = function () { render(); setState('✓ 已连接服务器，等待学生上线...', '#10b981'); };
    ws.onclose = function () {
      frames.clear();
      render();
      setState('连接已断开，正在重连...', '#f59e0b');
      setTimeout(connectWS, 2000);
    };
    ws.onerror = function () {
      setState('连接出错，正在重连...', '#ef4444');
      try { ws.close(); } catch (e) {}
    };
    ws.onmessage = function (evt) {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'frames') {
          for (const item of msg.data) frames.set(item.username, { frame: item.frame, ts: item.ts });
          const now = Date.now();
          for (const [u, info] of frames.entries()) {
            if (now - info.ts > 10000) frames.delete(u);
          }
          updateImages();
        } else if (msg.type === 'offline') {
          frames.delete(msg.username);
          updateImages();
        }
      } catch (e) {}
    };
  }

  // 新学生上线的广播推送也要能实时加入
  // —— 服务器端每 300ms 会推一个学生的帧上来，在这里接收
  
  render();
  connectWS();
})();
