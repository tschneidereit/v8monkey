/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * This file tests the async history API exposed by mozIAsyncHistory.
 */

////////////////////////////////////////////////////////////////////////////////
//// Globals

XPCOMUtils.defineLazyServiceGetter(this, "gHistory",
                                   "@mozilla.org/browser/history;1",
                                   "mozIAsyncHistory");

XPCOMUtils.defineLazyServiceGetter(this, "gGlobalHistory",
                                   "@mozilla.org/browser/nav-history-service;1",
                                   "nsIGlobalHistory2");

const TEST_DOMAIN = "http://mozilla.org/";
const TOPIC_UPDATEPLACES_COMPLETE = "places-updatePlaces-complete";

////////////////////////////////////////////////////////////////////////////////
//// Helpers

/**
 * Object that represents a mozIVisitInfo object.
 *
 * @param [optional] aTransitionType
 *        The transition type of the visit.  Defaults to TRANSITION_LINK if not
 *        provided.
 * @param [optional] aVisitTime
 *        The time of the visit.  Defaults to now if not provided.
 */
function VisitInfo(aTransitionType,
                   aVisitTime)
{
  this.transitionType =
    aTransitionType === undefined ? TRANSITION_LINK : aTransitionType;
  this.visitDate = aVisitTime || Date.now() * 1000;
}

/**
 * Generic nsINavHistoryObserver that doesn't implement anything, but provides
 * dummy methods to prevent errors about an object not having a certain method.
 */
function NavHistoryObserver()
{
}
NavHistoryObserver.prototype =
{
  onBeginUpdateBatch: function() { },
  onEndUpdateBatch: function() { },
  onVisit: function() { },
  onTitleChanged: function() { },
  onBeforeDeleteURI: function() { },
  onDeleteURI: function() { },
  onClearHistory: function() { },
  onPageChanged: function() { },
  onDeleteVisits: function() { },
  QueryInterface: XPCOMUtils.generateQI([
    Ci.nsINavHistoryObserver,
  ]),
};

/**
 * Listens for a title change notification, and calls aCallback when it gets it.
 *
 * @param aURI
 *        The URI of the page we expect a notification for.
 * @param aExpectedTitle
 *        The expected title of the URI we expect a notification for.
 * @param aCallback
 *        The method to call when we have gotten the proper notification about
 *        the title changing.
 */
function TitleChangedObserver(aURI,
                              aExpectedTitle,
                              aCallback)
{
  this.uri = aURI;
  this.expectedTitle = aExpectedTitle;
  this.callback = aCallback;
}
TitleChangedObserver.prototype = {
  __proto__: NavHistoryObserver.prototype,
  onTitleChanged: function(aURI,
                           aTitle)
  {
    do_log_info("onTitleChanged(" + aURI.spec + ", " + aTitle + ")");
    if (!this.uri.equals(aURI)) {
      return;
    }
    do_check_eq(aTitle, this.expectedTitle);
    this.callback();
  },
};

/**
 * Tests that a title was set properly in the database.
 *
 * @param aURI
 *        The uri to check.
 * @param aTitle
 *        The expected title in the database.
 */
function do_check_title_for_uri(aURI,
                                aTitle)
{
  let stack = Components.stack.caller;
  let stmt = DBConn().createStatement(
    "SELECT title " +
    "FROM moz_places " +
    "WHERE url = :url "
  );
  stmt.params.url = aURI.spec;
  do_check_true(stmt.executeStep(), stack);
  do_check_eq(stmt.row.title, aTitle, stack);
  stmt.finalize();
}

////////////////////////////////////////////////////////////////////////////////
//// Test Functions

function test_interface_exists()
{
  let history = Cc["@mozilla.org/browser/history;1"].getService(Ci.nsISupports);
  do_check_true(history instanceof Ci.mozIAsyncHistory);
  run_next_test();
}

