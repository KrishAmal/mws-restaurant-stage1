let restaurant;
var newMap;
var dbPromise;

var IDB_VERSION_RESTAURANT = 2;

function openDatabase() {
  // If the browser doesn't support service worker,
  // we don't care about having a database
  if (!navigator.serviceWorker) {
    return Promise.resolve();
  }

  return idb.open('restaurant_detail', IDB_VERSION_RESTAURANT, function (upgradeDb) {
    if (!upgradeDb.objectStoreNames.contains('restaurant_detail_review')) {
      upgradeDb.createObjectStore('restaurant_detail_review', { autoIncrement: false });
    }
    if (!upgradeDb.objectStoreNames.contains('outbox')) {
      upgradeDb.createObjectStore('outbox', { autoIncrement: true, keyPath: 'id' });
    }
    upgradeDb.createObjectStore('restaurant_detail', {
      autoIncrement: true
    });

  });
}

function queryAndSendOfflineData() {

  dbPromise.then(function (db) {
    if (!db) {
      console.log("Db is Not loaded");
      return;
    }

    var index = db.transaction('outbox')
      .objectStore('outbox');

    index.getAll()
      .then(function (reviews) {
        console.log(reviews);
        reviews.forEach(review => {
          console.log(review);
          fetch(`http://localhost:1337/reviews/`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(review), // body data type must match "Content-Type" header
          }).then(function (response) {
            console.log("SENT Id:" + review.id + " " + response.json());

            var indexDel = db.transaction('outbox', 'readwrite')
              .objectStore('outbox');
            indexDel.delete(review.id)
              .then(function (response) { console.log('delete done!') })
              .catch(function (error) { console.log("Error deleting:" + error) });

            resolve();
          }).catch(error => error.message); // parses response to JSON
        });
      })
      .catch(e => console.log(e));
  });
}

function updateConnectionStatus(msg, connected) {
  if (connected) {
    queryAndSendOfflineData();
  } else {
    var sBar = document.getElementById("snackbar");
    sBar.className = "show";
    sBar.innerHTML = "You Are Offline";
    setTimeout(function () { sBar.className = sBar.className.replace("show", ""); }, 3000);
  }
}

window.addEventListener('load', function (e) {
  if (navigator.onLine) {
    updateConnectionStatus('Online', true);
  } else {
    updateConnectionStatus('Offline', false);
  }
}, false);

window.addEventListener('online', function (e) {
  console.log("Online");
  updateConnectionStatus('Online', true);
  // Get updates from server.
}, false);

window.addEventListener('offline', function (e) {
  console.log("Offline");
  updateConnectionStatus('Offline', false);
  // Use offine mode.
}, false);

/**
 * Initialize map as soon as the page is loaded.
 */
document.addEventListener('DOMContentLoaded', (event) => {
  init();
});

function init() {
  dbPromise = openDatabase();
  initMap();
}

/**
 * Initialize leaflet map
 */
initMap = () => {
  fetchRestaurantFromURL((error, restaurant) => {
    if (error) { // Got an error!
      console.error(error);
    } else {
      self.newMap = L.map('map', {
        center: [restaurant.latlng.lat, restaurant.latlng.lng],
        zoom: 16,
        scrollWheelZoom: false
      });
      L.tileLayer('https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.jpg70?access_token={mapboxToken}', {
        mapboxToken: 'pk.eyJ1IjoiYWtpbmZpbml0eSIsImEiOiJjamoybzE4ZWkxMXNhM2ttaDBxemg4enltIn0.Xp3KyaW7NiP4Uv0BTubGfw',
        maxZoom: 18,
        attribution: 'Map data &copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> contributors, ' +
          '<a href="https://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, ' +
          'Imagery © <a href="https://www.mapbox.com/">Mapbox</a>',
        id: 'mapbox.streets'
      }).addTo(newMap);
      fillBreadcrumb();
      DBHelper.mapMarkerForRestaurant(self.restaurant, self.newMap);
    }
  });
}

/* window.initMap = () => {
  fetchRestaurantFromURL((error, restaurant) => {
    if (error) { // Got an error!
      console.error(error);
    } else {
      self.map = new google.maps.Map(document.getElementById('map'), {
        zoom: 16,
        center: restaurant.latlng,
        scrollwheel: false
      });
      fillBreadcrumb();
      DBHelper.mapMarkerForRestaurant(self.restaurant, self.map);
    }
  });
} */

/**
 * Get current restaurant from page URL.
 */
