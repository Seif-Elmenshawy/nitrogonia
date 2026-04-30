const express = require('express');
const fs = require('fs');
const bodyParser = require('body-parser');
const path = require('path');
const cors = require('cors');
const { db } = require('./firebase');
const admin = require('firebase-admin');
const { log, timeStamp } = require('console');
const { render } = require('ejs');
const { Timestamp } = require('firebase-admin/firestore');

const tempData = JSON.parse(fs.readFileSync(path.join(__dirname, '..','data', 'tempData.json'), 'utf8'));
const levelData = JSON.parse(fs.readFileSync(path.join(__dirname, '..','data', 'levelData.json'), 'utf8'));
const moistureData = JSON.parse(fs.readFileSync(path.join(__dirname, '..','data', 'moistureData.json'), 'utf8'));

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors());
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));
app.use(express.static(path.join(__dirname, '../public')));

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  next();
});

let fanState
let solenoidState


app.get('/dashboard', async (req, res) => {
  const docId = req.query.docId;
  try {
    const snapshot = await db
      .collection('sensorData')
      .orderBy('timestamp', 'desc')
      .limit(20)
      .get();

    
    


    let lastUpdated = null;

    let firstTimestamp = null;

    snapshot.forEach(doc => {
      const data = doc.data();

      if (!data?.timestamp) return;

      let raw = data.timestamp;
      let t;

      if (!raw || typeof raw.toDate !== "function") return; // skip bad docs

      t = raw.toDate().getTime();
      if (!firstTimestamp) firstTimestamp = t;

      const secondsSinceStart = Math.round((t - firstTimestamp) / 1000);




      if (!lastUpdated) {
        lastUpdated = getTimeAgo(t);
      }
    });


    console.log("DOC COUNT:", snapshot.size);
    console.log("FIRST DOC:", snapshot.docs[0]?.data());
    console.log("TEMP DATA:", tempData.length);
    res.render('dashboard.ejs', {
        tempData: tempData,
        levelData: levelData,
        moistureData: moistureData,
        fanState,
        solenoidState,
        lastUpdated
    });
  } catch (error) {
    console.error('Error fetching data:', error);
    res.status(500).send('Internal Server Error');
  }
});

app.get('/api/sensor-data', async (req, res) => {
  try {
    const snapshot = await db
      .collection('sensorData')
      .orderBy('timestamp', 'desc')
      .limit(20)
      .get();
    const state = await db.collection('sensorData').orderBy('timestamp', 'desc').limit(1).get()
    
    const doc = state.docs[0];
    const data = doc.data();
    let fbfanState=data.fanState
    let fbsolenoidState = data.solenoidState
    console.log('fanstate', fanState)
    console.log('solenoidstate', solenoidState)

    let firstTimestamp = null;

    snapshot.forEach(doc => {
      const data = doc.data();

      if (!data?.timestamp) return;

      const t = data.timestamp.toDate().getTime();

      if (!firstTimestamp) firstTimestamp = t;

      const x = Math.round((t - firstTimestamp) / 1000);


      });
      res.json({
        tempData: tempData,
        levelData: levelData,
        moistureData: moistureData,
        fbfanState,     // Replace with actual fan state
        fbsolenoidState
    });


  } catch (err) {
    res.status(500).json({ error: "failed" });
  }
});

app.get('/add', async (req, res) => {
  const docId = req.query.docId;
  try {
    console.log(req.body);
    res.render('index', { docId });
  } catch (error) {
    console.error('Error fetching data:', error);
    res.status(500).send('Internal Server Error');
  }
});



app.post('/auth', async (req, res) => {

    try {
    const sensorCollection = db.collection('sensorData');

    const body = req.body;

    // support both formats (array or object)
    const data = Array.isArray(body) ? body[0] : body;

    const docRef = await sensorCollection.add({
      Temperature: +data.Temperature,
      "Soil Moisture": +data["Soil Moisture"],
      "Water Level": +data["Water Level"],
      timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log("Saved:", docRef.id);
    res.status(200).json({ message: "Hacker Registered Succefully" });
  } catch (error) {
    console.error('Error fetching data:', error);
    res.status(500).json({ message: 'Failed to registered', error: error.message });
  }
});

function getTimeAgo(timestamp) {
  const now = Date.now();
  const difference = now - timestamp + 2 * 60 * 60 * 1000;

  const seconds = Math.floor(difference / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const weeks = Math.floor(days / 7);
  const months = Math.floor(days / 30);

  if (seconds < 60) return `${seconds} seconds ago`;
  if (minutes < 60) return `${minutes} minutes ago`;
  if (hours < 24) return `${hours} hours ago`;
  if (days < 7) return `${days} days ago`;
  if (weeks < 4) return `${weeks} weeks ago`;
  return `${months} months ago`;
}

app.post('/toggle-filter', async (req, res) => {
  const username = req.body.docId;
  const newFilterStatus = req.body.filterOn === 'true';
  try {
    await db.collection('readings').doc(username).update({
      filterOn: admin.firestore.FieldValue.increment(1)
    }, { merge: true });
    res.json({ success: true, filterOn: newFilterStatus });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Server Error' });
  }
});


app.get('/toggle', async (req,res) => {
      const snapshot = await db
      .collection('sensorData')
      .orderBy('timestamp', 'desc')
      .limit(1)
      .get();    
    const doc = snapshot.docs[0];
    const data = doc.data();

    ledState=data.ledState

    res.render("toggle", {ledState})
})

// Add these endpoints to your server
app.get('/api/fan-state', (req, res) => {
    res.json({ fanState: fanState, solenoidState: solenoidState });
    console.log(fanState, solenoidState)
});

app.get('/api/solenoid-state', (req, res) => {
    res.json({ solenoidState: solenoidState });
});

app.post('/toggle-fans', (req, res) => {
    fanState = req.body.state;
    console.log("fan state from frontend", fanState)
    res.json({ success: true, fanState: fanState });
});

app.post('/toggle-solenoid', (req, res)=>{
    solenoidState = req.body.state;
    console.log("solenoid state from frontend", solenoidState)
    res.json({ success: true, solenoidState: solenoidState });
})

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});