function test_invalid_uri_throws()
{
  // First, test passing in nothing.
  let place = {
    visits: [
      new VisitInfo(),
    ],
  };
  try {
    gHistory.updatePlaces(place);
    do_throw("Should have thrown!");
  }
  catch (e) {
    do_check_eq(e.result, Cr.NS_ERROR_INVALID_ARG);
  }

  // Now, test other bogus things.
  const TEST_VALUES = [
    null,
    undefined,
    {},
    [],
    TEST_DOMAIN + "test_invalid_id_throws",
  ];
  for (let i = 0; i < TEST_VALUES.length; i++) {
    place.uri = TEST_VALUES[i];
    try {
      gHistory.updatePlaces(place);
      do_throw("Should have thrown!");
    }
    catch (e) {
      do_check_eq(e.result, Cr.NS_ERROR_INVALID_ARG);
    }
  }
  run_next_test();
}

function test_invalid_places_throws()
{
  // First, test passing in nothing.
  try {
    gHistory.updatePlaces();
    do_throw("Should have thrown!");
  }
  catch (e) {
    do_check_eq(e.result, Cr.NS_ERROR_XPC_NOT_ENOUGH_ARGS);
  }

  // Now, test other bogus things.
  const TEST_VALUES = [
    null,
    undefined,
    {},
    [],
    "",
  ];
  for (let i = 0; i < TEST_VALUES.length; i++) {
    let value = TEST_VALUES[i];
    try {
      gHistory.updatePlaces(value);
      do_throw("Should have thrown!");
    }
    catch (e) {
      do_check_eq(e.result, Cr.NS_ERROR_INVALID_ARG);
    }
  }

  run_next_test();
}

function test_invalid_id_throws()
{
  // First check invalid id "0".
  let place = {
    placeId: 0,
    uri: NetUtil.newURI(TEST_DOMAIN + "test_invalid_id_throws"),
    visits: [
      new VisitInfo(),
    ],
  };
  try {
    gHistory.updatePlaces(place);
    do_throw("Should have thrown!");
  }
  catch (e) {
    do_check_eq(e.result, Cr.NS_ERROR_INVALID_ARG);
  }

  // Now check negative id.
  place.placeId = -5;
  try {
    gHistory.updatePlaces(place);
    do_throw("Should have thrown!");
  }
  catch (e) {
    do_check_eq(e.result, Cr.NS_ERROR_INVALID_ARG);
  }

  run_next_test();
}

function test_invalid_guid_throws()
{
  // First check invalid length guid.
  let place = {
    guid: "BAD_GUID",
    uri: NetUtil.newURI(TEST_DOMAIN + "test_invalid_guid_throws"),
    visits: [
      new VisitInfo(),
    ],
  };
  try {
    gHistory.updatePlaces(place);
    do_throw("Should have thrown!");
  }
  catch (e) {
    do_check_eq(e.result, Cr.NS_ERROR_INVALID_ARG);
  }

  // Now check invalid character guid.
  place.guid = "__BADGUID+__";
  do_check_eq(place.guid.length, 12);
  try {
    gHistory.updatePlaces(place);
    do_throw("Should have thrown!");
  }
  catch (e) {
    do_check_eq(e.result, Cr.NS_ERROR_INVALID_ARG);
  }

  run_next_test();
}

function test_no_visits_throws()
{
  const TEST_URI =
    NetUtil.newURI(TEST_DOMAIN + "test_no_id_or_guid_no_visits_throws");
  const TEST_GUID = "_RANDOMGUID_";
  const TEST_PLACEID = 2;

  let log_test_conditions = function(aPlace) {
    let str = "Testing place with " +
      (aPlace.uri ? "uri" : "no uri") + ", " +
      (aPlace.guid ? "guid" : "no guid") + ", " +
      (aPlace.placeId ? "placeId" : "no placeId") + ", " +
      (aPlace.visits ? "visits array" : "no visits array");
    do_log_info(str);
  };

  // Loop through every possible case.  Note that we don't actually care about
  // the case where we have no uri, place id, or guid (covered by another test),
  // but it is easier to just make sure it too throws than to exclude it.
  let place = { };
  for (let uri = 1; uri >= 0; uri--) {
    place.uri = uri ? TEST_URI : undefined;

    for (let guid = 1; guid >= 0; guid--) {
      place.guid = guid ? TEST_GUID : undefined;

      for (let placeId = 1; placeId >= 0; placeId--) {
        place.placeId = placeId ? TEST_PLACEID : undefined;

        for (let visits = 1; visits >= 0; visits--) {
          place.visits = visits ? [] : undefined;

          log_test_conditions(place);
          try {
            gHistory.updatePlaces(place);
            do_throw("Should have thrown!");
          }
          catch (e) {
            do_check_eq(e.result, Cr.NS_ERROR_INVALID_ARG);
          }
        }
      }
    }
  }

  run_next_test();
}

