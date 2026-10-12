var Contest = artifacts.require("./Contest.sol");

/**
 * Lifecycle tests for the Contest e-voting contract.
 * Covers: deployment state, admin addContestant, voter whitelisting,
 * phase gating, single-vote enforcement, and unauthorized access rejection.
 */
contract("Contest", function (accounts) {
  var ADMIN = accounts[0];
  var VOTER = accounts[1];
  var NOTWHITELISTED = accounts[2];

  it("starts in Registration phase with zero candidates and admin = deployer", function () {
    return Contest.deployed().then(function (instance) {
      return Promise.all([instance.state(), instance.contestantsCount()]).then(function (vals) {
        assert.equal(vals[0].toNumber(), 0, "should start in PHASE.reg (0)");
        assert.equal(vals[1].toNumber(), 0, "should have no candidates at deployment");
      });
    });
  });

  it("rejects addContestant from a non-admin account", function () {
    return Contest.deployed().then(function (instance) {
      return instance.addContestant("Hacker", "BadActor", 40, "None", { from: accounts[3] })
        .then(function () {
          assert.fail("non-admin addContestant should have been rejected");
        })
        .catch(function (error) {
          assert.include(error.message, "revert", "expected revert for non-admin");
        });
    });
  });

  it("admin can add contestants and IDs increment 1..N", function () {
    return Contest.deployed().then(function (instance) {
      return instance.addContestant("Alice", "Party A", 35, "B.E.", { from: ADMIN })
        .then(function () {
          return instance.addContestant("Bob", "Party B", 42, "M.Tech.", { from: ADMIN });
        })
        .then(function () {
          return instance.contestantsCount();
        })
        .then(function (count) {
          assert.equal(count.toNumber(), 2, "two candidates registered");
          return instance.contestants(1);
        })
        .then(function (c1) {
          assert.equal(c1[0].toNumber(), 1, "candidate 1 id");
          assert.equal(c1[1], "Alice", "candidate 1 name");
          assert.equal(c1[2].toNumber(), 0, "candidate 1 has zero votes initially");
          assert.equal(c1[3], "Party A", "candidate 1 party");
          return instance.contestants(2);
        })
        .then(function (c2) {
          assert.equal(c2[1], "Bob", "candidate 2 name");
          assert.equal(c2[2].toNumber(), 0, "candidate 2 has zero votes initially");
        });
    });
  });

  it("rejects voting during registration phase (phase gate)", function () {
    return Contest.deployed().then(function (instance) {
      return instance.voterRegisteration(VOTER, { from: ADMIN })
        .then(function () {
          return instance.vote(1, { from: VOTER });
        })
        .then(function () {
          assert.fail("voting during registration phase should have been rejected");
        })
        .catch(function (error) {
          assert.include(error.message, "revert", "expected revert outside voting phase");
        });
    });
  });

  it("rejects voting from a non-registered wallet", function () {
    return Contest.deployed().then(function (instance) {
      return instance.changeState(1, { from: ADMIN }) // move to Voting phase
        .then(function () {
          return instance.vote(1, { from: NOTWHITELISTED });
        })
        .then(function () {
          assert.fail("non-whitelisted vote should have been rejected");
        })
        .catch(function (error) {
          assert.include(error.message, "revert", "expected revert for unregistered voter");
        });
    });
  });

  it("whitelisted voter casts exactly one vote; second vote reverts", function () {
    return Contest.deployed().then(function (instance) {
      return instance.state()
        .then(function (s) {
          assert.equal(s.toNumber(), 1, "should be in voting phase");
          return instance.vote(1, { from: VOTER });
        })
        .then(function () {
          return instance.voters(VOTER);
        })
        .then(function (v) {
          // struct declaration order: hasVoted, vote, isRegistered
          assert.equal(v[0], true, "voter marked hasVoted");
          assert.equal(v[1].toNumber(), 1, "recorded candidate id 1");
          assert.equal(v[2], true, "voter is registered");
          return instance.contestants(1);
        })
        .then(function (c1) {
          assert.equal(c1[2].toNumber(), 1, "candidate 1 received 1 vote");
          // ---- duplicate vote attempt must revert ----
          return instance.vote(2, { from: VOTER });
        })
        .then(function () {
          assert.fail("duplicate vote should have been rejected");
        })
        .catch(function (error) {
          assert.include(error.message, "revert", "second vote must be blocked at the contract layer");
          return instance.contestants(2);
        })
        .then(function (c2) {
          assert.equal(c2[2].toNumber(), 0, "candidate 2 must NOT have received a vote from the blocked attempt");
        });
    });
  });

  it("rejects invalid candidate ids (out of range)", function () {
    var fresh = accounts[5];
    return Contest.deployed().then(function (instance) {
      return instance.voterRegisteration(fresh, { from: ADMIN })
        .then(function () {
          return instance.vote(99, { from: fresh });
        })
        .then(function () {
          assert.fail("out-of-range candidate id should have been rejected");
        })
        .catch(function (error) {
          assert.include(error.message, "revert");
        });
    });
  });

  it("rejects changeState from non-admin", function () {
    return Contest.deployed().then(function (instance) {
      return instance.changeState(2, { from: accounts[3] })
        .then(function () {
          assert.fail("non-admin changeState should have been rejected");
        })
        .catch(function (error) {
          assert.include(error.message, "revert");
          return instance.state();
        })
        .then(function (s) {
          assert.equal(s.toNumber(), 1, "phase should remain Voting (1)");
        });
    });
  });
});
