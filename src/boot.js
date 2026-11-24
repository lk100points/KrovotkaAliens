// Boot sequence for КРОВОТКИНСКАЯ.
// Loads the pinned Three.js version from multiple module CDNs so one failed host
// does not leave the player on an endless loading screen.
const cover = document.getElementById('loading-cover');
const caption = document.getElementById('loading-caption');
const line = document.getElementById('loading-line');
const help = document.getElementById('loading-help');
const retry = document.getElementById('loading-retry');

const ENGINE_SOURCES = [
  'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js',
  'https://unpkg.com/three@0.160.0/build/three.module.js',
  'https://esm.sh/three@0.160.0?bundle'
];

function importWithTimeout(url, timeoutMs = 9000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error(`Превышено время загрузки: ${new URL(url).host}`));
      }
    }, timeoutMs);

    import(url).then((module) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(module);
    }).catch((error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
  });
}

function showBootError(error, stage) {
  console.error('[КРОВОТКИНСКАЯ] Ошибка запуска:', error);
  if (cover) cover.classList.remove('done');
  if (caption) caption.textContent = stage === 'engine'
    ? 'НЕ УДАЛОСЬ ЗАГРУЗИТЬ 3D-ДВИЖОК'
    : 'ОШИБКА ЗАПУСКА ИГРЫ';
  if (line) line.classList.add('hidden');
  if (help) {
    const details = String(error?.message || error || 'Неизвестная ошибка').slice(0, 220);
    help.textContent = `${details}. Проверьте интернет и откройте игру через START_GAME.bat или http://localhost:8000.`;
    help.classList.remove('hidden');
  }
  if (retry) retry.classList.remove('hidden');
}

retry?.addEventListener('click', () => location.reload());

try {
  if (caption) caption.textContent = 'ЗАГРУЗКА 3D-ДВИЖКА';
  const attempts = ENGINE_SOURCES.map((url) => importWithTimeout(url, 10000).catch((error) => {
    console.warn('[КРОВОТКИНСКАЯ] Источник Three.js недоступен:', url, error);
    throw error;
  }));
  let THREE;
  try {
    // Race the mirrors: a blocked or slow CDN will not delay a working one.
    THREE = await Promise.any(attempts);
  } catch (errors) {
    const reasons = errors?.errors?.map((item) => item?.message).filter(Boolean).join(' | ');
    throw new Error(`Не удалось загрузить Three.js ни с одного CDN. ${reasons || 'Проверьте интернет-соединение.'}`);
  }

  window.__KROVOTKINSKAYA_THREE__ = THREE;
  if (caption) caption.textContent = 'СБОРКА ПРОСТРАНСТВА';
  await import('./main.js');
} catch (error) {
  showBootError(error, window.__KROVOTKINSKAYA_THREE__ ? 'game' : 'engine');
}
