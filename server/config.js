const path = require('path');

const DEFAULT_PORT = Number(process.env.PORT) || 3000;
const ROOT_DIR = process.cwd();
const JSON_DIR = path.join(ROOT_DIR, 'json');
const CONFIG_FILE = path.join(JSON_DIR, 'model-config.json');
const DATA_DIR = path.join(ROOT_DIR, 'data');
const TASKS_DIR = path.join(DATA_DIR, 'tasks');
const TASK_INDEX_FILE = path.join(TASKS_DIR, 'index.json');
const ASSETS_DIR = path.join(DATA_DIR, 'assets');
const IMAGES_DIR = path.join(ASSETS_DIR, 'images');
const ASSETS_INDEX_FILE = path.join(ASSETS_DIR, 'index.json');
const SEVEN_ZIP_EXE = path.join(ROOT_DIR, 'bin', '7za.exe');

module.exports = {
  DEFAULT_PORT,
  ROOT_DIR,
  JSON_DIR,
  CONFIG_FILE,
  DATA_DIR,
  TASKS_DIR,
  TASK_INDEX_FILE,
  ASSETS_DIR,
  IMAGES_DIR,
  ASSETS_INDEX_FILE,
  SEVEN_ZIP_EXE
};