function test_add_visit_no_date_throws()
{
  let place = {
    uri: NetUtil.newURI(TEST_DOMAIN + "test_add_visit_no_date_throws"),
    visits: [
      new VisitInfo(),
    ],
  };
  delete place.visits[0].visitDate;
  try {
    gHistory.updatePlaces(place);
    do_throw("Should have thrown!");
  }
  catch (e) {
    do_check_eq(e.result, Cr.NS_ERROR_INVALID_ARG);
  }

  run_next_test();
}

function test_add_visit_no_transitionType_throws()
{
  let place = {
    uri: NetUtil.newURI(TEST_DOMAIN + "test_add_visit_no_transitionType_throws"),
    visits: [
      new VisitInfo(),
    ],
  };
  delete place.visits[0].transitionType;
  try {
    gHistory.updatePlaces(place);
    do_throw("Should have thrown!");
  }
  catch (e) {
    do_check_eq(e.result, Cr.NS_ERROR_INVALID_ARG);
  }

  run_next_test();
}

function test_add_visit_invalid_transitionType_throws()
{
  // First, test something that has a transition type lower than the first one.
  let place = {
    uri: NetUtil.newURI(TEST_DOMAIN +
                        "test_add_visit_invalid_transitionType_throws"),
    visits: [
      new VisitInfo(TRANSITION_LINK - 1),
    ],
  };
  try {
    gHistory.updatePlaces(place);
    do_throw("Should have thrown!");
  }
  catch (e) {
    do_check_eq(e.result, Cr.NS_ERROR_INVALID_ARG);
  }

  // Now, test something that has a transition type greater than the last one.
  place.visits[0] = new VisitInfo(TRANSITION_FRAMED_LINK + 1);
  try {
    gHistory.updatePlaces(place);
    do_throw("Should have thrown!");
  }
  catch (e) {
    do_check_eq(e.result, Cr.NS_ERROR_INVALID_ARG);
  }

  run_next_test();
}

function test_non_addable_uri_errors()
{
  // Array of protocols that nsINavHistoryService::canAddURI returns false for.
  const URLS = [
    "about:config",
    "imap://cyrus.andrew.cmu.edu/archive.imap",
    "news://new.mozilla.org/mozilla.dev.apps.firefox",
    "mailbox:Inbox",
    "moz-anno:favicon:http://mozilla.org/made-up-favicon",
    "view-source:http://mozilla.org",
    "chrome://browser/content/browser.xul",
    "resource://gre-resources/hiddenWindow.html",
    "data:,Hello%2C%20World!",
    "wyciwyg:/0/http://mozilla.org",
    "javascript:alert('hello wolrd!');",
  ];
  let places = [];
  URLS.forEach(function(url) {
    try {
      let place = {
        uri: NetUtil.newURI(url),
        title: "test for " + url,
        visits: [
          new VisitInfo(),
        ],
      };
      places.push(place);
    }
    catch (e if e.result === Cr.NS_ERROR_FAILURE) {
      // NetUtil.newURI() can throw if e.g. our app knows about imap://
      // but the account is not set up and so the URL is invalid for us.
      // Note this in the log but ignore as it's not the subject of this test.
      do_log_info("Could not construct URI for '" + url + "'; ignoring");
    }
  });

  let callbackCount = 0;
  gHistory.updatePlaces(places, function(aResultCode, aPlaceInfo) {
    do_log_info("Checking '" + aPlaceInfo.uri.spec + "'");
    do_check_eq(aResultCode, Cr.NS_ERROR_INVALID_ARG);
    do_check_false(gGlobalHistory.isVisited(aPlaceInfo.uri));

    // If we have had all of our callbacks, continue running tests.
    if (++callbackCount == places.length) {
      run_next_test();
    }
  });
}

