// preload.js：Electron 桌面 App 环境，直接把摄像头启动函数注入到页面
// contextIsolation=false 后，这里运行的代码和页面 JavaScript 在同一上下文，可以直接访问摄像头

(function () {
  // 标记当前为桌面 App 环境
  window.__ELECTRON_APP__ = true;

  // 在页面加载完成后，暴露一个摄像头 API 给页面脚本使用
  window.addEventListener('DOMContentLoaded', function () {
    window.__ELECTRON_CAMERA_READY__ = true;
  });
})();
