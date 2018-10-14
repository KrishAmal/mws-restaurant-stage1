importScripts('./js/idb.js');

const PRECACHE = 'precache-v4';
const RUNTIME = 'runtime';

var IDB_VERSION_RESTAURANT = 2;

const PRECACHE_URLS = [
  '/',
  './index.html',
  './restaurant.html',
  './css/styles.css',
  './js/dbhelper.js',
  './js/main.js',
  './js/restaurant_info.js',
  './data/restaurants.json',
  './img/1.jpg',
  './img/2.jpg',
  './img/3.jpg',
  './img/4.jpg',
  './img/5.jpg',
  './img/6.jpg',
  './img/7.jpg',
  './img/8.jpg',
  './img/9.jpg',
  './img/10.jpg',

  'https://unpkg.com/leaflet@1.3.1/dist/leaflet.css'
];

//Install Service Worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(PRECACHE)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(self.skipWaiting())
  );
});

//Activate Service Worker
self.addEventListener('activate', event => {
  const currentCaches = [PRECACHE, RUNTIME];
  console.log("SW Activate init");
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return cacheNames.filter(cacheName => !currentCaches.includes(cacheName));
    }).then(cachesToDelete => {
      return Promise.all(cachesToDelete.map(cacheToDelete => {
        return caches.delete(cacheToDelete);
      }));
    }).then(() => self.clients.claim())
  );
});

// var cachedReviewFetch = new Promise(function(resolve, reject) {
//   sendOfflineReviews().then(function(success){
//     resolve("Success");
//   });
// });

function openDatabaseSw() {
  // If the browser doesn't support service worker,
  // we don't care about having a database
  if (!navigator.serviceWorker) {
    console.log("SW: Service worker not present");
    return Promise.resolve();
  }

  console.log("SW: Opening DB");
  return idb.open('restaurant_detail', IDB_VERSION_RESTAURANT, function (upgradeDb) {
    if (!upgradeDb.objectStoreNames.contains('restaurant_detail_review')) {
      upgradeDb.createObjectStore('restaurant_detail_review', {
        autoIncrement: false
      });
    }
    if (!upgradeDb.objectStoreNames.contains('outbox')) {
      upgradeDb.createObjectStore('outbox', { autoIncrement: true, keyPath: 'id' });
    }
    upgradeDb.createObjectStore('restaurant_detail', {
      autoIncrement: true
    });

  });
}

function sendNewReviewSw(url = ``, data = {}) {
  // Default options are marked with *
  console.log("Inside new review");
  return fetch(url, {
    method: "POST", // *GET, POST, PUT, DELETE, etc.
    headers: {
      "Content-Type": "application/json",
      // "Content-Type": "application/x-www-form-urlencoded",
    },
    body: JSON.stringify(data), // body data type must match "Content-Type" header
  }).then(response => response.json())
    .catch(error => error.message); // parses response to JSON
}

function sendOfflineReviewsSw() {
  console.log("Sync REgistered")

  var dbPromise = openDatabaseSw();
  console.log("SW: dbPromise:" + dbPromise);

  return dbPromise.then(function (db) {
    if (!db) {
      console.log("Db is Not loaded");
      return;
    }

    var index = db.transaction('outbox')
      .objectStore('outbox');

    console.log(index);
    index.getAll()
      .then(function (reviews) {
        reviews.forEach(review => {
          console.log(review);
          return sendNewReviewSw(`http://localhost:1337/reviews/`, review)
            .then(data => {
              console.log("SENT " + data);
              index.delete(data);
              return data;
            })
            .catch(error => console.error(error));
        });
      })
      .catch(e => console.log(e));
  });

}

//Sync
self.addEventListener('sync', event => {
  console.log("Event:" + event);
  if (event.tag == 'outbox') {
    console.log("Sync Started");
    event.waitUntil(new Promise(function (resolve, reject) {

      var dbPromise = openDatabaseSw();
      console.log("SW: dbPromise:" + dbPromise);

      return dbPromise.then(function (db) {
        if (!db) {
          console.log("Db is Not loaded");
          return;
        }

        var index = db.transaction('outbox')
          .objectStore('outbox');

        console.log(index);
        index.getAll()
          .then(function (reviews) {
            reviews.forEach(review => {
              console.log(review);
              // return sendNewReviewSw(`http://localhost:1337/reviews/`, review)
              //   .then(data => {
              //     console.log("SENT " + data);
              //     index.delete(data);
              //     return data;
              //   })
              //   .catch(error => console.error(error));
              resolve("Success");
              return fetch(`http://localhost:1337/reviews/`, {
                method: "POST", // *GET, POST, PUT, DELETE, etc.
                headers: {
                  "Content-Type": "application/json",
                  // "Content-Type": "application/x-www-form-urlencoded",
                },
                body: JSON.stringify(review), // body data type must match "Content-Type" header
              }).then(response => response.json())
                .catch(error => error.message); // parses response to JSON
            });
          })
          .catch(e => console.log(e));
      });
    }));
  } else {
    console.log("Event tag:" + event.tag);
  }
});

//Fetch Service Worker
self.addEventListener('fetch', event => {
  console.log("SW: Fetch");
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {

      if (cachedResponse) {
        return cachedResponse;
      }

      // IMPORTANT: Clone the response. A response is a stream
      // and because we want the browser to consume the response
      // as well as the cache consuming the response, we need
      // to clone it so we have two streams.
      var fetchRequest = event.request.clone();

      return fetch(fetchRequest).then(
        function (response) {
          // Check if we received a valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // IMPORTANT: Clone the response. A response is a stream
          // and because we want the browser to consume the response
          // as well as the cache consuming the response, we need
          // to clone it so we have two streams.
          var responseToCache = response.clone();

          caches.open(RUNTIME)
            .then(function (cache) {
              cache.put(event.request, responseToCache);
            });

          return response;
        }
      );

      // return caches.open(RUNTIME).then(cache => {
      //   return fetch(event.request).then(response => {
      //     return cache.put(event.request, response.clone()).then(() => {
      //       return response;
      //     });
      //   });
      // });

    })
  );
});