function test_observer_topic_dispatched_when_complete()
{
  // We test a normal visit, and embeded visit, and a uri that would fail
  // the canAddURI test to make sure that the notification happens after *all*
  // of them have had a callback.
  let places = [
    { uri: NetUtil.newURI(TEST_DOMAIN +
                          "test_observer_topic_dispatched_when_complete"),
      visits: [
        new VisitInfo(),
        new VisitInfo(TRANSITION_EMBED),
      ],
    },
    { uri: NetUtil.newURI("data:,Hello%2C%20World!"),
      visits: [
        new VisitInfo(),
      ],
    },
  ];
  do_check_false(gGlobalHistory.isVisited(places[0].uri));
  do_check_false(gGlobalHistory.isVisited(places[1].uri));

  const EXPECTED_COUNT = 3;
  let callbackCount = 0;

  gHistory.updatePlaces(places, function(aResultCode, aPlaceInfo) {
    let checker = PlacesUtils.history.canAddURI(aPlaceInfo.uri) ?
      do_check_true : do_check_false;
    checker(Components.isSuccessCode(aResultCode));
    callbackCount++;
  });

  let observer = {
    observe: function(aSubject, aTopic, aData)
    {
      do_check_eq(aTopic, TOPIC_UPDATEPLACES_COMPLETE);
      do_check_eq(callbackCount, EXPECTED_COUNT);
      Services.obs.removeObserver(observer, TOPIC_UPDATEPLACES_COMPLETE);
      run_next_test();
    },
  };
  Services.obs.addObserver(observer, TOPIC_UPDATEPLACES_COMPLETE, false);
}

function test_add_visit()
{
  const VISIT_TIME = Date.now() * 1000;
  let place = {
    uri: NetUtil.newURI(TEST_DOMAIN + "test_add_visit"),
    title: "test_add_visit title",
    visits: [],
  };
  for (let transitionType = TRANSITION_LINK;
       transitionType <= TRANSITION_FRAMED_LINK;
       transitionType++) {
    place.visits.push(new VisitInfo(transitionType, VISIT_TIME));
  }
  do_check_false(gGlobalHistory.isVisited(place.uri));

  let callbackCount = 0;
  gHistory.updatePlaces(place, function(aResultCode, aPlaceInfo) {
    do_check_true(Components.isSuccessCode(aResultCode));
    do_check_true(gGlobalHistory.isVisited(place.uri));

    // Check mozIPlaceInfo properties.
    do_check_true(place.uri.equals(aPlaceInfo.uri));
    do_check_eq(aPlaceInfo.frecency, -1); // We don't pass frecency here!
    do_check_eq(aPlaceInfo.title, place.title);

    // Check mozIVisitInfo properties.
    let visits = aPlaceInfo.visits;
    do_check_eq(visits.length, 1);
    let visit = visits[0];
    do_check_eq(visit.visitDate, VISIT_TIME);
    do_check_true(visit.transitionType >= TRANSITION_LINK &&
                  visit.transitionType <= TRANSITION_FRAMED_LINK);
    do_check_true(visit.referrerURI === null);

    // For TRANSITION_EMBED visits, many properties will always be zero or
    // undefined.
    if (visit.transitionType == TRANSITION_EMBED) {
      // Check mozIPlaceInfo properties.
      do_check_eq(aPlaceInfo.placeId, 0);
      do_check_eq(aPlaceInfo.guid, null);

      // Check mozIVisitInfo properties.
      do_check_eq(visit.visitId, 0);
      do_check_eq(visit.sessionId, 0);
    }
    // But they should be valid for non-embed visits.
    else {
      // Check mozIPlaceInfo properties.
      do_check_true(aPlaceInfo.placeId > 0);
      do_check_valid_places_guid(aPlaceInfo.guid);

      // Check mozIVisitInfo properties.
      do_check_true(visit.visitId > 0);
      do_check_true(visit.sessionId > 0);
    }

    // If we have had all of our callbacks, continue running tests.
    if (++callbackCount == place.visits.length) {
      run_next_test();
    }
  });
}

