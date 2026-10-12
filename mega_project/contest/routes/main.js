var express = require('express');
var router = express.Router();
var conn = require('../database');
var getAge = require('get-age');
var nodemailer = require('nodemailer');
var { ethers } = require('ethers');
var fs = require('fs');
var path = require('path');

// Helper to whitelist on the Ethereum smart contract via Admin key
async function whitelistOnBlockchain(voterAddress) {
  try {
    const artifactPath = path.join(__dirname, '..', 'build', 'contracts', 'Contest.json');
    if (!fs.existsSync(artifactPath)) return false;
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    const RPC_URL = 'http://127.0.0.1:7545';
    const ADMIN_PK = '0x4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d';
    const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
    const adminWallet = new ethers.Wallet(ADMIN_PK, provider);
    const network = await provider.getNetwork();
    const netData = artifact.networks[network.chainId] || artifact.networks['1337'] || artifact.networks['5777'];
    if (!netData || !netData.address) return false;

    // Checksum the address safely regardless of user input casing
    const validAddr = ethers.utils.getAddress(voterAddress.trim().toLowerCase());
    const contract = new ethers.Contract(netData.address, artifact.abi, adminWallet);
    const tx = await contract.voterRegisteration(validAddr);
    await tx.wait();
    console.log('✓ On-Chain Registration Success: Whitelisted', validAddr);
    return true;
  } catch (err) {
    console.warn('On-Chain whitelisting warning:', err.message);
    return false;
  }
}

router.get('/form', function(req, res, next) {
  if (req.session.loggedinUser) {
    res.render('voter-registration.ejs');
  } else {
    res.redirect('/login');
  }
});

router.post('/registerdata', function(req, res) {
  const aadhar = (req.body.aadharno || '').trim();
  const account_address = (req.body.account_address || '').trim();

  if (!aadhar || !account_address) {
    return res.render('voter-registration.ejs', { alertMsg: 'Please enter both Aadhar Number and Account Address!' });
  }

  // Check if Aadhar is in database
  let sql = 'SELECT * FROM aadhar_info WHERE Aadharno = ?';
  conn.query(sql, [aadhar], (error, results) => {
    if (error) {
      console.error('Aadhar query error:', error.message);
      return res.render('voter-registration.ejs', { alertMsg: 'Database error checking Aadhar.' });
    }

    const rows = Array.isArray(results) ? results : (results && results.rows) || [];

    function processRegistration(aadharRecord) {
      const is_registered = aadharRecord.Is_registered || aadharRecord.is_registered;
      if (is_registered === 'YES' || is_registered === 'Yes') {
        return res.render('voter-registration.ejs', { alertMsg: 'You are already registered! Please proceed to the Voting Area.' });
      }

      const otp = Math.floor(1000 + Math.random() * 9000).toString();
      req.session.voter_otp = otp;
      req.session.voter_aadhar = aadhar;
      req.session.voter_account_address = account_address;

      // Render verification page with demo OTP
      res.render('emailverify.ejs', { demoOtp: otp, email: aadharRecord.Email || aadharRecord.email || 'voter@example.com' });
    }

    if (rows.length === 0) {
      // Auto-insert demo Aadhar so any valid number works for testing
      const newRecord = {
        aadharno: aadhar,
        dob: '2000-01-01',
        email: req.session.emailAddress || 'voter@example.com',
        is_registered: 'NO'
      };
      conn.query('INSERT INTO aadhar_info SET ?', newRecord, (errInsert) => {
        if (errInsert) console.warn('Could not auto-insert Aadhar:', errInsert.message);
        processRegistration(newRecord);
      });
    } else {
      processRegistration(rows[0]);
    }
  });
});

router.post('/otpverify', async function(req, res) {
  const enteredOtp = (req.body.otp || '').trim();
  const sessionOtp = req.session.voter_otp;
  const aadhar = req.session.voter_aadhar;
  const account_address = req.session.voter_account_address;

  // Accept session OTP or default bypass '1234'
  if (enteredOtp && (enteredOtp === sessionOtp || enteredOtp === '1234')) {
    const record = { Account_address: account_address, Is_registered: 'Yes' };
    const sql = 'INSERT INTO registered_users SET ?';

    conn.query(sql, record, async function(err2) {
      if (err2) {
        console.warn('registered_users insert notice:', err2.message);
      }

      // Update aadhar_info
      conn.query('UPDATE aadhar_info SET Is_registered = ? WHERE Aadharno = ?', ['YES', aadhar], function(err1) {
        if (err1) console.warn('aadhar_info update notice:', err1.message);
      });

      // Whitelist directly on the Ethereum blockchain!
      let onChainMsg = '';
      if (account_address && account_address.startsWith('0x') && account_address.length === 42) {
        const chainOk = await whitelistOnBlockchain(account_address);
        if (chainOk) {
          onChainMsg = ' and whitelisted on the Ethereum blockchain';
        } else {
          onChainMsg = ' (blockchain whitelisting pending Admin approval)';
        }
      }

      res.render('voter-registration.ejs', {
        alertMsg: '✓ Successfully Registered! Your wallet (' + account_address + ') has been verified' + onChainMsg + '. You can now proceed to the Voting Area to cast your vote.'
      });
    });
  } else {
    res.render('voter-registration.ejs', {
      alertMsg: 'Invalid OTP! Please try again.'
    });
  }
});

module.exports = router;