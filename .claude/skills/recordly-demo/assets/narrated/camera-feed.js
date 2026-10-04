// Test camera feed (video-only): getUserMedia returns a canvas stream showing the demo card, front or back.
// window.__cam.side = 'front' | 'back' switches what the "camera" sees. Same role as Chromium's fake capture device.
(() => {
  const FRONT = '__FRONT__', BACK = '__BACK__';
  const imgs = {}; for (const [k, src] of [['front', FRONT], ['back', BACK]]) { const i = new Image(); i.src = src; imgs[k] = i; }
  const cam = window.__cam = { side: 'front' };
  const draw = (ctx) => { const i = imgs[cam.side]; if (i && i.complete && i.naturalWidth) ctx.drawImage(i, 0, 0, 1920, 1080); };
  const md = navigator.mediaDevices || (navigator.mediaDevices = {});
  md.getUserMedia = async () => {
    const c = document.createElement('canvas'); c.width = 1920; c.height = 1080;
    const ctx = c.getContext('2d'); draw(ctx);
    setInterval(() => draw(ctx), 33);
    return c.captureStream(30);
  };
})();