function test_properties_saved()
{
  // Check each transition type to make sure it is saved properly.
  let places = [];
  for (let transitionType = TRANSITION_LINK;
       transitionType <= TRANSITION_FRAMED_LINK;
       transitionType++) {
    let place = {
      uri: NetUtil.newURI(TEST_DOMAIN + "test_properties_saved/" +
                          transitionType),
      title: "test_properties_saved test",
      visits: [
        new VisitInfo(transitionType),
      ],
    };
    do_check_false(gGlobalHistory.isVisited(place.uri));
    places.push(place);
  }

  let callbackCount = 0;
  gHistory.updatePlaces(places, function(aResultCode, aPlaceInfo) {
    do_check_true(Components.isSuccessCode(aResultCode));
    let uri = aPlaceInfo.uri;
    do_check_true(gGlobalHistory.isVisited(uri));
    let visit = aPlaceInfo.visits[0];
    print("TEST-INFO | test_properties_saved | updatePlaces callback for " +
          "transition type " + visit.transitionType);

    // Note that TRANSITION_EMBED should not be in the database.
    const EXPECTED_COUNT = visit.transitionType == TRANSITION_EMBED ? 0 : 1;

    // mozIVisitInfo::date
    let stmt = DBConn().createStatement(
      "SELECT COUNT(1) AS count " +
      "FROM moz_places h " +
      "JOIN moz_historyvisits v " +
      "ON h.id = v.place_id " +
      "WHERE h.url = :page_url " +
      "AND v.visit_date = :visit_date "
    );
    stmt.params.page_url = uri.spec;
    stmt.params.visit_date = visit.visitDate;
    do_check_true(stmt.executeStep());
    do_check_eq(stmt.row.count, EXPECTED_COUNT);
    stmt.finalize();

    // mozIVisitInfo::transitionType
    stmt = DBConn().createStatement(
      "SELECT COUNT(1) AS count " +
      "FROM moz_places h " +
      "JOIN moz_historyvisits v " +
      "ON h.id = v.place_id " +
      "WHERE h.url = :page_url " +
      "AND v.visit_type = :transition_type "
    );
    stmt.params.page_url = uri.spec;
    stmt.params.transition_type = visit.transitionType;
    do_check_true(stmt.executeStep());
    do_check_eq(stmt.row.count, EXPECTED_COUNT);
    stmt.finalize();

    // mozIVisitInfo::sessionId
    stmt = DBConn().createStatement(
      "SELECT COUNT(1) AS count " +
      "FROM moz_places h " +
      "JOIN moz_historyvisits v " +
      "ON h.id = v.place_id " +
      "WHERE h.url = :page_url " +
      "AND v.session = :session_id "
    );
    stmt.params.page_url = uri.spec;
    stmt.params.session_id = visit.sessionId;
    do_check_true(stmt.executeStep());
    do_check_eq(stmt.row.count, EXPECTED_COUNT);
    stmt.finalize();

    // mozIPlaceInfo::title
    stmt = DBConn().createStatement(
      "SELECT COUNT(1) AS count " +
      "FROM moz_places h " +
      "WHERE h.url = :page_url " +
      "AND h.title = :title "
    );
    stmt.params.page_url = uri.spec;
    stmt.params.title = aPlaceInfo.title;
    do_check_true(stmt.executeStep());
    do_check_eq(stmt.row.count, EXPECTED_COUNT);
    stmt.finalize();

    // If we have had all of our callbacks, continue running tests.
    if (++callbackCount == places.length) {
      run_next_test();
    }
  });
}

function test_guid_saved()
{
  let place = {
    uri: NetUtil.newURI(TEST_DOMAIN + "test_guid_saved"),
    guid: "__TESTGUID__",
    visits: [
      new VisitInfo(),
    ],
  };
  do_check_valid_places_guid(place.guid);
  do_check_false(gGlobalHistory.isVisited(place.uri));

  gHistory.updatePlaces(place, function(aResultCode, aPlaceInfo) {
    do_check_true(Components.isSuccessCode(aResultCode));
    let uri = aPlaceInfo.uri;
    do_check_true(gGlobalHistory.isVisited(uri));
    do_check_eq(aPlaceInfo.guid, place.guid);
    do_check_guid_for_uri(uri, place.guid);

    run_next_test();
  });
}

