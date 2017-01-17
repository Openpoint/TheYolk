"use strict";
/*
Fetch detailed artist and album information and process artwork
*/

const path=require('path');
const q = require('promise');
const os = require('os');
const request = require('request');
const sharp = require('sharp');
const smartcrop = require('smartcrop-sharp');
const {webContents,BrowserWindow,ipcMain} = require('electron');
const ft = require(path.join(process.Yolk.root,'core/lib/filetools'));
const fs = require('fs');
const homedir = process.Yolk.home;
const db = process.Yolk.db;
const db_index = process.Yolk.modules['musicPlayer'].config.db_index.index;
const mb_url="https://musicbrainz.org/ws/2/";
const mb_query="?fmt=json";
var options = {};
const headers = process.Yolk.modules["musicPlayer"].config.headers;
const artwork = {};

//Keep track of submissions to avoid duplication and limit lookup rates
const queue = {
	artist:{
	    ids:[]
	},
	album:{
	    ids:[]
	},
	musicbrainz:[],
    google:[],
    discoq:[],
    wikimedia:[]
};
process.Yolk.musicbrainzQ = queue.musicbrainz;

//create a browser window for face detection on images and scraping
let imageWindow = new BrowserWindow({
    parent:process.Yolk.win,
    show:false
});
var webPreferences = {
  nodeIntegration: true,
  webSecurity: true,
  preload: path.resolve(path.join(__dirname, 'scraper.js'))
}
//window for google scraping
let google = new BrowserWindow({
    parent:imageWindow,
    show:false,
    webPreferences:webPreferences
});
var google_item;
var googleItem = function(foo){
	google_item = foo;
}
google.webContents.on('dom-ready',function(){
	var item = google_item;
	google.webContents.executeJavaScript('firstClick('+item.google.index+')',true).then(function(data){
		new downart(data,item,true);
		googleBusy = false;
	},function(err){
		googleBusy = false;
		if(err === 'retry'){
			item.google.retry++
			if(item.google.retry < 5){
				queue.google.push(item);
				go('google');
			}
		}
		console.Yolk.error(err);
	})
})
//google.webContents.openDevTools();

//window for discoqs scraping
let discoqs = new BrowserWindow({
    parent:imageWindow,
    show:false,
    webPreferences:webPreferences
});
var discoq_item;
var discoqItem = function(foo){
	discoq_item = foo;
}
discoqs.webContents.on('dom-ready',function(){
	var item = discoq_item;
	discoqs.webContents.executeJavaScript('scrape()',true).then(function(data){
		discoqBusy = false;
		if(data && data.length){
			new downart(data,item);
		}else{
			//couldn't get the image from discoq, so try Google
			queue.google.push(item);
			go('google');
		}
	})
})
imageWindow.loadURL(`file://${__dirname}/artwork.html`);

/*
//close the window when application exits
ipcMain.on('chrome', function(event, data) {
	switch (data){
		case 'close':
			win.close();
		break;
	}
})
*/

