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

function fuzzy(term){
	var fuzzy = [];
	term = term.trim();
	fuzzy = term.split(' ');
	fuzzy = fuzzy.join('~ ');
	fuzzy = fuzzy.trim();
	if(fuzzy[fuzzy.length -1] !== '~'){
		fuzzy = fuzzy+'~';
	}
	return fuzzy;
}
function strip(term){
	if(term){		
		term = term.replace(/[^\w\s]/gi,'');
		term=term.trim().toLowerCase();
		term = term.replace(/ +(?= )/g,'');
		if(term.length && term!==' ' && term !=='unknown'){
			return term;
		}else{
			return false;
		}
	}else{
		return false;
	}
}
var client;
dbase.then(function(db){
	var client = db.client;
})
	
var musicbrainz=function(){
	this.mbq=[];
	this.done = [];
	this.running = false;
	this.timeout = 500; //set the speed limit for MusicBrainz API calls at 1 per second
	this.url="http://musicbrainz.org/ws/2/";
	this.query="inc=artist-credits+releases&fmt=json";
	this.english=['AU','CA','IE','ZA','GB','US'];
	this.allTracks=[],
	this.options = {
		headers:{
			'User-Agent': 'Yolk MusicPlayer/0.0.0 ( http://openpoint.ie )' //todo - automatically update version in UA
		}
	}
	this.buffer = 0;
}

musicbrainz.prototype.process = function(tt,track,type){
	var self = this;
	
	function verify(item){

		var releases =[]
		item.releases.forEach(function(release){
			try{
				if(release.status && release.status.toLowerCase() ==='official' && self.english.indexOf(release.country) > -1){
					releases.push(release);
				}				
			}
			catch(err){
				self.sender.send('log',err);
			}

		});
		if (releases.length < 1 && type==='mid'){
			releases = item.releases
		}
		if(releases[0]){
			self.sender.send('log',type);
			
			track.metadata.artist=item['artist-credit'][0].artist.name;			
			track.metadata.album = releases[0].title;
			track.metadata.title = item.title;
			
			self.sender.send('track',track);
			
			return true;
		}else{
			return false;
		}		
	};
	
	
	if(type === 'mid' && tt.length){
		
		verify(tt);

		//self.sender.send('log',type);
		//self.sender.send('log',track);		
	}else if(tt.count){
		
		try {
			tt.recordings.forEach(function(recording){

				if(verify(recording)){
					throw "Found track metadata";				
				}
			});
		}
		catch(err){
			self.sender.send('log',err);
		}
		
		//self.sender.send('log',type);
		//self.sender.send('log','MusicBrainz: nothing found for track');
	}


	//self.allTracks.push(track);
	
}
musicbrainz.prototype.submit = function(track,options,type){

	var self = this;

	
	request.get(options,function(error, response, body){
		if (!error && response.statusCode == 200) {
			try{
				var tt = JSON.parse(body);
				self.process(tt,track,type);
			}
			catch(e){
				self.sender.send('log',e);
			}			
		}else{
			if(response){
				response = response.toJSON();
				if(response.statusCode === 503){
					self.q(track);
				}				
			}
			if(error){
				self.sender.send('log',error.toJSON());
			}
		}
		self.buffer--;
			
		self.sender.send('progress',{
			type:'musicbrainz',
			size:self.mbq.length+self.buffer
		});	
		
	})
}
musicbrainz.prototype.fetch = function(){
	//this.sender.send('log','Musicbrainz fetching track');
	
	var self = this;
	if(self.buffer < 100){
		var track = self.mbq.shift();
		if(!track){
			return;
		}
		if(track.musicbrainz_id){
			var id = track.musicbrainz_id;
			//self.sender.send('log','Musicbrainz id:'+id);
			this.options.url = this.url+'recording/'+id+'?'+this.query;
			this.type = 'mid';
			//self.sender.send('log',this.options.url);

		}else{

			var query = '?query=(';
			var title = strip(track.metadata.title);
			if(title){
				query = query+'recording:('+fuzzy(title)+') AND ';
			}
			var artist = strip(track.metadata.artist);
			if(artist){
				query = query+'artist:('+fuzzy(artist)+') AND ';
			}
			var album = strip(track.metadata.album);
			if(album){
				query = query+'release:('+fuzzy(album)+') AND ';
			}
			query = query+'status:"official")'
			//var query = '(recording:"us and them" AND status:"official" AND artist:"pink floyd" AND release:"dark side of the moon" )';
			this.options.url = this.url+'recording/'+query+'&'+this.query;
			this.type = 'search';
			//self.sender.send('log','Musicbrainz search:'+this.options.url);
		}

		self.submit(track,this.options,this.type);
		self.buffer++;		
	}
		
}

musicbrainz.prototype.pacer=function(){
	var self = this;
	if(this.mbq.length){
		this.running =true;
		setTimeout(function(){
			self.fetch();
			self.pacer();			
		},self.timeout);
	}else{
		this.running = false;
	}
}
musicbrainz.prototype.q = function(track){
	this.mbq.push(track);
	if(!this.running){
		this.pacer();
	}
}
if(!mbz){
	var mbz = new musicbrainz();		
}

//listen for incoming data
ipcMain.on('musicbrainz', (event, track) => {
	mbz.sender = event.sender;
	mbz.q(track);
	
	//filters[data.filter.funct](data.filter.value)
})
/*
ipcMain.on('MBtrack', (event, data) => {
	event.sender.send('log','relay');
	event.sender.send('MBtrack',data.track);
})
*/