fetchRestaurantFromURL = (callback) => {
  if (self.restaurant) { // restaurant already fetched!
    callback(null, self.restaurant)
    return;
  }
  const id = getParameterByName('id');
  if (!id) { // no id found in URL
    error = 'No restaurant id in URL'
    callback(error, null);
  } else {
    DBHelper.fetchRestaurantById(id, (error, restaurant) => {
      self.restaurant = restaurant;
      if (!restaurant) {
        console.error(error);
        return;
      }
      fillRestaurantHTML();
      callback(null, restaurant)
    });
  }
}

/**
 * Create restaurant HTML and add it to the webpage
 */
fillRestaurantHTML = (restaurant = self.restaurant) => {
  const name = document.getElementById('restaurant-name');
  name.innerHTML = restaurant.name;

  const address = document.getElementById('restaurant-address');
  address.innerHTML = restaurant.address;

  const image = document.getElementById('restaurant-img');
  image.className = 'restaurant-img'

  image.src = DBHelper.imageUrlForRestaurant(restaurant);
  image.alt = "Photo of " + restaurant.name;

  const cuisine = document.getElementById('restaurant-cuisine');
  cuisine.innerHTML = restaurant.cuisine_type;

  const favBtn = document.getElementById('fav-btn');
  toggleFavBtnStyle(favBtn, self.restaurant.is_favorite);

  // fill operating hours
  if (restaurant.operating_hours) {
    fillRestaurantHoursHTML();
  }
  // fill reviews
  fetchReviews();
}

function toggleFavBtn() {
  console.log("toggleFavBtn");
  var favBtn = document.getElementById('fav-btn');
  var is_favorite;
  if (favBtn.innerHTML == "Favorited") {
    is_favorite = "false";
    toggleFavBtnStyle(favBtn, "false");
  } else {
    is_favorite = "true";
    toggleFavBtnStyle(favBtn, "true");
  }

  fetch(`http://localhost:1337/restaurants/${self.restaurant.id}/?is_favorite=${is_favorite}`, {
    method: "PUT",
  }).then(response => response.json())
    .catch(error => error.message);

}

function toggleFavBtnStyle(btn, toggle) {
  console.log("toggleFavBtnStyle");
  if (toggle == "true") {
    btn.innerHTML = "Favorited";
    btn.style.color = '#38f';
    btn.style.borderColor = '#38f';
  } else {
    btn.innerHTML = "Add To Favorites";
    btn.style.color = '#000';
    btn.style.borderColor = '#000';
  }
}

/**
 * Create restaurant operating hours HTML table and add it to the webpage.
 */
fillRestaurantHoursHTML = (operatingHours = self.restaurant.operating_hours) => {
  const hours = document.getElementById('restaurant-hours');
  for (let key in operatingHours) {
    const row = document.createElement('tr');

    const day = document.createElement('td');
    day.innerHTML = key;
    row.appendChild(day);

    const time = document.createElement('td');
    time.innerHTML = operatingHours[key];
    row.appendChild(time);

    hours.appendChild(row);
  }
}

fetchReviews = (id = self.restaurant.id) => {
  fetch(DBHelper.SERVER_REVIEWS_BY_ID(id))
    .then(response => response.json())
    .then(gotReviews)
    .catch(e => requestError(e, id));
}

function gotReviews(reviews) {
  dbPromise.then(function (db) {
    if (!db) return;

    var tx = db.transaction('restaurant_detail_review', 'readwrite');
    var store = tx.objectStore('restaurant_detail_review');
    store.put(reviews, self.restaurant.id);
  });

  fillReviewsHTML(reviews)
}

function requestError(e, id) {
  console.log(e);

  dbPromise.then(function (db) {
    if (!db) {
      return;
    }

    var index = db.transaction('restaurant_detail_review')
      .objectStore('restaurant_detail_review');

    index.get(id)
      .then(function (restaurant_detail) {
        fillReviewsHTML(restaurant_detail)
      })
      .catch(e => console.log(e));

  });
}

/**
 * Create all reviews HTML and add them to the webpage.
 */
fillReviewsHTML = (reviews) => {

  const container = document.getElementById('reviews-container');
  const title = document.createElement('h3');
  title.innerHTML = 'Reviews';
  container.appendChild(title);

  if (!reviews) {
    const noReviews = document.createElement('p');
    noReviews.innerHTML = 'No reviews yet!';
    container.appendChild(noReviews);
    return;
  }
  const ul = document.getElementById('reviews-list');
  reviews.forEach(review => {
    ul.appendChild(createReviewHTML(review));
  });
  container.appendChild(ul);

}

