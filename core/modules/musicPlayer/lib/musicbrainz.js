'use strict'

/* 
 * Establishes a queue of found tracks to submit to the MusicBrainz metadata lookup service. Lookup rate is limited by MusicBrainz as per their 
 * rules at http://musicbrainz.org/doc/XML_Web_Service/Rate_Limiting
 * 
 * */ 

const {ipcMain} = require('electron');
const request = require('request');
const path = require('path');
const dbase = require(path.join(process.cwd(),'core/lib/elasticsearch.js'));

var client;
dbase.then(function(db){
	var client = db.client;
})
	
var musicbrainz=function(){
	this.mbq=[];
	this.running = false;
	this.timeout = 20; //set the speed limit for MusicBrainz API calls at 3 per second ie 334
	this.url="http://musicbrainz.org/ws/2/recording/";
	this.query="?inc=artist-credits+releases&fmt=json";
	this.english=['AU','CA','IE','ZA','GB','US'];
	this.allTracks=[],
	this.options = {
		headers:{
			'User-Agent': 'Player/0.0.0 ( http://openpoint.ie )' //todo - automatically update version in UA
		}
	}
}

musicbrainz.prototype.process = function(tt,track,filter){
	var self = this;
	var releases =[]
	
	tt.releases.forEach(function(release){
		if(release.status ==='Official' && self.english.indexOf(release.country) > -1){
			releases.push(release);
		}
	});
	if (releases.length < 1){
		releases = tt.releases
	}
	if(releases[0]){
		track.metadata.artist=releases[0]['artist-credit'][0].name;			
		track.metadata.album = releases[0].title
		track.metadata.title = tt.title
	}

	self.sender.send('MBtrack',track,filter);
	self.allTracks.push(track);
	
	if(self.mbq.length > 0){
		setTimeout(function(){
			self.fetch();
			if(self.mbq.length > 0){
				self.running = true;
			}else{
				self.running = false;
			}
		},self.timeout);
	}else{
		self.running = false;
	}	
}

musicbrainz.prototype.fetch = function(){
	this.running = true;
	var self = this;
	var item = self.mbq.shift();
	var id = item.id;
	var track = item.meta;
	var filter = item.filter;
	
	this.options.url = this.url+id+this.query;
	
	request.get(this.options,function(error, response, body){
		if (!error && response.statusCode == 200) {
			
			// todo - try/catch for JSON parse
			var tt = JSON.parse(body);
			self.process(tt,track,filter);
		}else{
			self.sender.send('log',response.statusCode);
			self.sender.send('log',error);
		}		
	})		
}

musicbrainz.prototype.q = function(id,meta,filter){
	this.mbq.push({
		id:id,
		meta:meta,
		filter:filter
	});
	if(!this.running){
		this.fetch();
	}
}
if(!mbz){
	var mbz = new musicbrainz();		
}

//listen for incoming data
ipcMain.on('musicbrainz', (event, data) => {
	mbz.q(data.id,data.track,data.filter);
	mbz.sender = event.sender;
	event.sender.send('log',client)
	//filters[data.filter.funct](data.filter.value)
})
ipcMain.on('MBtrack', (event, data) => {
	event.sender.send('log','relay');
	event.sender.send('MBtrack',data.track);
})
