"use strict";

/*
Copyright 2017 Michael Jonker (http://openpoint.ie)
This file is part of The Yolk.
The Yolk is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
any later version.
The Yolk is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.
You should have received a copy of the GNU General Public License
along with The Yolk.  If not, see <http://www.gnu.org/licenses/>.
*/

/*
Fetch detailed artist and album information and process artwork
*/

const path=require('path');
const q = require("bluebird");
const os = require('os');
const request = require('request');
const {webContents,BrowserWindow,ipcMain} = require('electron');
const ft = require(path.join(process.Yolk.root,'core/lib/filetools'));
const cpu = require('../tools/cpu.js');
const fs = require('fs');
const child = require('child_process');
const message = process.Yolk.message;
const homedir = process.Yolk.home;
const elastic = require(path.join(process.Yolk.root,'core/lib/elasticsearch.js'));
const db_index = process.Yolk.modules['musicPlayer'].config.db_index.index;
const mb_url="https://musicbrainz.org/ws/2/";
const mb_query="?fmt=json";
var options = {};
const headers = process.Yolk.modules["musicPlayer"].config.headers;
const artwork = {};
const busy = {};
const faceq = [];
var facetime;
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
let metaWindow = new BrowserWindow({
	show:false,
	webPreferences:{
		partition:'meta'
	}
})
//create a browser window for face detection on images and scraping
let imageWindow = new BrowserWindow({
    parent:metaWindow,
    show:false,
	title:'image',
	webPreferences:{
		partition:'imageprocessor',
	}
});
imageWindow.loadURL(`file://${__dirname}/artwork.html`);
imageWindow.webContents.on('did-start-loading',function(){
	imageWindow.webContents.executeJavaScript('getPID()').then(function(pid){
		process.Yolk.priority(pid);
	})
});
imageWindow.webContents.on('dom-ready',function(){
	if(!thisface) return;
	var face = "face('"+thisface.src+"')";
	var foo = imageWindow.webContents.executeJavaScript(face,true);
	foo.then(function(t){
		fs.unlinkSync(thisface.src);
		t=t.replace(/^data:image\/jpeg;base64,/, "")
		fs.writeFile(thisface.dest,t,'base64',function (err) {
			if(err) console.Yolk.error(err)
			if(!err) message.send('newart',thisface);
		});
		busy.face = false;
	},function(err){
		busy.face = false;
		console.Yolk.error(err)
	})
})

//imageWindow.webContents.openDevTools();
var webPreferences = {
  nodeIntegration: true,
  webSecurity: true,
  preload: path.resolve(path.join(__dirname, 'scraper.js')),
  partition:'meta',
}
//window for google scraping
let google = new BrowserWindow({
    parent:metaWindow,
    show:false,
    webPreferences:webPreferences,
	title:'google'
});

var google_item;
var google_pid;
var googleItem = function(foo){
	google_item = foo;
}
google.webContents.on('did-start-loading',function(event, url){
	google.webContents.executeJavaScript('_Yolk_.getPID()').then(function(pid){
		if(pid !== google_pid){
			process.Yolk.priority(pid);
		}
		google_pid = pid;
	})
})
google.webContents.on('dom-ready',function(){
	var item = google_item;
	google.webContents.executeJavaScript('_Yolk_.firstClick('+item.google.index+')',true).then(function(data){
		downart(data,item,true);
		//google.webContents.loadURL('data:text/plain,');
		busy.google = false;

	},function(err){
		busy.google = false;
		if(err === 'retry'){
			item.google.retry++
			if(item.google.retry < 5){
				queue.google.push(item);
				go('google');
			}
		}
		//google.webContents.loadURL('data:text/plain,');
		console.Yolk.error(err);
	})
})
//google.webContents.openDevTools();

//window for discogs scraping
let discogs = new BrowserWindow({
    parent:metaWindow,
    show:false,
    webPreferences:webPreferences,
	title:'discogs'
});

