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
var kill = false;

const log = false;

//Keep track of submissions to avoid duplication and limit lookup rates
const queue = {
	artist:{
	    ids:[]
	},
	album:{
	    ids:[]
	},
    google:[],
    discogs:[],
    wikimedia:[]
};

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
		if(log) console.Yolk.log(data);
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

//window for discogs scraping
let discogs = new BrowserWindow({
    parent:imageWindow,
    show:false,
    webPreferences:webPreferences
});
var discogs_item;
var discogsItem = function(foo){
	discogs_item = foo;
}
discogs.webContents.on('dom-ready',function(){
	var item = discogs_item;
	discogs.webContents.executeJavaScript('scrape()',true).then(function(data){
		discogsBusy = false;
		if(data && data.length){
			new downart(data,item);
		}else{
			//couldn't get the image from discogs, so try Google
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


//add an artist and album to the processing queue
artwork.add = function(item){
	switch (item.type){
		case 'album':
			if(item.coverart){
				new downart("http://coverartarchive.org/release/"+item.id+"/front",item);
			}else if(item.discogs){
				queue.discogs.push(item);
				go('discogs')
			}else{
				queue.google.push(item);
				go('google')
			}
		break;
		case 'artist':
			if(item.images && item.images.length){
				//found link to wikimedia image
				queue.wikimedia.push(item)
				go('wikimedia');
				//new getart(images,item);
			}else{

				if(item.discogs){
					queue.discogs.push(item)
					go('discogs');
				}else{
					queue.google.push(item)
					go('google');
				}
			}
		break;
	}
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
    discogs:{
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

	new action[type]();

    timeout[type].to = setTimeout(function(){
        this.delay = timeout[type].delay;
        timeout[type].to = false;
        if(queue[type].length > 0){
            go(type);
        }
    },timeout[type].delay)
}


//find the artist image fom wikimedia API
action.wikimedia = function(){

	var item = queue.wikimedia.shift()
    this.options={
		headers:headers
	};

	this.id = item.id;
    var self = this;

    var count=0;
    item.images.forEach(function(image,index){

		count++
        var wikipage = image.split('/');
        wikipage = wikipage[wikipage.length-1];
        self.options.url='https://commons.wikimedia.org/w/api.php?action=query&titles='+wikipage+'&prop=imageinfo&iiprop=url&format=json';

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
var discogsBusy;
action.discogs = function(){
	if(discogsBusy){
        return;
    }

	var item = queue.discogs.shift();
	discogsBusy = true;
	discogsItem(item)
    discogs.loadURL(item.discogs);
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
		var search = encodeURI(item.artist.replace(/&/g,'')+' '+item.name.replace(/&/g,'')+' album cover').replace(/%20/g,'+');
		var url ='https://www.google.ie/search?q='+search+'&tbm=isch';
	}else{
		var search = encodeURI(item.name).replace(/%20/g,'+');
		var url ='https://www.google.ie/search?q='+search+'&tbm=isch&tbs=isz:l,itp:photo';
	}
	googleItem(item);
	google.loadURL(url);
}

//download the artist or album image
var downart = function(src,item){

	var dest = path.join(homedir,'data/modules/musicPlayer/images/'+item.type+'/'+item.id);
	if(!ft.isThere('dir',dest)){
		ft.mkdir(homedir,'data/modules/musicPlayer/images/'+item.type+'/'+item.id);
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
		//var track = item.track;
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

	var options = {
		width: width,
		height: height
	}
	if(boost){
		options.boost = boost;
	}
	try{
		smartcrop.crop(src, options).then(function(result) {
			if(kill){
				return;
			}
			var crop = result.topCrop;
			sharp(src)
			.extract({width: crop.width, height: crop.height, left: crop.x, top: crop.y})
			.resize(width, height)
			.toFile(dest);

			db.update({
				index:db_index,
				type:item.type,
				id:item.id,
				body:{doc:{
					artwork:true
				}}
			}).then(function(data){},function(err){
				console.Yolk.error(err);
			})
		});
	}
	catch(err){
		console.Yolk.err(err)
	}
}

ipcMain.on('kill', function(event,data) {
	if(data === 'revive'){
		kill = false;
		return;
	}
	kill = true;
	queue.artist={ids:[]};
	queue.album={ids:[]};
    queue.google=[];
    queue.discogs=[];
    queue.wikimedia=[];

})

module.exports = artwork;
