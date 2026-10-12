/*
 * E-Voting frontend — Web3 v1.x Contract API (no TruffleContract).
 * Talks directly to the deployed Contest contract via MetaMask or local Ganache.
 */
App = {
  web3: null,
  contract: null,
  ACCOUNT: null,
  CONTRACT_ADDRESS: null,
  _votePending: false,

  init: async function() {
    console.log('App initializing...');
    await App.initWeb3();
    await App.loadContract();
    await App.render();
  },

  initWeb3: async function() {
    if (window.ethereum) {
      App.web3 = new Web3(window.ethereum);
      try {
        const accounts = await window.ethereum.request({ method: 'eth_accounts' });
        App.ACCOUNT = accounts && accounts.length ? accounts[0] : null;
        if (!App.ACCOUNT) {
          try {
            const req = await window.ethereum.request({ method: 'eth_requestAccounts' });
            App.ACCOUNT = req && req.length ? req[0] : null;
          } catch (e) {
            console.warn('MetaMask access request denied / pending:', e.message || e);
          }
        }
      } catch (e) {
        console.warn('eth_accounts error:', e.message || e);
      }
      window.ethereum.on('accountsChanged', function(accs) {
        App.ACCOUNT = accs && accs.length ? accs[0] : null;
        App.updateAccountDisplay();
        App.render();
      });
      window.ethereum.on('chainChanged', function() {
        App.loadContract().then(function() { App.render(); });
      });
    } else {
      // Local Ganache fallback (no MetaMask)
      App.web3 = new Web3(new Web3.providers.HttpProvider('http://127.0.0.1:7545'));
      App.ACCOUNT = null;
      console.warn('No MetaMask detected; please install MetaMask for voting transactions.');
    }
  },

  loadContract: async function() {
    const res = await fetch('/Contest.json');
    if (!res.ok) throw new Error('Failed to load Contest.json: ' + res.status);
    const artifact = await res.json();

    // 1. Direct local Ganache Web3 provider for reliable read operations
    App.fallbackWeb3 = new Web3(new Web3.providers.HttpProvider('http://127.0.0.1:7545'));

    // 2. Discover deployed contract address from artifact
    const nets = Object.values(artifact.networks || {}).filter(function(n) { return n && n.address; });
    const localNet = artifact.networks && (artifact.networks['1337'] || artifact.networks['5777'] || artifact.networks['31337']);

    App.CONTRACT_ADDRESS = null;
    const candidates = [];
    if (localNet && localNet.address) candidates.push(localNet.address);
    nets.forEach(function(n) { if (candidates.indexOf(n.address) === -1) candidates.push(n.address); });

    // Validate bytecode exists on local Ganache
    for (var i = 0; i < candidates.length; i++) {
      try {
        var code = await App.fallbackWeb3.eth.getCode(candidates[i]);
        if (code && code !== '0x') {
          App.CONTRACT_ADDRESS = candidates[i];
          break;
        }
      } catch (e) {}
    }

    if (!App.CONTRACT_ADDRESS && candidates.length > 0) {
      App.CONTRACT_ADDRESS = candidates[0];
    }

    if (!App.CONTRACT_ADDRESS) {
      console.error('No contract address found in Contest.json. Run "node deploy_contract.js"');
      return;
    }

    console.log('Contract address bound:', App.CONTRACT_ADDRESS);

    // 3. Always instantiate readContract pointing directly to Ganache
    App.readContract = new App.fallbackWeb3.eth.Contract(artifact.abi, App.CONTRACT_ADDRESS);

    // 4. Instantiate App.contract for MetaMask
    if (App.web3) {
      App.contract = new App.web3.eth.Contract(artifact.abi, App.CONTRACT_ADDRESS);
    } else {
      App.contract = App.readContract;
    }

    // 5. Check if MetaMask is on the wrong network and warn/prompt
    if (window.ethereum) {
      try {
        const netId = await App.web3.eth.getChainId();
        console.log('Wallet chainId:', netId);
        if (netId !== 1337 && netId !== 5777) {
          App.showNetworkWarning(netId);
        }
      } catch (e) {
        console.warn('Could not read chainId:', e);
      }
    }
  },

  showNetworkWarning: function(netId) {
    var netName = netId === 1 ? 'Ethereum Mainnet' : ('Chain ID ' + netId);
    var alertHtml = 
      "<div id='networkAlert' class='alert alert-warning shadow-sm d-flex justify-content-between align-items-center' style='border-radius: 8px; margin: 15px 0; border-left: 5px solid #ff9800;'>" +
        "<div>" +
          "<i class='material-icons' style='vertical-align: middle; margin-right: 6px;'>warning</i>" +
          "<b>MetaMask is on " + netName + ":</b> Please switch MetaMask to <b>Ganache Local (Chain ID 1337)</b> to vote or add candidates." +
        "</div>" +
        "<button class='btn btn-warning btn-sm' onclick='App.switchNetwork()' style='font-weight:bold; margin-left: 15px; border-radius: 20px; white-space:nowrap;'>" +
          "Switch to Ganache (1337)" +
        "</button>" +
      "</div>";
    if ($('#networkAlert').length === 0) {
      var target = $('.main-panel .content .container-fluid, .main-panel .content .container, .container').first();
      if (target.length) target.prepend(alertHtml);
    }
  },

  switchNetwork: async function() {
    if (!window.ethereum) {
      alert("MetaMask is required to submit transactions.");
      return;
    }
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: '0x539' }] // 1337 in hex
      });
      $('#networkAlert').fadeOut(300, function() { $(this).remove(); });
      App.loadContract().then(function() { App.render(); });
    } catch (err) {
      if (err.code === 4902 || (err.message && err.message.includes('Unrecognized chain ID'))) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: '0x539',
              chainName: 'Ganache Local',
              rpcUrls: ['http://127.0.0.1:7545'],
              nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 }
            }]
          });
          $('#networkAlert').fadeOut(300, function() { $(this).remove(); });
          App.loadContract().then(function() { App.render(); });
        } catch (addErr) {
          console.error('Failed to add Ganache chain:', addErr);
          alert('Could not automatically add Ganache network to MetaMask.\nPlease add it manually in MetaMask Settings -> Networks:\n- RPC URL: http://127.0.0.1:7545\n- Chain ID: 1337\n- Currency: ETH');
        }
      } else {
        console.warn('Switch network rejected or error:', err);
      }
    }
  },

  updateAccountDisplay: function() {
    const el = $('#accountAddress');
    if (!el.length) return;
    if (App.ACCOUNT) {
      el.html(
        "<div class='d-flex flex-wrap align-items-center justify-content-between p-2 px-3 bg-light rounded shadow-sm border my-2' style='gap:10px; width:100%;'>" +
          "<div><b>🦊 Active Wallet:</b> <code style='font-size:0.95rem; font-weight:bold; color:#0d47a1;'>" + App.ACCOUNT + "</code> <small class='text-muted d-block d-sm-inline ml-sm-2'>(To switch, select another account in your MetaMask extension)</small></div>" +
          "<div>" +
            "<button class='btn btn-sm btn-outline-info font-weight-bold' style='border-radius:20px;' onclick='App.connectWallet()' title='Refresh connected account'>" +
              "🔄 Refresh Wallet" +
            "</button>" +
          "</div>" +
        "</div>"
      );
    } else {
      el.html(
        "<div class='d-flex flex-wrap align-items-center justify-content-between p-2 px-3 bg-warning text-dark rounded shadow-sm my-2' style='gap:10px; width:100%;'>" +
          "<div><b>⚠️ MetaMask Wallet Not Connected:</b> Please connect your Ethereum wallet to participate in voting.</div>" +
          "<div>" +
            "<button class='btn btn-sm btn-dark font-weight-bold' style='border-radius:20px;' onclick='App.connectWallet()'>" +
              "🦊 Connect Wallet" +
            "</button>" +
          "</div>" +
        "</div>"
      );
    }
  },

  connectWallet: async function() {
    if (!window.ethereum) { 
      alert('MetaMask extension not found! Please install MetaMask to interact with the blockchain.'); 
      return; 
    }
    try {
      const accs = await window.ethereum.request({ method: 'eth_requestAccounts' });
      App.ACCOUNT = accs && accs.length ? accs[0] : null;
      App.updateAccountDisplay();
      App.render();
    } catch (e) {
      console.warn('eth_requestAccounts error:', e.message || e);
    }
  },

  // =======================  RENDER  =======================
  render: async function() {
    App.updateAccountDisplay();

    try {
      const contract = App.readContract || App.contract;
      if (!contract) {
        console.warn('Contract not ready yet');
        return;
      }

      const [phaseBn, countBn] = await Promise.all([
        contract.methods.state().call(),
        contract.methods.contestantsCount().call()
      ]);
      const phase = parseInt(phaseBn);
      const total = parseInt(countBn);
      window.phaseEnum = phase;

      // Fetch voter's own status if wallet connected
      let voterInfo = null;
      if (App.ACCOUNT) {
        try {
          const v = await contract.methods.voters(App.ACCOUNT).call();
          // struct order: [hasVoted(bool), vote(uint), isRegistered(bool)]
          const hasVoted = Boolean(v.hasVoted !== undefined ? v.hasVoted : v[0]);
          const voteId = parseInt(v.vote !== undefined ? v.vote : v[1]) || 0;
          const isRegistered = Boolean(v.isRegistered !== undefined ? v.isRegistered : v[2]);
          voterInfo = { hasVoted: hasVoted, vote: voteId, isRegistered: isRegistered };
          console.log('Voter status for', App.ACCOUNT, ':', voterInfo);
        } catch (e) { console.warn('voters() call failed:', e.message); }
      }
      App.voterInfo = voterInfo;

      // Fetch all candidates (filter out deleted ones)
      const rows = [];
      for (let i = 1; i <= total; i++) {
        const c = await contract.methods.contestants(i).call();
        if (c && c[1] && c[1].trim() !== '') {
          rows.push({
            id: parseInt(c[0]),
            name: c[1],
            votes: parseInt(c[2]),
            party: c[3],
            age: parseInt(c[4]),
            qual: c[5]
          });
        }
      }

      App.renderVoterStatus(rows);
      App.renderPhaseBanner(phase);
      App.renderCandidateCards(rows, phase);
      App.renderResults(rows, phase);
      App.renderAdminStats(rows, phase);
    } catch (e) {
      console.warn('render error:', e.message || e);
      const ph = $('#currentPhase');
      if (ph.length) {
        ph.html("<div class='alert alert-danger'>Could not connect to the blockchain. Start Ganache, run <code>node deploy_contract.js</code>, then refresh.</div>");
      }
    }
  },

  renderVoterStatus: function(rows) {
    const el = $('#voterStatus');
    if (!el.length) return;
    let html = '';
    if (!App.voterInfo) {
      html = "<div class='alert alert-secondary shadow-sm' style='border-radius:8px;'>" +
        "<i class='material-icons align-middle' style='vertical-align:middle; margin-right:5px;'>account_balance_wallet</i> " +
        "<b>Wallet status:</b> Not connected. " +
        "<button class='btn btn-sm btn-info' onclick='App.connectWallet()' type='button' style='border-radius:20px; margin-left:8px;'>Connect Wallet</button> to check voting eligibility.</div>";
    } else if (App.voterInfo.hasVoted) {
      var votedCandidate = rows.find(function(r) { return r.id === App.voterInfo.vote; });
      var candName = votedCandidate ? (votedCandidate.name + " (" + votedCandidate.party + ")") : ("Candidate #" + App.voterInfo.vote);
      html = "<div class='alert alert-success shadow-sm' style='border-radius:8px; border-left:6px solid #28a745;'>" +
        "<div class='d-flex flex-wrap justify-content-between align-items-center'>" +
          "<div>" +
            "<h4 class='mb-1 font-weight-bold'><i class='material-icons' style='vertical-align:middle;'>check_circle</i> Vote Successfully Recorded!</h4>" +
            "<p class='mb-0'>This wallet (<code>" + App.ACCOUNT + "</code>) has already cast its vote for <b>" + candName + "</b> on the Ethereum blockchain.</p>" +
            "<small class='text-muted'>To vote as a different registered voter, switch to your registered account in MetaMask.</small>" +
          "</div>" +
          "<button class='btn btn-sm btn-outline-success font-weight-bold mt-2 mt-md-0' style='border-radius:20px;' onclick='App.connectWallet()'>🔄 Refresh Wallet</button>" +
        "</div>" +
      "</div>";
    } else if (App.voterInfo.isRegistered) {
      html = "<div class='alert alert-info shadow-sm' style='border-radius:8px; border-left:6px solid #17a2b8;'>" +
        "<h4 class='mb-1 font-weight-bold'><i class='material-icons' style='vertical-align:middle;'>verified_user</i> Wallet Whitelisted & Eligible</h4>" +
        "<p class='mb-0'>Your connected wallet (<code>" + App.ACCOUNT + "</code>) is registered. Select your candidate below to cast your ballot.</p>" +
      "</div>";
    } else {
      html = "<div class='alert alert-warning shadow-sm' style='border-radius:8px; border-left:6px solid #ff9800;'>" +
        "<h4 class='mb-1 font-weight-bold'><i class='material-icons' style='vertical-align:middle;'>warning</i> Wallet Not Registered</h4>" +
        "<p class='mb-0'>Your connected wallet (<code>" + App.ACCOUNT + "</code>) is not yet whitelisted on the blockchain. " +
        "<a href='/form' class='btn btn-sm btn-dark font-weight-bold ml-2' style='border-radius:20px;'>Go to Voter Registration &rarr;</a></p>" +
      "</div>";
    }
    el.html(html);
  },

  renderPhaseBanner: function(stateNum) {
    let phaseUserText = '', phaseAdminText = '', phaseBadge = '';
    if (stateNum === 0) {
      phaseUserText = 'Phase 0: Voter Registration & Candidate Nominations are Open!';
      phaseAdminText = 'Registration Phase'; phaseBadge = 'badge-warning';
    } else if (stateNum === 1) {
      phaseUserText = 'Phase 1: Voting is LIVE! Cast your vote below.';
      phaseAdminText = 'Voting Phase (Live)'; phaseBadge = 'badge-success';
    } else {
      phaseUserText = 'Phase 2: Election is Concluded. Official results are published!';
      phaseAdminText = 'Election Concluded'; phaseBadge = 'badge-danger';
    }
    $('#currentPhase').html(
      "<div class='alert alert-info shadow-sm' style='border-radius: 8px;'>" +
      "<h4 class='mb-0'><b>Election Status:</b> " + phaseUserText + '</h4></div>'
    );
    const admin = $('#currentPhaseAdmin');
    if (admin.length) {
      admin.html("<h3>Current Phase: <span class='badge " + phaseBadge + "'>" + phaseAdminText + '</span></h3>');
    }
  },

  renderCandidateCards: function(rows, phase) {
    const $test = $('#test');
    const $adminTable = $('#contestantsResultsAdmin');
    const $plainTable = $('#contestantsResults');
    const $select = $('#contestantSelect');

    if ($test.length) $test.empty();
    if ($adminTable.length) $adminTable.empty();
    if ($plainTable.length) $plainTable.empty();
    if ($select.length) $select.empty();

    if (rows.length === 0) {
      if ($test.length) $test.html("<div class='col-12 text-center text-muted p-4'><h4>No active candidates in the election.</h4></div>");
      if ($adminTable.length) $adminTable.html("<tr><td colspan='7' class='text-center'>No active candidates. Click 'Add Candidate' to add one.</td></tr>");
      if ($plainTable.length) $plainTable.html("<tr><td colspan='4' class='text-center'>No candidates added yet.</td></tr>");
      return;
    }

    rows.forEach(function(d) {
      // Admin table row with DELETE candidate action
      if ($adminTable.length) {
        $adminTable.append(
          "<tr>" +
            "<th>" + d.id + "</th>" +
            "<td><b>" + d.name + "</b></td>" +
            "<td>" + d.age + "</td>" +
            "<td><span class='badge badge-primary'>" + d.party + "</span></td>" +
            "<td>" + d.qual + "</td>" +
            "<td><span class='badge badge-success' style='font-size:0.9rem;'>" + d.votes + " votes</span></td>" +
            "<td>" +
              "<button type='button' class='btn btn-sm btn-outline-danger' style='border-radius:20px;' onclick='App.deleteCandidate(" + d.id + ", \"" + d.name.replace(/"/g, '&quot;') + "\")'>" +
                "<i class='material-icons' style='font-size:16px; vertical-align:middle;'>delete</i> Delete" +
              "</button>" +
            "</td>" +
          "</tr>"
        );
      }
      // Plain table row
      if ($plainTable.length) {
        $plainTable.append('<tr><th>' + d.id + '</th><td>' + d.name + '</td><td>' + d.party + '</td><td>' + d.votes + '</td></tr>');
      }
      // Dropdown option
      if ($select.length) {
        $select.append("<option value='" + d.id + "'>" + d.name + ' (' + d.party + ')</option>');
      }

      // Voter card + confirm modal
      if ($test.length) {
        const canVote = phase === 1 && App.voterInfo && App.voterInfo.isRegistered && !App.voterInfo.hasVoted;
        let voteBtn;
        let votedIndicator = '';

        if (App.voterInfo && App.voterInfo.hasVoted) {
          if (App.voterInfo.vote === d.id) {
            voteBtn = "<button class='btn btn-success btn-block font-weight-bold' disabled style='border-radius:20px;'><i class='material-icons align-middle' style='font-size:16px;'>check_circle</i> Your Voted Candidate</button>";
            votedIndicator = "<span class='badge badge-success mt-2 d-inline-block'>✓ You Voted For This Candidate</span>";
          } else {
            voteBtn = "<button class='btn btn-secondary btn-block' disabled style='border-radius:20px;'>Already Voted</button>";
          }
        } else if (App.voterInfo && !App.voterInfo.isRegistered) {
          voteBtn = "<a href='/form' class='btn btn-warning btn-block font-weight-bold text-dark' style='border-radius:20px;'><i class='material-icons align-middle' style='font-size:16px;'>app_registration</i> Register to Vote &rarr;</a>";
        } else if (!App.voterInfo) {
          voteBtn = "<button class='btn btn-outline-info btn-block' style='border-radius:20px;' onclick='App.connectWallet()'>Connect Wallet to Vote</button>";
        } else if (phase === 0) {
          voteBtn = "<button class='btn btn-secondary btn-block' disabled style='border-radius:20px;'>Voting Not Open (Phase 0)</button>";
        } else if (phase === 2) {
          voteBtn = "<button class='btn btn-dark btn-block' disabled style='border-radius:20px;'>Election Concluded</button>";
        } else if (canVote) {
          voteBtn = "<button type='button' class='btn btn-info btn-block font-weight-bold' style='border-radius:20px;' data-toggle='modal' data-target='#modal" + d.id + "'><i class='material-icons align-middle' style='font-size:16px;'>how_to_vote</i> Vote For Candidate</button>";
        } else {
          voteBtn = "<button class='btn btn-secondary btn-block' disabled style='border-radius:20px;'>Not Eligible</button>";
        }

        $test.append(
          "<div class='card shadow-sm' style='width:17rem; margin:1rem; border-radius:12px; overflow:hidden;'>" +
            "<div style='background: linear-gradient(135deg, #007bff, #00d2ff); padding:1.5rem 1rem; color:white; text-align:center;'>" +
              "<i class='material-icons' style='font-size:50px;'>how_to_vote</i>" +
              "<h4 class='card-title mb-0' style='font-weight:bold; margin-top:5px; color:white;'>" + d.name + '</h4>' +
              "<span class='badge badge-light text-dark' style='font-size:0.85rem; margin-top:5px;'>" + d.party + '</span>' +
              votedIndicator +
            '</div>' +
            "<div class='card-body text-center'>" +
              "<p class='card-text mb-2'><b>Age:</b> " + d.age + ' yrs<br/><b>Qualification:</b> ' + d.qual + '</p>' +
              voteBtn +
            '</div>' +
          '</div>' +
          "<div class='modal fade' id='modal" + d.id + "' tabindex='-1' role='dialog' aria-hidden='true'>" +
            "<div class='modal-dialog modal-dialog-centered' role='document'>" +
              "<div class='modal-content'>" +
                "<div class='modal-header bg-info text-white'>" +
                  "<h5 class='modal-title'>Confirm Vote for <b>" + d.name + '</b></h5>' +
                  "<button type='button' class='close text-white' data-dismiss='modal'>&times;</button>" +
                '</div>' +
                "<div class='modal-body text-left' style='padding:1.5rem;'>" +
                  '<p><b>Candidate:</b> ' + d.name + '</p>' +
                  '<p><b>Party:</b> ' + d.party + '</p>' +
                  '<p><b>Age:</b> ' + d.age + ' yrs</p>' +
                  '<p><b>Qualification:</b> ' + d.qual + '</p><hr/>' +
                  "<p class='text-muted small'>Your vote will be permanently cast on the Ethereum blockchain via your connected MetaMask wallet. Each registered wallet can vote only once.</p>" +
                '</div>' +
                "<div class='modal-footer'>" +
                  "<button class='btn btn-success' id='confirmVoteBtn" + d.id + "' onclick='App.castVote(" + d.id + ")'>Confirm & Cast Vote</button>" +
                  "<button type='button' class='btn btn-secondary' data-dismiss='modal'>Cancel</button>" +
                '</div>' +
              '</div>' +
            '</div>' +
          '</div>'
        );
      }
    });

    const loader = $('#loader');
    const content = $('#content');
    if (loader.length) loader.hide();
    if (content.length) content.show();
  },

  renderAdminStats: function(rows, phase) {
    const el = $('#adminStats');
    if (!el.length) return;
    const totalVotes = rows.reduce(function(s, d) { return s + d.votes; }, 0);
    const phaseText = phase === 0 ? 'Registration' : phase === 1 ? 'Voting Live' : 'Concluded';
    const phaseBadge = phase === 0 ? 'badge-warning' : phase === 1 ? 'badge-success' : 'badge-danger';

    fetch('/api/adminStats').then(function(r) { return r.json(); }).then(function(stats) {
      const voters = stats && stats.registeredVoters ? stats.registeredVoters : 0;
      const turnout = voters > 0 ? Math.round((totalVotes / voters) * 100) : 0;
      el.html(
        "<div class='row text-center'>" +
          "<div class='col-md-3 col-sm-6'><div class='card border-warning' style='border-radius:12px;'><div class='card-body'><h3 class='mb-0' style='color:#f57f17;'><span class='badge " + phaseBadge + "'>" + phaseText + '</span></h3><small class="text-muted">Election Phase</small></div></div></div>' +
          "<div class='col-md-3 col-sm-6'><div class='card border-info' style='border-radius:12px;'><div class='card-body'><h3 class='mb-0' style='color:#17a2b8;'>" + rows.length + '</h3><small class="text-muted">Active Candidates</small></div></div></div>' +
          "<div class='col-md-3 col-sm-6'><div class='card border-success' style='border-radius:12px;'><div class='card-body'><h3 class='mb-0' style='color:#28a745;'>" + totalVotes + '</h3><small class="text-muted">Votes Cast On-Chain</small></div></div></div>' +
          "<div class='col-md-3 col-sm-6'><div class='card border-primary' style='border-radius:12px;'><div class='card-body'><h3 class='mb-0' style='color:#007bff;'>" + voters + (stats && stats.dbError ? " <i class='material-icons' title='DB offline'>warning</i>" : '') + '</h3><small class="text-muted">Registered Voters' + (voters > 0 ? ' (' + turnout + '% turnout)' : '') + '</small></div></div></div>' +
        '</div>'
      );
    }).catch(function() {
      el.html(
        "<div class='row text-center'>" +
          "<div class='col-md-4'><div class='card border-warning' style='border-radius:12px;'><div class='card-body'><h3 class='mb-0' style='color:#f57f17;'><span class='badge " + phaseBadge + "'>" + phaseText + '</span></h3><small class="text-muted">Election Phase</small></div></div></div>' +
          "<div class='col-md-4'><div class='card border-info' style='border-radius:12px;'><div class='card-body'><h3 class='mb-0' style='color:#17a2b8;'>" + rows.length + '</h3><small class="text-muted">Active Candidates</small></div></div></div>' +
          "<div class='col-md-4'><div class='card border-success' style='border-radius:12px;'><div class='card-body'><h3 class='mb-0' style='color:#28a745;'>" + totalVotes + '</h3><small class="text-muted">Votes Cast On-Chain</small></div></div></div>' +
        '</div>'
      );
    });
  },

  // =======================  RESULTS & CHARTS  =======================
  _barChartInstance: null,
  _pieChartInstance: null,

  drawCharts: function(rows, sumVotes) {
    const barCanvas = document.getElementById('votesBarChart');
    const pieCanvas = document.getElementById('votesPieChart');
    if (!barCanvas || !pieCanvas || typeof Chart === 'undefined') return;

    if (App._barChartInstance) App._barChartInstance.destroy();
    if (App._pieChartInstance) App._pieChartInstance.destroy();

    const labels = rows.map(function(r) { return r.name + ' (' + r.party + ')'; });
    const votesData = rows.map(function(r) { return r.votes; });
    const palette = ['#4caf50', '#2196f3', '#ff9800', '#e91e63', '#9c27b0', '#00bcd4', '#ff5722', '#3f51b5', '#009688'];
    const colors = palette.slice(0, rows.length);

    App._barChartInstance = new Chart(barCanvas, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Votes Cast',
          data: votesData,
          backgroundColor: colors,
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        scales: {
          y: { beginAtZero: true, ticks: { precision: 0 } }
        },
        plugins: {
          legend: { display: false }
        }
      }
    });

    App._pieChartInstance = new Chart(pieCanvas, {
      type: 'doughnut',
      data: {
        labels: labels,
        datasets: [{
          data: sumVotes > 0 ? votesData : rows.map(function() { return 1; }),
          backgroundColor: colors
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'bottom' }
        }
      }
    });
  },

  renderResults: function(rows, phase) {
    const $resultTable = $('#Results');
    if (!$resultTable.length) return;

    const isAdminPage = window.location.pathname === '/adminResults';
    const resultsPublic = (phase === 2) || isAdminPage;

    const $not = $('#not');
    const $table = $('#renderTable');
    const $winnerBanner = $('#winnerBanner');
    const $summary = $('#resultsSummary');
    const $charts = $('#chartsContainer');

    // Calculate winner/tie
    let winnerIds = [];
    if (rows.length > 0) {
      const max = Math.max.apply(null, rows.map(function(r) { return r.votes; }));
      if (max > 0) winnerIds = rows.filter(function(r) { return r.votes === max; }).map(function(r) { return r.id; });
    }

    const sumVotes = rows.reduce(function(s, d) { return s + d.votes; }, 0);

    // Winner banner
    if ($winnerBanner.length) {
      if (!resultsPublic) {
        $winnerBanner.html("<div class='alert alert-secondary' style='border-radius:8px;'><b>Voting in progress.</b> Final results and winner declaration will be published once the admin concludes the election.</div>");
      } else if (phase !== 2) {
        $winnerBanner.html("<div class='alert alert-warning' style='border-radius:8px;'><b>Election is currently in progress.</b> Showing live on-chain vote tallies (Admin view). Official winner declared after concluding the election.</div>");
      } else if (sumVotes === 0) {
        $winnerBanner.html("<div class='alert alert-info text-center' style='border-radius:8px;'><h4>No votes were cast in this election.</h4></div>");
      } else if (winnerIds.length === 1) {
        const w = rows.filter(function(r) { return r.id === winnerIds[0]; })[0];
        const pct = sumVotes > 0 ? ((w.votes / sumVotes) * 100).toFixed(1) : '0';
        $winnerBanner.html(
          "<div class='card shadow-lg border-0 my-3' style='background: linear-gradient(135deg, #fff3e0 0%, #ffe082 100%); border-radius: 16px; border-left: 8px solid #ff9800;'>" +
            "<div class='card-body p-4 text-center'>" +
              "<div style='font-size: 56px; color: #f57f17;'>🏆</div>" +
              "<span class='badge badge-warning text-dark font-weight-bold px-3 py-2' style='font-size: 0.9rem;'>OFFICIAL ELECTION WINNER</span>" +
              "<h1 class='font-weight-bold mt-2 mb-1' style='color: #3e2723;'>" + w.name + "</h1>" +
              "<h4 class='text-muted mb-2'><b>" + w.party + "</b> &bull; " + w.qual + " (Age: " + w.age + ")</h4>" +
              "<div class='d-inline-block p-2 px-4 bg-white shadow-sm mt-2' style='border-radius: 30px;'>" +
                "<span class='text-success font-weight-bold' style='font-size: 1.25rem;'>" + w.votes + " Total Votes</span>" +
                "<span class='mx-2 text-muted'>|</span>" +
                "<span class='text-primary font-weight-bold' style='font-size: 1.25rem;'>" + pct + "% Vote Share</span>" +
              "</div>" +
            "</div>" +
          "</div>"
        );
      } else if (winnerIds.length > 1) {
        const tiedCandidates = rows.filter(function(r) { return winnerIds.includes(r.id); });
        const tiedNames = tiedCandidates.map(function(r) { return '<b>' + r.name + '</b> (' + r.party + ')'; }).join(' and ');
        $winnerBanner.html(
          "<div class='card shadow-lg border-0 my-3' style='background: linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%); border-radius: 16px; border-left: 8px solid #2196f3;'>" +
            "<div class='card-body p-4 text-center'>" +
              "<div style='font-size: 56px;'>🤝</div>" +
              "<span class='badge badge-primary px-3 py-2' style='font-size: 0.9rem;'>ELECTION RESULT: TIE</span>" +
              "<h2 class='font-weight-bold mt-2 mb-1' style='color: #0d47a1;'>" + tiedNames + "</h2>" +
              "<p class='mb-0 font-weight-bold text-muted'>Tied with " + tiedCandidates[0].votes + " votes each!</p>" +
            "</div>" +
          "</div>"
        );
      }
    }

    // Result table
    $resultTable.empty();
    const sorted = rows.slice().sort(function(a, b) { return b.votes - a.votes; });
    let rank = 0;
    let lastVotes = null;
    sorted.forEach(function(d) {
      if (d.votes !== lastVotes) { rank++; lastVotes = d.votes; }
      const pct = sumVotes > 0 ? ((d.votes / sumVotes) * 100) : 0;
      const isWinner = winnerIds.includes(d.id) && phase === 2;
      $resultTable.append(
        "<tr" + (isWinner ? " style='background:#e8f5e9; font-weight:bold;'" : '') + '>' +
          "<th scope='row'>" + (isWinner ? '🏆 ' : '') + '#' + rank + '</th>' +
          '<td><b>' + d.name + '</b></td>' +
          '<td>' + d.age + '</td>' +
          "<td><span class='badge badge-primary'>" + d.party + '</span></td>' +
          '<td>' + d.qual + '</td>' +
          "<td style='min-width:200px;'>" +
            "<div class='progress' style='height:20px; border-radius:10px;'>" +
              "<div class='progress-bar bg-info' role='progressbar' style='width:" + pct.toFixed(1) + "%; font-size:0.75rem; color:#fff; font-weight:bold;'>" + pct.toFixed(1) + '%</div>' +
            '</div>' +
          '</td>' +
          "<td><span class='badge badge-success' style='font-size:1rem;'>" + d.votes + '</span></td>' +
        '</tr>'
      );
    });

    // Policy visibility
    if (!resultsPublic) {
      if ($not.length) $not.show();
      if ($table.length) $table.hide();
      if ($summary.length) $summary.hide();
      if ($charts.length) $charts.hide();
    } else {
      if ($not.length) $not.hide();
      if ($table.length) $table.show();
      if ($summary.length) {
        $summary.show();
        $summary.html(
          "<div class='row text-center'>" +
            "<div class='col-md-4'><div class='card border-info' style='border-radius:12px;'><div class='card-body'><h3 class='mb-0' style='color:#17a2b8;'>" + sumVotes + '</h3><small class="text-muted">Total Votes Cast</small></div></div></div>' +
            "<div class='col-md-4'><div class='card border-info' style='border-radius:12px;'><div class='card-body'><h3 class='mb-0' style='color:#17a2b8;'>" + rows.length + '</h3><small class="text-muted">Active Candidates</small></div></div></div>' +
            "<div class='col-md-4'><div class='card border-info' style='border-radius:12px;'><div class='card-body'><h3 class='mb-0' style='color:#17a2b8;'>" + (phase === 0 ? 'Registration' : phase === 1 ? 'Voting Live' : 'Concluded') + '</h3><small class="text-muted">Election Status</small></div></div></div>' +
          '</div>'
        );
      }
      if ($charts.length && rows.length > 0) {
        $charts.show();
        App.drawCharts(rows, sumVotes);
      }
    }

    // Empty state
    const $empty = $('#resultsEmptyNote');
    if ($empty.length) {
      if (sumVotes === 0 && resultsPublic) $empty.show();
      else $empty.hide();
    }
  },

  // =======================  ACTIONS  =======================
  ensureNetwork: async function() {
    if (!window.ethereum) {
      alert("MetaMask is required to submit transactions.");
      return false;
    }
    try {
      const netId = await App.web3.eth.getChainId();
      if (netId !== 1337 && netId !== 5777) {
        alert("⚠️ Wrong Network!\n\nYour MetaMask is currently on Network/Chain ID " + netId + ".\nPlease switch MetaMask to 'Ganache Local' (Chain ID 1337, http://127.0.0.1:7545) to send transactions.");
        await App.switchNetwork();
        return false;
      }
      return true;
    } catch (e) {
      console.warn('ensureNetwork check error:', e);
      return true;
    }
  },

  waitForTx: function(tx) {
    // Web3 v1.x returns a PromisePromiEvent — return a promise that resolves after mining
    return new Promise(function(resolve, reject) {
      tx.on('transactionHash', function(h) { console.log('tx hash:', h); if (typeof App._setPendingMsg === 'function') App._setPendingMsg('Waiting for confirmation...'); });
      tx.on('receipt', function(receipt) { resolve(receipt); });
      tx.on('error', function(err) { reject(err); });
    });
  },

  addCandidate: async function() {
    if (!App.ACCOUNT) { alert('Please connect your MetaMask wallet first!'); return; }
    const ok = await App.ensureNetwork();
    if (!ok) return;

    if (!App.contract || !App.contract.methods) {
      alert("Contract is not connected. Please ensure Ganache is running on http://127.0.0.1:7545.");
      return;
    }

    const name = $('#name').val();
    const age = parseInt($('#age').val());
    const party = $('#party').val();
    const qualification = $('#qualification').val();
    if (!name || !party || !age || !qualification) { alert('Please fill in all candidate details!'); return; }

    const btn = $('#addCandidateBtn');
    btn.prop('disabled', true);
    btn.html("<span class='spinner-border spinner-border-sm' role='status' aria-hidden='true'></span> Sending Transaction...");

    try {
      const tx = App.contract.methods.addContestant(name, party, age, qualification).send({ from: App.ACCOUNT, gas: 500000 });
      const receipt = await App.waitForTx(tx);
      console.log('✓ addContestant receipt:', receipt);
      $('#loader').removeClass('alert-danger').addClass('alert-success').show()
        .html("<span><b>Candidate</b> has been added Successfully....!</span>");
      $('#addCandidateForm')[0].reset();
      window.location.href = '/candidateDetails';
    } catch (err) {
      console.error('addCandidate error:', err);
      btn.prop('disabled', false);
      btn.html('Add');
      let msg = err.message || 'Unknown error';
      if (msg.includes('revert')) msg = 'Transaction reverted — are you the ADMIN account and is phase = Registration (0)?';
      $('#loader').removeClass('alert-success').addClass('alert-danger').show()
        .html('<span><b>Failed:</b> ' + msg + '</span>');
    }
  },

  changeState: async function() {
    if (!App.ACCOUNT) { alert('Please connect your MetaMask wallet first!'); return; }
    const ok = await App.ensureNetwork();
    if (!ok) return;

    const contract = App.contract || App.readContract;
    if (!contract || !contract.methods) { alert('Contract not connected!'); return; }

    try {
      const current = parseInt(await contract.methods.state().call());
      const next = (current + 1) % 3;
      const names = ['Registration (0)', 'Voting Live (1)', 'Election Over (2)'];
      if (!confirm("Move phase from '" + names[current] + "' to '" + names[next] + "'?")) return;

      const btn = $('#changePhaseBtn');
      if (btn.length) { btn.prop('disabled', true); btn.html("<span class='spinner-border spinner-border-sm'></span> Sending..."); }
      const tx = App.contract.methods.changeState(next).send({ from: App.ACCOUNT, gas: 200000 });
      await App.waitForTx(tx);
      alert('Election phase successfully set to: ' + names[next]);
      window.location.reload();
    } catch (err) {
      console.error('changeState error:', err);
      const btn = $('#changePhaseBtn');
      if (btn.length) { btn.prop('disabled', false); btn.html('Change Phase'); }
      alert('Failed to change phase: ' + (err.message || 'Ensure you are the admin!'));
    }
  },

  deleteCandidate: async function(cId, name) {
    if (!App.ACCOUNT) { alert('Please connect your MetaMask wallet first!'); return; }
    const ok = await App.ensureNetwork();
    if (!ok) return;

    const contract = App.contract || App.readContract;
    if (!contract || !contract.methods) { alert('Contract not connected!'); return; }

    const displayName = name ? name : ('Candidate #' + cId);
    if (!confirm("Are you sure you want to DELETE " + displayName + " from the blockchain?\n\nThis will permanently remove the candidate from this election.")) {
      return;
    }

    try {
      const tx = contract.methods.deleteContestant(cId).send({ from: App.ACCOUNT, gas: 300000 });
      await App.waitForTx(tx);
      alert("✓ " + displayName + " successfully deleted from the blockchain!");
      window.location.reload();
    } catch (err) {
      console.error("deleteCandidate error:", err);
      alert("Failed to delete candidate: " + (err.message || "Ensure you are using the Admin account (0x90F8...)!"));
    }
  },

  concludeElection: async function() {
    if (!App.ACCOUNT) { alert('Please connect your MetaMask wallet first!'); return; }
    const ok = await App.ensureNetwork();
    if (!ok) return;

    const contract = App.contract || App.readContract;
    if (!contract || !contract.methods) { alert('Contract not connected!'); return; }

    if (!confirm("Are you sure you want to CONCLUDE the election?\n\n- Voting will be officially closed.\n- Final results and winner declaration will be published for both users and admin.")) {
      return;
    }

    try {
      const tx = contract.methods.changeState(2).send({ from: App.ACCOUNT, gas: 200000 });
      await App.waitForTx(tx);
      alert("✓ Election Concluded! Official results and winner are now published.");
      window.location.href = '/adminResults';
    } catch (err) {
      console.error("concludeElection error:", err);
      alert("Failed to conclude election: " + (err.message || "Ensure you are using the Admin account (0x90F8...)!"));
    }
  },

  registerVoter: async function(customAddr) {
    if (!App.ACCOUNT) { alert('Please connect your MetaMask wallet first!'); return; }
    const ok = await App.ensureNetwork();
    if (!ok) return;

    const contract = App.contract || App.readContract;
    if (!contract || !contract.methods) { alert('Contract not connected!'); return; }

    const addr = (customAddr || $('#accadd').val() || '').trim();
    if (!Web3.utils.isAddress(addr)) { alert('Invalid Ethereum address: ' + addr); return; }
    try {
      const btn = $('#regVoterBtn');
      if (btn.length) { btn.prop('disabled', true); btn.html("<span class='spinner-border spinner-border-sm'></span> Sending..."); }
      const tx = contract.methods.voterRegisteration(addr).send({ from: App.ACCOUNT, gas: 200000 });
      await App.waitForTx(tx);
      alert('✓ Voter wallet ' + addr + ' successfully whitelisted on the Blockchain!');
      if ($('#accadd').length) $('#accadd').val('');
      if (btn.length) { btn.prop('disabled', false); btn.html('Whitelist on Blockchain'); }
      window.location.reload();
    } catch (err) {
      console.error('registerVoter error:', err);
      alert('Failed to whitelist voter: ' + (err.message || 'Ensure you are the Admin and phase is Registration!'));
    }
  },

  castVote: async function(cId) {
    if (!App.ACCOUNT) { alert('Please connect your MetaMask wallet first!'); return; }
    const ok = await App.ensureNetwork();
    if (!ok) return;

    if (!App.contract || !App.contract.methods) { alert('Contract not connected!'); return; }

    if (App._votePending) return;
    if (!cId) { cId = parseInt($('#contestantSelect').val()); }
    if (!cId) { alert('Please select a candidate!'); return; }

    App._votePending = true;
    const btn = $('#confirmVoteBtn' + cId);
    btn.prop('disabled', true);
    btn.html("<span class='spinner-border spinner-border-sm' role='status' aria-hidden='true'></span> Confirm in MetaMask...");

    try {
      const tx = App.contract.methods.vote(cId).send({ from: App.ACCOUNT, gas: 300000 });
      const receipt = await App.waitForTx(tx);
      console.log('✓ vote receipt:', receipt);
      App._votePending = false;
      alert('Congratulations! Your vote has been recorded on the Blockchain.\n\nTransaction hash:\n' + receipt.transactionHash);
      $('.modal').modal('hide');
      window.location.reload();
    } catch (err) {
      App._votePending = false;
      console.error('castVote error:', err);
      btn.prop('disabled', false);
      btn.html('Confirm & Cast Vote');
      let msg = err.message || '';
      if (msg.includes('user rejected') || err.code === 4001) {
        alert('Transaction rejected in MetaMask. Your vote has NOT been cast.');
      } else if (msg.includes('revert')) {
        alert('Vote Rejected by Smart Contract:\n- Incorrect election phase?\n- Wallet not whitelisted?\n- Already voted with this wallet?');
      } else {
        alert('Vote failed: ' + msg);
      }
    }
  }
};

// Legacy alias (older HTML onsubmit handlers reference App.registerVoter etc — already fine)
var phaseEnum = 0;

$(document).ready(function() { App.init(); });