/**
 * Create review HTML and add it to the webpage.
 */
createReviewHTML = (review) => {
  const li = document.createElement('li');
  li.tabIndex = "0";

  const name = document.createElement('p');
  name.innerHTML = review.name;
  li.appendChild(name);

  const date = document.createElement('p');
  date.innerHTML = review.date;
  li.appendChild(date);

  const rating = document.createElement('p');
  rating.innerHTML = `Rating: ${review.rating}`;
  li.appendChild(rating);

  const comments = document.createElement('p');
  comments.innerHTML = review.comments;
  li.appendChild(comments);

  return li;
}

/**
 * Add restaurant name to the breadcrumb navigation menu
 */
fillBreadcrumb = (restaurant = self.restaurant) => {
  const breadcrumb = document.getElementById('breadcrumb');
  const li = document.createElement('li');
  li.innerHTML = restaurant.name;
  breadcrumb.appendChild(li);
}

/**
 * Get a parameter by name from page URL.
 */
getParameterByName = (name, url) => {
  if (!url)
    url = window.location.href;
  name = name.replace(/[\[\]]/g, '\\$&');
  const regex = new RegExp(`[?&]${name}(=([^&#]*)|&|#|$)`),
    results = regex.exec(url);
  if (!results)
    return null;
  if (!results[2])
    return '';
  return decodeURIComponent(results[2].replace(/\+/g, ' '));
}

function newReview() {
  var reviewRestaurant = {
    "restaurant_id": this.restaurant.id,
    "name": document.getElementById('new-review-input-name').value,
    "rating": document.getElementById('new-review-input-rating').value,
    "comments": document.getElementById('new-review-input-comment').value
  };

  preNewReviewSend(reviewRestaurant);

  sendNewReview(`http://localhost:1337/reviews/`, reviewRestaurant)
    .then(data => postNewReviewSend(JSON.stringify(data)))
    .catch(error => console.log(error));

  return false;
}

function sendNewReview(url = ``, data = {}) {
  // Default options are marked with *
  return fetch(url, {
    method: "POST", // *GET, POST, PUT, DELETE, etc.
    headers: {
      "Content-Type": "application/json",
      // "Content-Type": "application/x-www-form-urlencoded",
    },
    body: JSON.stringify(data), // body data type must match "Content-Type" header
  }).then(response => response.json())
    .catch(error => {
      handlePostError(data);
      return error.message
    }); // parses response to JSON
}

function handlePostError(data) {
  // idb.open('restaurant_detail', IDB_VERSION_RESTAURANT, function(upgradeDb) {
  //   upgradeDb.createObjectStore('outbox', { autoIncrement : true, keyPath: 'id' });
  dbPromise.then(function (db) {
    var transaction = db.transaction('outbox', 'readwrite');
    return transaction.objectStore('outbox').put(data);
  });
  // .then(function () {
  //   console.log("Registering sync");

  //   if ('serviceWorker' in navigator) {
  //     navigator.serviceWorker.ready.then(function (registration) {
  //       console.log('A service worker is active:', registration.active);
  //       registration.sync.register('outbox').then(
  //         () => { console.log("Sync Registered"); }
  //       );
  //     }).catch(function (e) {
  //       console.error('Error during service worker ready:', e);
  //     });
  //   } else {
  //     console.log('Service workers are not supported.');
  //   }

  // });
}

function preNewReviewSend(reviewData) {
  //Add Review to DB
  dbPromise.then(function (db) {
    if (!db) return;

    var tx = db.transaction('restaurant_detail_review', 'readwrite');
    var store = tx.objectStore('restaurant_detail_review');

    store.get(self.restaurant.id)
      .then(function (restaurant_detail) {
        restaurant_detail.push(reviewData)
        store.put(restaurant_detail, self.restaurant.id);
      })
      .catch(e => console.log(e));

  });

  //Add Review To HTML
  const ul = document.getElementById('reviews-list');
  ul.appendChild(createReviewHTML(reviewData));
}

function postNewReviewSend(reviewData) {
  //Show Snackbar
  var sBar = document.getElementById("snackbar");
  sBar.className = "show";
  sBar.innerHTML = "Added your review";
  setTimeout(function () { sBar.className = sBar.className.replace("show", ""); }, 3000);

  //Reset Form
  document.getElementById('new-review-form').reset();
}