# THE YOLK - Better Stuff for the internet

THE YOLK is a modular browser for data driven applications.

Combining Electron, Elasticsearch and AngularJS affords developers a familiar environment and a framework which accepts modular, drop-in applications. 

This makes it easy to scrape and consume microservices, store and analyse results locally and present rich applications with a beautiful user interface.

Required: Node >= 7

Clone the repository and:

npm run theyolk OR

npm run theyolk-dev

### Packaging

The Yolk uses [electron-builder](https://github.com/electron-userland/electron-builder). Read the documentation and configure package.json in the root to suite your build environment. 

### Documentation

Not done yet - THE YOLK is very much in early ALPHA.

In summary, THE YOLK sets up an electron environment with a boot routine which detects modules by folder structure. The boot routine provides an Elasticsearch instance and the API allows for applications to create and access databasing and analytics by settings file.

### Applications

Player is The Yolk's first default application and a seriously fun music player.

It searches for music sources locally, on Youtube and the Internet Archive and then does it's magic by constructing rich metadata from Musicbrainz, Wikipedia, Discogs and other sources.

This is an endless, free, legal jukebox that provides an unique experience exploring and enjoying your musical taste.


![Image of Music PLayer](https://github.com/Openpoint/Yolk/blob/master/docs/resources/player.png)
