const fs = require('fs');
const path = require('path');
const os = require('os');

const CLAUDE_DIR = path.join(os.homedir(), '.claude');
const STORE_DIR = path.join(os.homedir(), '.claude-switch');
const PROFILES_DIR = path.join(STORE_DIR, 'profiles');
const META_FILE = path.join(STORE_DIR, 'meta.json');

const IS_MACOS = os.platform() === 'darwin';

// macOS: OAuth token 在 Keychain，不需要管理 credentials 文件
// Linux: OAuth token 在 ~/.claude/.credentials.json，必须纳入管理
const MANAGED_FILES = [
  { name: 'settings.json',    source: path.join(CLAUDE_DIR, 'settings.json') },
  { name: 'config.json',      source: path.join(CLAUDE_DIR, 'config.json') },
  { name: 'claude.json',      source: path.join(os.homedir(), '.claude.json') },
  ...(!IS_MACOS ? [
    { name: 'credentials.json', source: path.join(CLAUDE_DIR, '.credentials.json') },
  ] : []),
];

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function profileDir(name) {
  return path.join(PROFILES_DIR, name);
}

// ─── Meta ───

function loadMeta() {
  if (fs.existsSync(META_FILE)) {
    try { return JSON.parse(fs.readFileSync(META_FILE, 'utf8')); } catch {}
  }
  return { current: null };
}

function saveMeta(meta) {
  ensureDir(STORE_DIR);
  fs.writeFileSync(META_FILE, JSON.stringify(meta, null, 2));
}

// ─── Profile 操作 ───

function listProfiles() {
  ensureDir(PROFILES_DIR);
  try {
    return fs.readdirSync(PROFILES_DIR).filter(name => {
      return fs.statSync(path.join(PROFILES_DIR, name)).isDirectory();
    });
  } catch {
    return [];
  }
}

function profileExists(name) {
  return fs.existsSync(profileDir(name));
}

function copyFilePreserveMode(src, dest) {
  fs.copyFileSync(src, dest);
  try {
    const stat = fs.statSync(src);
    fs.chmodSync(dest, stat.mode);
  } catch {}
}

function saveProfile(name) {
  const dir = profileDir(name);
  ensureDir(dir);

  for (const file of MANAGED_FILES) {
    if (fs.existsSync(file.source)) {
      copyFilePreserveMode(file.source, path.join(dir, file.name));
    }
  }

  const meta = loadMeta();
  meta.current = name;
  saveMeta(meta);
}

function switchTo(name) {
  const dir = profileDir(name);
  if (!fs.existsSync(dir)) {
    throw new Error(`Profile "${name}" 不存在。使用 list 查看可用 profile`);
  }

  const meta = loadMeta();

  // 先把当前生效的配置回收到对应 profile，保留用户的临时修改
  if (meta.current && profileExists(meta.current) && meta.current !== name) {
    const currentDir = profileDir(meta.current);
    for (const file of MANAGED_FILES) {
      if (fs.existsSync(file.source)) {
        copyFilePreserveMode(file.source, path.join(currentDir, file.name));
      }
    }
  }

  // 再把目标 profile 的文件拷贝到生效位置
  for (const file of MANAGED_FILES) {
    const src = path.join(dir, file.name);
    if (fs.existsSync(src)) {
      copyFilePreserveMode(src, file.source);
    }
  }

  meta.current = name;
  saveMeta(meta);
}

function removeProfile(name) {
  const dir = profileDir(name);
  if (!fs.existsSync(dir)) {
    throw new Error(`Profile "${name}" 不存在`);
  }
  fs.rmSync(dir, { recursive: true });

  const meta = loadMeta();
  if (meta.current === name) {
    meta.current = null;
  }
  saveMeta(meta);
}

function getProfileFiles(name) {
  const dir = profileDir(name);
  if (!fs.existsSync(dir)) return null;

  const result = {};
  for (const file of MANAGED_FILES) {
    const filePath = path.join(dir, file.name);
    if (fs.existsSync(filePath)) {
      try { result[file.name] = JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { result[file.name] = null; }
    }
  }
  return result;
}

function getCurrentName() {
  return loadMeta().current;
}

module.exports = {
  MANAGED_FILES,
  IS_MACOS,
  CLAUDE_DIR,
  STORE_DIR,
  PROFILES_DIR,
  listProfiles,
  profileExists,
  saveProfile,
  switchTo,
  removeProfile,
  getProfileFiles,
  getCurrentName,
  profileDir,
};