//check if the artist or album is already in the database
artwork.exists=function(type,id){
    var promise = new q(function(resolve,reject){
        var exists =  db.client.get({
            index:db_index,
            type:type+'s',
            id:id
        },function(err,data){
            if(err){
                resolve(false);
            }else{
				if(data['_source'].artwork){
					resolve(true);
				}else{
					resolve(type);
				}

            }
        })
    })
    return promise;
}
//add an artist and album to the processing queue
var init = true;
artwork.add = function(track){
	if(queue.musicbrainz.length){
		init = false
	}else{
		init = true;
	}
	var both = [{
		id:track.artist,
		type:'artist'
	},{
		id:track.album,
		type:'album'
	}]

	both.forEach(function(type){
        //reject lookup for youtube video albums
		if(type.type === 'album' && !track.album){
			return;
		}
		var id = type.id;
		var type = type.type;
		if(queue[type].ids.indexOf(id) === -1){
	        queue[type].ids.push(id);
	        artwork.exists(type,id).then(function(exists){
	            if(!exists || exists === type){
					//console.Yolk.log(track.metadata[type]+': Adding to queue')
					if(type === 'album'){
						var query = mb_url+'release/'+id+mb_query+'&inc=recordings+url-rels+artists+artist-credits';
					}else{
						var query = mb_url+type+'/'+id+mb_query+'&inc=url-rels';
					}

	        		options.url = query;
					var item = {
	                    track:track,
	                    options:{
							headers:headers,
							url:query
						},
						needs:exists,
						type:type
	                }
					queue.musicbrainz.push(item);
	                go('musicbrainz');
					init = false;
	            }
	        })
	    }
	})
}
//the submission rate limiter
var timeout={
    musicbrainz:{
		to:false,
		delay:1000
	},
    google:{
		to:false,
		delay:1000
	},
    discoq:{
		to:false,
		delay:1000
	},
    wikimedia:{
		to:false,
		delay:500
	}
};
var action = {};
var go = function(type){
    if(timeout[type].to){
        return;
    }
    //console.Yolk.log(queue);
	if(type === 'musicbrainz' && init){
		timeout[type].to = setTimeout(function(){
			timeout[type].to = false;
			go('musicbrainz');
		},1000);
		return;
	}else{
		new action[type]();
	}

    timeout[type].to = setTimeout(function(){
        this.delay = timeout[type].delay;
        timeout[type].to = false;
        if(queue[type].length > 0){
            go(type);
        }
    },timeout[type].delay)
}
//submit query to musicbrainz server
action.musicbrainz = function(){

	if(queue.musicbrainz.length){
		var item = queue.musicbrainz.shift();
	}else{
		return;
	}

    request.get(item.options,function(error, response, body){
        if (!error && response.statusCode == 200) {
			try{
				body = JSON.parse(body);
                var links = body.relations;
			}
            catch(err){
				console.Yolk.warn(err);
				return;
			}
            var tosave = {}
			//console.Yolk.log(item);
			//console.Yolk.log(body);
            if(item.type === 'album'){
				tosave.metadata={
					title:body.title,
					artist:body['artist-credit'][0].name
				}
				tosave.id = body.id;
				tosave.artist = body['artist-credit'][0].artist.id
                tosave.tracks={};
				var count = 1;
				if(body.media && body.media.length){
					body.media.forEach(function(media){
						tosave.tracks['media-'+count]={};
						media.tracks.forEach(function(track){
	                        tosave.tracks['media-'+count][track.number]={
	                            title:track.recording.title,
	                            id:track.recording.id,
								artist:track['artist-credit'][0].artist.name
	                        }
	                    })
						count++;
					})
				}
                if(links.length){
                    links.forEach(function(link){
                        if (link.type === 'discoqs'){
                            item.discoq = link.url.resource+'/images';
                        }
                    })
                }
                if(body['cover-art-archive'] && body['cover-art-archive'].front){
                    new downart("http://coverartarchive.org/release/"+body.id+"/front",item);
                }else if(item.discoq){
                    queue.discoq.push({
                        discoq:item.discoq,
                        item:item
                    })
                    go('discoq')
                }else{
                    queue.google.push(item);
                    go('google')
                }

            }else{
                tosave.country = body.country;
				tosave.id = body.id;
				tosave.name = body.name;
                if(links.length){
                    tosave.links={};
    				//look for image and discoq links
                    var images = links.filter(function(object){
    					if(object.type === 'discogs'){
    						item.discoq = object.url.resource+'/images'
    					}
                        if(object.type === 'image'){
                            return true;
                        }
                        if(object.type === 'official homepage'){
                            tosave.links.home = object.url.resource;
                        }
                        if(object.type === 'official homepage'){
                            tosave.links.home = object.url.resource;
                        }
                        if(object.type === 'wikipedia'){
                            tosave.links.wikipedia = object.url.resource;
                        }
                    })
                    if(images.length){
    					//found links to wikimedia images
                        queue.wikimedia.push({
                            images:images,
                            item:item
                        })
                        go('wikimedia');
                        //new getart(images,item);
                    }else{

    					if(item.discoq){
                            queue.discoq.push({
                                discoq:item.discoq,
                                item:item
                            })
                            go('discoq');
    					}else{
                            queue.google.push(item)
                            go('google');
    					}
    				}
                }else{
					queue.google.push(item)
    				go('google');
    			}
            }
            //save item to database;
			if(!item.needs){
				var db_path = db_index+'.'+item.type+'s.'+item.track[item.type];

                //console.Yolk.log(tosave);
				tosave.date = Date.now();
				tosave.deleted = 'no';
	            db.put(db_path,tosave).then(function(data){

	            },function(err){
	                console.Yolk.warn(err);
	            })
			}

        }else{
            if(response){
				//console.Yolk.warn('retry MusicBrainz: '+item.track.metadata[item.type])
                queue.musicbrainz.push(item);
				go('musicbrainz');

            }
			if(error){
				console.Yolk.error(error);
				if(queue.musicbrainz.length){
					go('musicbrainz');
				}

			}
        }
    })
}
//find the artist image fom wikimedia API
action.wikimedia = function(images,item){
    var object = queue.wikimedia.shift();
	var item = object.item;
	var images = object.images;
	var track = item.track;
    this.options={
		headers:headers
	};
	this.id = track[item.type];
    var self = this;

    var count=0;
    images.forEach(function(image,index){
		//console.Yolk.log(image);
		count++
        var wikipage = image.url.resource.split('/');
        wikipage = wikipage[wikipage.length-1];
        self.options.url='https://commons.wikimedia.org/w/api.php?action=query&titles='+wikipage+'&prop=imageinfo&iiprop=url&format=json';
		////console.Yolk.log(track.metadata.artist+' : '+self.options.url)
        request.get(self.options,function(error, response, body){
            if(!error && response.statusCode == 200){
				try{
					body = JSON.parse(body);
				}
				catch(err){
					console.Yolk.warn(err);
					return;
				}

				Object.keys(body.query.pages).forEach(function(key){
					if(body.query.pages[key].imageinfo && body.query.pages[key].imageinfo[0] && body.query.pages[key].imageinfo[0].url){
						var src = body.query.pages[key].imageinfo[0].url;
	                	new downart(src,item);
					}else if(count === images.length){
						queue.google.push(item);
						go('google');
					}
				})
            }else if(count === images.length){
				queue.google.push(item);
				go('google');
			}
        })
    })
}
var discoqBusy;
action.discoq = function(){
	if(discoqBusy){
        return;
    }
	var object = queue.discoq.shift();
	var discoq = object.discoq;
	var item = object.item;
	discoqBusy = true;
	discoqItem(item)
    discoqs.loadURL(discoq);
}