var discogs_item;
var discogs_pid;
var discogsItem = function(foo){
	discogs_item = foo;
}
discogs.webContents.on('did-start-loading',function(event, url){
	discogs.webContents.executeJavaScript('_Yolk_.getPID()').then(function(pid){
		if(pid !== discogs_pid){
			process.Yolk.priority(pid);
		}
		discogs_pid = pid;
	})
})
discogs.webContents.on('dom-ready',function(){
	var item = discogs_item;
	discogs.webContents.executeJavaScript('_Yolk_.scrape()',true).then(function(data){
		busy.discogs = false;
		if(data && data.length){
			downart(data,item);
		}else{
			//couldn't get the image from discogs, so try Google
			queue.google.push(item);
			go('google');
		}
		//discogs.webContents.loadURL('data:text/plain,');
	},function(err){
		//discogs.webContents.loadURL('data:text/plain,');
		console.Yolk.error(err);
		busy.discogs = false;
		queue.google.push(item);
		go('google');
	})
})

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
	if(log) console.Yolk.log(item)
	switch (item.type){
		case 'album':
			if(item.coverart){
				downart("http://coverartarchive.org/release/"+item.id+"/front",item);
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
	if(log) console.Yolk.log('go:'+type)
    if(timeout[type].to) return;
	if(cpu.load < 40) action[type]();
    timeout[type].to = setTimeout(function(){
        //this.delay = timeout[type].delay;
        timeout[type].to = false;
        if(queue[type].length > 0){
            go(type);
        }
    },timeout[type].delay)
}


//find the artist image fom wikimedia API
action.wikimedia = function(){
	if(busy.wikimedia) return;
	busy.wikimedia=true;
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
	                	downart(src,item);
					}else if(count === item.images.length){
						queue.google.push(item);
						go('google');
					}
				})
            }else if(count === item.images.length){

				queue.google.push(item);
				go('google');
			}
			if(count === item.images.length) busy.wikimedia=false;
        })
    })
}

action.discogs = function(){
	if(busy.discogs) return;
	busy.discogs = true;
	var item = queue.discogs.shift();
	discogsItem(item)
    discogs.loadURL(item.discogs);
}

//all else failed, so look for an image on google

action.google = function(){
	if(busy.google) return;
	busy.google = true;
    //console.Yolk.log('google');
    var item = queue.google.shift();
	if(log) console.Yolk.log(item);
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
	if(log) console.Yolk.log(url);
	googleItem(item);
	google.loadURL(url);
}

//download the artist or album image
var thisface;
var downart = function(src,item){
	var dest = path.join(homedir,'data','modules','musicPlayer','images',item.type,item.id);
	if(!ft.isThere('dir',dest)){
		ft.mkdir(homedir,'data/modules/musicPlayer/images/'+item.type+'/'+item.id);
	}
	//var original = path.join(dest,path.basename(src));

	var thumb = path.join(dest,'thumb.jpg');

	if(ft.isThere('file',thumb)) fs.unlinkSync(thumb);

	var options = {
		url:src,
		encoding:null,
		headers:headers
	}
	request(src,{encoding: 'binary',followAllRedirects:true,headers:headers},function(err,res,body){
		if(!err && res.statusCode == 200){
			var original = path.join(dest,'original.'+res.headers['content-type'].split('/')[1]);
			if(ft.isThere('file',original)) fs.unlinkSync(original);
			fs.writeFile(original, body, 'binary', function (err) {
				if(err){
					console.Yolk.error(err)
				}else{
					proceed(original,thumb,item)
				}
			});
		}else{
			console.Yolk.error(res);
			if(!item.google.retry){
				queue.google.push(item);
				go('google');
			}
		}

	})

	function proceed(src,dest,item){
		clearTimeout(facetime);
		if(src) faceq.push({src:src,dest:dest,item:item});
		if(busy.face){
			facetime = setTimeout(function(){
				proceed();
			},1000);
			return;
		}
		busy.face = true;
		thisface = faceq.shift();
		imageWindow.webContents.reloadIgnoringCache();
		if(faceq.length) proceed();
	}
}
/*
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
*/
ipcMain.on('refreshart', function(event,data) {
	artwork.add(data)
})

module.exports = artwork;