function test_referrer_saved()
{
  let places = [
    { uri: NetUtil.newURI(TEST_DOMAIN + "test_referrer_saved/referrer"),
      visits: [
        new VisitInfo(),
      ],
    },
    { uri: NetUtil.newURI(TEST_DOMAIN + "test_referrer_saved/test"),
      visits: [
        new VisitInfo(),
      ],
    },
  ];
  places[1].visits[0].referrerURI = places[0].uri;
  do_check_false(gGlobalHistory.isVisited(places[0].uri));
  do_check_false(gGlobalHistory.isVisited(places[1].uri));

  let callbackCount = 0;
  let referrerSessionId;
  gHistory.updatePlaces(places, function(aResultCode, aPlaceInfo) {
    do_check_true(Components.isSuccessCode(aResultCode));
    let uri = aPlaceInfo.uri;
    do_check_true(gGlobalHistory.isVisited(uri));
    let visit = aPlaceInfo.visits[0];

    // We need to insert all of our visits before we can test conditions.
    if (++callbackCount != places.length) {
      referrerSessionId = visit.sessionId;
      return;
    }

    do_check_true(places[0].uri.equals(visit.referrerURI));
    do_check_eq(visit.sessionId, referrerSessionId);

    let stmt = DBConn().createStatement(
      "SELECT COUNT(1) AS count " +
      "FROM moz_historyvisits " +
      "WHERE place_id = (SELECT id FROM moz_places WHERE url = :page_url) " +
      "AND from_visit = ( " +
        "SELECT id " +
        "FROM moz_historyvisits " +
        "WHERE place_id = (SELECT id FROM moz_places WHERE url = :referrer) " +
      ") "
    );
    stmt.params.page_url = uri.spec;
    stmt.params.referrer = visit.referrerURI.spec;
    do_check_true(stmt.executeStep());
    do_check_eq(stmt.row.count, 1);
    stmt.finalize();

    run_next_test();
  });
}

function test_sessionId_saved()
{
  let place = {
    uri: NetUtil.newURI(TEST_DOMAIN + "test_sessionId_saved"),
    visits: [
      new VisitInfo(),
    ],
  };
  place.visits[0].sessionId = 3;
  do_check_false(gGlobalHistory.isVisited(place.uri));

  gHistory.updatePlaces(place, function(aResultCode, aPlaceInfo) {
    do_check_true(Components.isSuccessCode(aResultCode));
    let uri = aPlaceInfo.uri;
    do_check_true(gGlobalHistory.isVisited(uri));

    let visit = aPlaceInfo.visits[0];
    do_check_eq(visit.sessionId, place.visits[0].sessionId);

    let stmt = DBConn().createStatement(
      "SELECT COUNT(1) AS count " +
      "FROM moz_historyvisits " +
      "WHERE place_id = (SELECT id FROM moz_places WHERE url = :page_url) " +
      "AND session = :session_id "
    );
    stmt.params.page_url = uri.spec;
    stmt.params.session_id = visit.sessionId;
    do_check_true(stmt.executeStep());
    do_check_eq(stmt.row.count, 1);
    stmt.finalize();

    run_next_test();
  });
}

function test_guid_change_saved()
{
  // First, add a visit for it.
  let place = {
    uri: NetUtil.newURI(TEST_DOMAIN + "test_guid_change_saved"),
    visits: [
      new VisitInfo(),
    ],
  };
  do_check_false(gGlobalHistory.isVisited(place.uri));

  gHistory.updatePlaces(place, function(aResultCode, aPlaceInfo) {
    do_check_true(Components.isSuccessCode(aResultCode));

    // Then, change the guid with visits.
    place.guid = "_GUIDCHANGE_";
    place.visits = [new VisitInfo()];
    gHistory.updatePlaces(place, function(aResultCode, aPlaceInfo) {
      do_check_true(Components.isSuccessCode(aResultCode));
      do_check_guid_for_uri(place.uri, place.guid);

      run_next_test();
    });
  });
}

