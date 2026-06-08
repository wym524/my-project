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
        '<div style="padding:60px 20px;text-align:center;color:#64748b;background:#f8fafc;border-radius:12px;">' +
        '<div style="font-size:48px;margin-bottom:12px;">📷</div>' +
        '<div style="font-size:15px;margin-bottom:6px;">暂无开启摄像头的学生</div>' +
        '<div style="font-size:13px;color:#94a3b8;">学生在软件中登录后，其摄像头画面会自动出现在这里</div>' +
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
        '</div>' +
        '</div>';
    }
    html += '</div>';
    container.innerHTML = html;
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

  function connectWS() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    let username = 'admin';
    const m = document.cookie.match(/session_user=([^;]+)/);
    if (m) username = decodeURIComponent(m[1]);
    const url = proto + '://' + location.host + '/?role=admin&u=' + encodeURIComponent(username);
    try { ws = new WebSocket(url); } catch (e) { return; }

    ws.onopen = function () { render(); };
    ws.onclose = function () { frames.clear(); render(); setTimeout(connectWS, 2000); };
    ws.onerror = function () { try { ws.close(); } catch (e) {} };
    ws.onmessage = function (evt) {
      try {
        const msg = JSON.parse(evt.data);
        if (msg.type === 'frames') {
          for (const item of msg.data) frames.set(item.username, { frame: item.frame, ts: item.ts });
          const now = Date.now();
          for (const [u, info] of frames.entries()) {
            if (now - info.ts > 8000) frames.delete(u);
          }
          updateImages();
        } else if (msg.type === 'offline') {
          frames.delete(msg.username);
          updateImages();
        }
      } catch (e) {}
    };
  }

  render();
  connectWS();
})();
