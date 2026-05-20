const express = require('express');
const session = require('express-session');
const path    = require('path');
const { MongoClient } = require('mongodb');

const app  = express();
const PORT = process.env.PORT || 3000;
const USERNAME       = process.env.APP_USERNAME  || 'grady';
const PASSWORD       = process.env.APP_PASSWORD  || 'redriver';
const SESSION_SECRET = process.env.SESSION_SECRET || 'rr-change-this-secret';
const MONGODB_URI    = process.env.MONGODB_URI;

let dataCollection;
let memData = { meetings: [], tasks: [] };

async function connectDB() {
  if (!MONGODB_URI) { console.log('No MONGODB_URI — using in-memory storage'); return; }
  try {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db('redriver-hub');
    dataCollection = db.collection('appdata');
    const exists = await dataCollection.findOne({ _id: 'main' });
    if (!exists) await dataCollection.insertOne({ _id: 'main', meetings: [], tasks: [] });
    console.log('✅ Connected to MongoDB');
  } catch(e) { console.error('MongoDB connection failed:', e.message); }
}

async function readDB() {
  if (dataCollection) {
    const doc = await dataCollection.findOne({ _id: 'main' });
    return { meetings: doc?.meetings || [], tasks: doc?.tasks || [] };
  }
  return memData;
}

async function writeDB(data) {
  if (dataCollection) {
    await dataCollection.updateOne({ _id: 'main' }, { $set: { meetings: data.meetings, tasks: data.tasks } }, { upsert: true });
  } else {
    memData = data;
  }
}

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

app.get('/api/data', requireAuth, async (req, res) => {
  res.json(await readDB());
});

app.post('/api/data', requireAuth, async (req, res) => {
  try {
    const { meetings, tasks } = req.body;
    if (!Array.isArray(meetings) || !Array.isArray(tasks))
      return res.status(400).json({ error: 'Invalid data format.' });
    await writeDB({ meetings, tasks });
    res.json({ ok: true });
  } catch(e) {
    console.error('Save error:', e);
    res.status(500).json({ error: 'Failed to save data.' });
  }
});

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

connectDB().then(() => {
  app.listen(PORT, () => console.log(`Red River Meeting Hub running on port ${PORT}`));
});