function test_title_change_saved()
{
  // First, add a visit for it.
  let place = {
    uri: NetUtil.newURI(TEST_DOMAIN + "test_title_change_saved"),
    title: "original title",
    visits: [
      new VisitInfo(),
    ],
  };
  do_check_false(gGlobalHistory.isVisited(place.uri));

  gHistory.updatePlaces(place, function(aResultCode, aPlaceInfo) {
    do_check_true(Components.isSuccessCode(aResultCode));

    // Now, make sure the empty string clears the title.
    place.title = "";
    place.visits = [new VisitInfo()];
    gHistory.updatePlaces(place, function(aResultCode, aPlaceInfo) {
      do_check_true(Components.isSuccessCode(aResultCode));
      do_check_title_for_uri(place.uri, null);

      // Then, change the title with visits.
      place.title = "title change";
      place.visits = [new VisitInfo()];
      gHistory.updatePlaces(place, function(aResultCode, aPlaceInfo) {
        do_check_true(Components.isSuccessCode(aResultCode));
        do_check_title_for_uri(place.uri, place.title);

        // Lastly, check that the title is cleared if we set it to null.
        place.title = null;
        place.visits = [new VisitInfo()];
        gHistory.updatePlaces(place, function(aResultCode, aPlaceInfo) {
          do_check_true(Components.isSuccessCode(aResultCode));
          do_check_title_for_uri(place.uri, place.title);

          run_next_test();
        });
      });
    });
  });
}

function test_no_title_does_not_clear_title()
{
  const TITLE = "test title";
  // First, add a visit for it.
  let place = {
    uri: NetUtil.newURI(TEST_DOMAIN + "test_no_title_does_not_clear_title"),
    title: TITLE,
    visits: [
      new VisitInfo(),
    ],
  };
  do_check_false(gGlobalHistory.isVisited(place.uri));

  gHistory.updatePlaces(place, function(aResultCode, aPlaceInfo) {
    do_check_true(Components.isSuccessCode(aResultCode));

    // Now, make sure that not specifying a title does not clear it.
    delete place.title;
    place.visits = [new VisitInfo()];
    gHistory.updatePlaces(place, function(aResultCode, aPlaceInfo) {
      do_check_true(Components.isSuccessCode(aResultCode));
      do_check_title_for_uri(place.uri, TITLE);

      run_next_test();
    });
  });
}

function test_title_change_notifies()
{
  // There are three cases to test.  The first case is to make sure we do not
  // get notified if we do not specify a title.
  let place = {
    uri: NetUtil.newURI(TEST_DOMAIN + "test_title_change_notifies"),
    visits: [
      new VisitInfo(),
    ],
  };
  do_check_false(gGlobalHistory.isVisited(place.uri));

  let silentObserver =
    new TitleChangedObserver(place.uri, "DO NOT WANT", function() {
      do_throw("unexpected callback!");
    });

  PlacesUtils.history.addObserver(silentObserver, false);
  gHistory.updatePlaces(place);

  // The second case to test is that we get the notification when we add
  // it for the first time.  The first case will fail before our callback if it
  // is busted, so we can do this now.
  place.uri = NetUtil.newURI(place.uri.spec + "/new-visit-with-title");
  place.title = "title 1";
  let callbackCount = 0;
  let observer = new TitleChangedObserver(place.uri, place.title, function() {
    switch (++callbackCount) {
      case 1:
        // The third case to test is to make sure we get a notification when we
        // change an existing place.
        observer.expectedTitle = place.title = "title 2";
        place.visits = [new VisitInfo()];
        gHistory.updatePlaces(place);
        break;
      case 2:
        PlacesUtils.history.removeObserver(silentObserver);
        PlacesUtils.history.removeObserver(observer);
        run_next_test();
    };
  });
  PlacesUtils.history.addObserver(observer, false);
  gHistory.updatePlaces(place);
}

////////////////////////////////////////////////////////////////////////////////
//// Test Runner

let gTests = [
  test_interface_exists,
  test_invalid_uri_throws,
  test_invalid_places_throws,
  test_invalid_id_throws,
  test_invalid_guid_throws,
  test_no_visits_throws,
  test_add_visit_no_date_throws,
  test_add_visit_no_transitionType_throws,
  test_add_visit_invalid_transitionType_throws,
  test_non_addable_uri_errors,
  test_observer_topic_dispatched_when_complete,
  test_add_visit,
  test_properties_saved,
  test_guid_saved,
  test_referrer_saved,
  test_sessionId_saved,
  test_guid_change_saved,
  test_title_change_saved,
  test_no_title_does_not_clear_title,
  test_title_change_notifies,
];

function run_test()
{
  run_next_test();
}