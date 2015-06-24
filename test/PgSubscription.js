// numtel:pg
// MIT License, ben@latenightsketches.com
// test/PgSubscription.js

var SUITE_PREFIX = 'numtel:pg - PgSubscription - ';
var POLL_WAIT = 700; // update allowance
var LOAD_COUNT = 10;

// Test error handling
errorSub = new PgSubscription('errorRaising');

players = new PgSubscription('allPlayers');
myScore = new PgSubscription('playerScore', 'Maxwell');

var expectedRows = [ // test/index.es6 :: insertSampleData()
  { name: 'Planck', score: 70 },
  { name: 'Maxwell', score: 60 },
  { name: 'Leibniz', score: 50 },
  { name: 'Kepler', score: 40 }
];

Tinytest.addAsync(SUITE_PREFIX + 'Initialization', function(test, done){
  Meteor.setTimeout(function(){
    test.isTrue(players.ready());
    test.equal(expectResult(players, expectedRows), true);
    done();
  }, POLL_WAIT);
});

Tinytest.addAsync(SUITE_PREFIX + 'Insert / Delete Row Sync',
function(test, done){
  var newPlayer = 'Archimedes';
  var eventRecords = [];
  players.addEventListener('update.test1', function(diff, data){
    eventRecords.push('update');
  });
  players.addEventListener('updated.test1', function(diff, data){
    eventRecords.push('updated');
  });
  Meteor.call('insPlayer', newPlayer, 100);
  Meteor.setTimeout(function(){
    var newExpected = expectedRows.slice();
    newExpected.unshift({ name: newPlayer, score: 100 });
    test.equal(expectResult(players, newExpected), true, 'Row inserted');
    Meteor.call('delPlayer', newPlayer);
    Meteor.setTimeout(function(){
      players.removeEventListener(/test1/);
      test.equal(expectResult(eventRecords, [ 'update', 'updated']), true,
        'Expected events firing');
      test.equal(expectResult(players, expectedRows), true, 'Row removed');
      done();
    }, POLL_WAIT);
  }, POLL_WAIT);
});

Tinytest.addAsync(SUITE_PREFIX + 'Empty initial result set',
function(test, done){
  var newPlayer = 'Weber';
  var newScore = new PgSubscription('playerScore', newPlayer);
  var updateCount = 0;

  newScore.addEventListener('updated.test1', function(diff, data){
    updateCount++;
    if(updateCount === 1) {
      // Step 1: receive empty data
      test.ok(diff.added instanceof Array);
      test.equal(diff.added.length, 0);
      Meteor.call('insPlayer', newPlayer, 100);
    } else if(updateCount === 2) {
      // Step 2: receive one result
      test.equal(diff.added.length, 1);
      test.equal(data[0].score, 100);
      Meteor.call('delPlayer', newPlayer);
    } else if(updateCount === 3) {
      // Step 3: back to zero results
      test.equal(diff.added, null);
      test.equal(diff.removed.length, 1);
      newScore.removeEventListener(/test1/);
      newScore.stop();
      done();
    }
  });
});

Tinytest.addAsync(SUITE_PREFIX + 'Conditional Trigger Update',
function(test, done){
  Meteor.setTimeout(function(){
    test.equal(myScore.length, 1);
    test.equal(myScore[0].score, 60);
    if(Meteor.isClient){
      var testEl = document.getElementById('myScoreTest');
      var testElVal = parseInt($.trim(testEl.textContent), 10);
      test.equal(testElVal, 60, 'Reactive template');
    }
    Meteor.call('setScore', myScore[0].id, 30);
    Meteor.setTimeout(function(){
      test.equal(myScore[0].score, 30);
      if(Meteor.isClient){
        testElVal = parseInt($.trim(testEl.textContent), 10);
        test.equal(testElVal, 30, 'Reactive template');
      }
      Meteor.call('setScore', myScore[0].id, 60);
      done();
    }, POLL_WAIT);
  }, POLL_WAIT);
});

testAsyncMulti(SUITE_PREFIX + 'Event Listeners', [
  function(test, expect){
    var buffer = 0;
    players.addEventListener('test.cow', function(){ buffer++; });
    players.dispatchEvent('test');
    test.equal(buffer, 1, 'Call suffixed listener without specified suffix');
    players.removeEventListener('test');
    players.dispatchEvent('test');
    test.equal(buffer, 1, 'Remove suffixed listener without specified suffix');
  },
  function(test, expect){
    var buffer = 0;
    players.addEventListener('test.cow', function(){ buffer++; });
    players.dispatchEvent('test.cow');
    test.equal(buffer, 1, 'Call suffixed listener with specified suffix');
    players.removeEventListener('test.cow');
    players.dispatchEvent('test.cow');
    test.equal(buffer, 1, 'Remove suffixed listener with specified suffix');
  },
  function(test, expect){
    var buffer = 1;
    players.addEventListener('cheese', function(value){ buffer+=value; });
    players.dispatchEvent('cheese', 5);
    test.equal(buffer, 6, 'Call non-suffixed listener with argument');
    players.removeEventListener('cheese');
    players.dispatchEvent('cheese');
    test.equal(buffer, 6, 'Remove non-suffixed listener');
  },
  function(test, expect){
    var buffer = 1;
    players.addEventListener('balloon', function(value){ buffer+=value; });
    players.dispatchEvent(/ball/, 5);
    test.equal(buffer, 6, 'Call listener using RegExp');
    players.removeEventListener(/ball/);
    players.dispatchEvent(/ball/);
    test.equal(buffer, 6, 'Remove listener using RegExp');
  },
  function(test, expect){
    var buffer = 0;
    players.addEventListener('test.a', function(){ buffer++; });
    players.addEventListener('test.b', function(){ buffer++; return false; });
    players.dispatchEvent('test');
    test.equal(buffer, 1, 'Call multiple listeners with halt');
    players.removeEventListener('test');
    players.dispatchEvent('test');
    test.equal(buffer, 1, 'Remove multiple listeners');
  }
]);

