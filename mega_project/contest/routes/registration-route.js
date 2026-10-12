var express = require('express');
var router = express.Router();
var db=require('../database');
var app = express();
app.use(express.urlencoded());
app.set('view engine', 'ejs');
app.use(express.static('public'))
app.use('/css',express.static(__dirname + 'public/css'))

// to display registration form 
router.get('/register', function(req, res, next) {
  res.render('registration-form.ejs');
});


// to store user input detail on post request
router.post('/register', function(req, res, next) {
    const firstName = (req.body.first_name || '').trim();
    const email = (req.body.email_address || '').trim().toLowerCase();
    const password = (req.body.password || '').trim();
    const confirmPassword = (req.body.confirm_password || '').trim();

    if (!email || !password) {
        return res.render('registration-form.ejs', { alertMsg: "Please provide both an email and password." });
    }

    if (password !== confirmPassword) {
        return res.render('registration-form.ejs', { alertMsg: "Password & Confirm Password do not match." });
    }

    // check unique email address (case-insensitive)
    var sql = 'SELECT * FROM registration WHERE LOWER(email_address) = LOWER(?)';
    db.query(sql, [email], function (err, data) {
        if (err) {
            console.error("Registration query error:", err.message);
            return res.render('registration-form.ejs', { alertMsg: "Database error occurred, please try again." });
        }
        if (data && data.length > 0) {
            return res.render('registration-form.ejs', { 
                alertMsg: email + " already exists! Please click Login below." 
            });
        }

        const inputData = {
            first_name: firstName || email.split('@')[0],
            last_name: null,
            email_address: email,
            gender: null,
            password: password,
            confirm_password: password
        };

        // save users data into database
        var insertSql = 'INSERT INTO registration SET ?';
        db.query(insertSql, inputData, function (err2, data2) {
            if (err2) {
                console.error("Insert registration error:", err2.message);
                return res.render('registration-form.ejs', { alertMsg: "Registration failed: " + err2.message });
            }
            console.log("✓ User successfully registered:", email);
            return res.render('registration-form.ejs', { 
                alertMsg: "✓ You are successfully registered! You can now log in." 
            });
        });
    });
});
module.exports = router;