//all else failed, so look for an image on google
var googleBusy;
action.google = function(){
    if(googleBusy){
        return;
    }
    googleBusy = true;
    var item = queue.google.shift();
	if(!item.google){
		item.google={
			index:0,
			retry:0
		};
	}
	if(item.type === 'album'){
		var search = encodeURI(item.track.metadata.artist.replace(/&/g,'')+' '+item.track.metadata.album.replace(/&/g,'')+' album cover').replace(/%20/g,'+');
		var url ='https://www.google.ie/search?q='+search+'&tbm=isch';
	}else{
		var search = encodeURI(item.track.metadata[item.type]).replace(/%20/g,'+');
		var url ='https://www.google.ie/search?q='+search+'&tbm=isch&tbs=isz:l,itp:photo';
	}
	googleItem(item);
	google.loadURL(url);
}

//download the artist or album image
var downart = function(src,item){

	var track2 = item.track;
	//console.Yolk.log(track2.metadata[item.type]+': Downloading art from '+src);
	var id = track2[item.type];
	var dest = path.join(homedir,'data/modules/musicPlayer/images/'+item.type+'s/'+id);
	if(!ft.isThere('dir',dest)){
		ft.mkdir(homedir,'data/modules/musicPlayer/images/'+item.type+'s/'+id);
	}
	var reduced = path.join(dest,'reduced.jpg');
	if(!ft.isThere('file',reduced)){
		var options = {
			url:src,
			encoding:null,
			headers:headers
		}
		request(options, function process(error, response, body) {
			if(!error && response.statusCode == 200){
				sharp(body).resize(600).toFile(reduced,function(err,info){
					if(!err){
						new proceed(reduced,dest,item)
					}else{
						console.Yolk.error(err);
					}
				});
			}else{
				if(item.google){
					item.google.index++;
					if(item.google.index > 4){
						return;
					}
				}
				queue.google.push(item)
				go('google');
			}
		})
	}else{
		new proceed(reduced,dest,item)
	}

	function proceed(src,thumb,item){
		var track = item.track;
		var face = "face('"+src+"')"
	    var foo = imageWindow.webContents.executeJavaScript(face,true);

		foo.then(function(data){
			var confidence;

			if (data.length){
				data.forEach(function(face){
					if(!confidence){
						confidence = face.confidence;
					}else if(face.confidence > confidence){
						confidence = face.confidence;
					}
				})
				data = data.filter(function(face){
					if(face.confidence === confidence){
						return true;
					}
				})
	            var data2 = data.map(function(face){
	                return {
	                    x:face.x,
	                    y:face.y,
	                    width:face.width,
	                    height:face.height,
						weight:1
	                }
	            })
				crop(data2);
	        }else{
				crop(false);
			}
			function crop(boost){

	            dest = path.join(thumb,'thumb.jpg');

				new applySmartCrop(src,dest,250,250,boost,item);
			}
		},function(err){
			messsage.send('err',err)
		})
	}
}

var applySmartCrop=function(src, dest, width, height,boost,item) {
	var track = item.track;
	var options = {
		width: width,
		height: height
	}
	if(boost){
		options.boost = boost;
	}
	try{
		smartcrop.crop(src, options).then(function(result) {
			var crop = result.topCrop;
			sharp(src)
			.extract({width: crop.width, height: crop.height, left: crop.x, top: crop.y})
			.resize(width, height)
			.toFile(dest);
			db.update(db_index+'.'+item.type+'s.'+track[item.type],{
				artwork:true
			})
			//console.Yolk.log(track.metadata[item.type]+': Image saved')
		});
	}
	catch(err){
		console.Yolk.err(err)
	}
}

module.exports = artwork;