Tinytest.addAsync(SUITE_PREFIX + 'Multiple Connections', function(test, done){
  var newPlayers = [];
  var playersStartLength = players.length;
  var checkDone = function(){
    if(_.filter(newPlayers, function(player){
      return player.done;
    }).length !== LOAD_COUNT) return;
    _.each(newPlayers, function(newPlayer){
      Meteor.call('delPlayer', newPlayer.name);
    });
    Meteor.setTimeout(function(){
      test.equal(players.length, playersStartLength);
      done();
    }, POLL_WAIT * 2);
  };

  for(var i = 0; i < LOAD_COUNT; i++){
    newPlayers.push({
      name: randomString(10),
      score: Math.floor(Math.random() * 100) * 5
    });
  }

  _.each(newPlayers, function(newPlayer){
    Meteor.call('insPlayer', newPlayer.name, newPlayer.score);
    newPlayer.subscription =
      new PgSubscription('playerScore', newPlayer.name);
    newPlayer.subscription.addEventListener('update', function(){
      newPlayer.subscription.removeEventListener('update');
      newPlayer.done = true;
      checkDone();
    });
  });
});

Tinytest.addAsync(SUITE_PREFIX + 'Multiple Transactions per Second',
function(test, done){
  var newPlayers = [];
  var playersStartLength = players.length;
  for(var i = 0; i < LOAD_COUNT; i++){
    newPlayers.push({
      name: randomString(10),
      score: Math.floor(Math.random() * 100) * 5
    });
  }

  var checkDone = function(){
    if(players.length === playersStartLength){
      test.equal(expectResult(players, expectedRows), true);
      players.removeEventListener('updated');
      done();
    }
  };

  players.addEventListener('updated', function(){
    if(players.length === playersStartLength + LOAD_COUNT){
      Meteor.setTimeout(function(){
        players.removeEventListener('updated');
        players.addEventListener('updated', checkDone);
        _.each(newPlayers, function(newPlayer){
          Meteor.call('delPlayer', newPlayer.name);
        });
      }, POLL_WAIT);

    }
  });

  _.each(newPlayers, function(newPlayer){
    Meteor.call('insPlayer', newPlayer.name, newPlayer.score);
  });
});

Tinytest.addAsync(SUITE_PREFIX + 'Stop Method',
function(test, done){
  var testSub = new PgSubscription('allPlayers');
  testSub.addEventListener('update', function(){
    testSub.removeEventListener('update');
    Meteor.setTimeout(function(){
      testSubReady();
    }, 100);
  });

  var testSubReady = function(){
    testSub.addEventListener('updated.stop', function(){
      test.equal(0, 1, 'Added event should not have been emitted');
    });

    testSub.stop();

    Meteor.call('insPlayer', 'After Stop', 100);

    // Wait to see if added event dispatches
    Meteor.setTimeout(function(){
      testSub.removeEventListener('updated.stop');
      Meteor.call('delPlayer', 'After Stop');
      players.addEventListener('updated.afterStop', function(){
        players.removeEventListener('updated.afterStop');
        done();
      });
    }, 200);
  };
});

Tinytest.addAsync(SUITE_PREFIX + 'Change Method to empty',
function(test, done){
  test.equal(players.length, expectedRows.length);
  test.isTrue(players.ready());

  // Limit players sub to 0 rows
  players.change(0);
  test.isFalse(players.ready());
  
  Meteor.setTimeout(function() {
    test.equal(players.length, 0);
    test.isTrue(players.ready());

    // Reset players to original state
    players.change();

    Meteor.setTimeout(function() {
      test.equal(players.length, expectedRows.length);
      done();
    }, POLL_WAIT);
  }, POLL_WAIT);
});

Tinytest.addAsync(SUITE_PREFIX + 'Change Method',
function(test, done){
  test.equal(players.length, expectedRows.length);
  test.isTrue(players.ready());

  // Limit players sub to 1 row
  players.change(1);
  test.isFalse(players.ready());
  
  Meteor.setTimeout(function() {
    test.equal(players.length, 1);
    test.isTrue(players.ready());

    // Reset players to original state
    players.change();

    Meteor.setTimeout(function() {
      test.equal(players.length, expectedRows.length);
      done();
    }, POLL_WAIT);
  }, POLL_WAIT);
});

Tinytest.addAsync(SUITE_PREFIX + 'Quick Change',
function(test, done){
  for (var i = 0; i < expectedRows.length; i++) {
    players.change(i);
  }
  players.change();
  Meteor.setTimeout(function () {
    test.equal(players.length, expectedRows.length);
    done();
  }, POLL_WAIT);
});
