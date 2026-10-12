var express = require('express');

var router = express.Router();
var db=require('../database');
var app = express();
app.use(express.static('public'))
app.use('/css',express.static(__dirname + 'public/css'))
/* GET users listing. */
router.get('/login', function(req, res, next) {
  res.render('login-form.ejs');
});

router.post('/login', function(req, res){
    var emailAddress = (req.body.email_address || '').trim().toLowerCase();
    var password = (req.body.password || '').trim();

    if (!emailAddress || !password) {
        return res.render('login-form.ejs', { alertMsg: "Please enter your Email Address and Password." });
    }

    var sql = 'SELECT * FROM registration WHERE LOWER(email_address) = LOWER(?) AND password = ?';
    db.query(sql, [emailAddress, password], function (err, data) {
        if(err) {
            console.error("Login query error:", err.message);
            return res.render('login-form.ejs', { alertMsg: "Database error occurred, please try again." });
        }
        if(data && data.length > 0){
            req.session.loggedinUser = true;
            req.session.emailAddress = data[0].email_address || emailAddress;
            console.log("✓ User successfully logged in:", emailAddress);
            res.redirect('/userInfo');
        }else{
            res.render('login-form.ejs', { alertMsg: "Incorrect Email Address or password." });
        }
    });
});

module.exports = router;

