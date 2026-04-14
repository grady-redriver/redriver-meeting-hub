const express = require('express');
const session = require('express-session');
const path    = require('path');
const fs      = require('fs');

const app  = express();
const PORT = process.env.PORT || 3000;

const USERNAME       = process.env.APP_USERNAME  || 'grady';
const PASSWORD       = process.env.APP_PASSWORD  || 'redriver';
const SESSION_SECRET = process.env.SESSION_SECRET || 'rr-change-this-secret';

const DATA_DIR = path.join(__dirname, 'data');
const DB_PATH  = path.join(DATA_DIR, 'db.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(DB_PATH))  fs.writeFileSync(DB_PATH, JSON.stringify({ meetings: [], tasks: [] }, null, 2));

function readDB()      { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }
function writeDB(data) { fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2)); }

app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 7 * 24 * 60 * 60 * 1000, httpOnly: true, sameSite: 'lax' }
}));

function requireAuth(req, res, next) {
  if (req.session && req.session.authenticated) return next();
  return res.status(401).json({ error: 'Unauthorized' });
}

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === USERNAME && password === PASSWORD) {
    req.session.authenticated = true;
    return res.json({ ok: true });
  }
  return res.status(401).json({ error: 'Invalid username or password.' });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/me', (req, res) => {
  res.json({ authenticated: !!(req.session && req.session.authenticated) });
});

app.get('/api/data', requireAuth, (req, res) => {
  res.json(readDB());
});

app.post('/api/data', requireAuth, (req, res) => {
  try {
    const { meetings, tasks } = req.body;
    if (!Array.isArray(meetings) || !Array.isArray(tasks)) {
      return res.status(400).json({ error: 'Invalid data format.' });
    }
    writeDB({ meetings, tasks });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to save data.' });
  }
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Red River Meeting Hub running on port ${PORT}`);
});
