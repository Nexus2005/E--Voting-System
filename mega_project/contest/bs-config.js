var express = require('express');
var app = express();
const ejs = require("ejs");
// app.use(express.static('public'));
app.use(express.urlencoded());
var session = require('express-session');
var bodyParser = require('body-parser'); 
app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());

// fetching table
var path = require('path');
app.set('views', path.join(__dirname, '/src/views'));
app.set('view engine', 'ejs');


app.use(express.static('src'));
// app.use('/css',express.static(__dirname + 'src/css'))

// web-portion --------------------------------->
app.use(session({ 
    secret: '123456cat',
    resave: false,
    saveUninitialized: true,
    cookie: { maxAge: 60000*300 }
}))

var FirstPage = require('./routes/first_page');
var registrationRouter = require('./routes/registration-route');
var loginRouter = require('./routes/login-route');
var dashboardRouter = require('./routes/dashboard-route');
var logoutRouter = require('./routes/logout-route');
var RegisterRouter = require('./routes/main');
var AdminLogin = require('./routes/admin_login');
var Tableview =  require('./routes/table_view');

app.use('/', registrationRouter);
app.use('/', loginRouter);
app.use('/', dashboardRouter);
app.use('/', logoutRouter);
app.use('/',RegisterRouter);
// app.use('/',FirstPage);
app.use('/',AdminLogin);
app.use('/',Tableview);
// web-portion --------------------------------->


app.get('/vote_area', function (req, res) {
   res.sendFile( __dirname  + "/src/vote_area.html" );
})

// --- Admin pages: require an authenticated admin session ---
function requireAdmin(req, res, next) {
  if (req.session && req.session.loggedinUser) {
    next();
  } else {
    res.redirect('/adlogin');
  }
}

app.get('/candidateDetails', requireAdmin, function (req, res) {
  res.sendFile( __dirname  + "/src/adminCandidateDetails.html" );
})

app.get('/userInfo', function (req, res) {
  res.sendFile( __dirname  + "/src/userInfo.html" );
})

app.get('/result', function (req, res) {
  res.sendFile( __dirname  + "/src/result.html" );
})

app.get('/addCandidate', requireAdmin, function (req, res) {
  res.sendFile( __dirname  + "/src/adminAddCandidate.html" );
})

app.get('/adminResults', requireAdmin, function (req, res) {
  res.sendFile( __dirname  + "/src/adminResults.html" );
})

app.get('/changePhase', requireAdmin, function (req, res) {
  res.sendFile( __dirname  + "/src/adminChangePhase.html" );
})

app.get('/voting', function (req, res) {
  res.sendFile( __dirname  + "/src/voting.html" );
})

// API: registered-voter count for turnout/statistics (no vote-choice linkage)
app.get('/api/adminStats', function (req, res) {
  var conn = require('./database');
  conn.query('SELECT COUNT(*) AS cnt FROM registered_users', [], function (err, data) {
    if (err) {
      console.error('adminStats query error:', err.message);
      return res.json({ registeredVoters: 0, dbError: true });
    }
    var rows = Array.isArray(data) ? data : (data && data.rows) || [];
    var count = rows.length ? (rows[0].cnt || rows[0].CNT || rows[0].count || 0) : 0;
    res.json({ registeredVoters: parseInt(count, 10) || 0 });
  });
});


app.get('/hello', function (req, res) {
   res.send('hello');
})

module.exports = {
  "server": {
    "baseDir": ["./src", "./build/contracts"],
    "routes": {
      "/node_modules": "node_modules"
    },
    middleware: {
      1: app,
  },
},
port:3000,
};