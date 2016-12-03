'use strict'

/*
 * Establishes a queue of found tracks to submit to the MusicBrainz metadata lookup service. Lookup rate is limited by MusicBrainz as per their
 * rules at http://musicbrainz.org/doc/XML_Web_Service/Rate_Limiting
 *
 * */

const {ipcMain} = require('electron');
const request = require('request');
const path = require('path');
const tools = require('../tools/searchtools.js');
const settings = require('../../musicPlayer.js');
const db_index = settings.db_index.index;
const mb_url="http://musicbrainz.org/ws/2/";
//const mb_query="inc=all&fmt=json";
const disam = ['official','stereo','original']
const mb_query="inc=artist-credits+releases&fmt=json";

var queries = [];
var elastic;



var musicbrainz=function(){
	this.mbq=[];
	this.done = [];
	this.running = false;
	this.timeout = 800; //set the speed limit for MusicBrainz API calls
	//this.url="http://musicbrainz.org/ws/2/";
	//this.query="inc=artist-credits+releases&fmt=json";
	//this.english=['AU','CA','IE','ZA','GB','US'];
	this.allTracks=[],
	this.options = {
		headers:{
			'User-Agent': 'Yolk MusicPlayer/0.0.0 ( http://openpoint.ie )' //todo - automatically update version in UA
		}
	}
	this.buffer = 0;
}

//format musicbrainz response into metadata for track submission to database
musicbrainz.prototype.process = function(tt,track){

	var self = this;
	//var releases =[];
	function verify(item){
		//found a  release, add data to track metadata
		if(item.releases[0]){

			if(item.tags && item.tags.length){
				var tags=[];
				item.tags.forEach(function(tag){
					if(tag.name){
						tags.push(tag.name);
					}
				});
				track.tags=tags;
			}
			track.metadata.artist=item['artist-credit'][0].artist.name;
			if(track.type !== 'youtube'){
				track.metadata.album = item.releases[0].title;
			}
			track.metadata.title = item.title;

			if(track.type === 'internetarchive'){
				elastic.update(db_index+'.internetarchivesearch.'+track.id,{musicbrainzed:'yes'}).then(function(data){},function(err){
					eRRor(self.sender,err);
				});
			}
			track.date = Date.now();
			elastic.put(db_index+'.'+track.type+'.'+track.id,track).then(function(data){},function(err){
				eRRor(self.sender,err);
			});
			self.sender.send('refresh');

			return true;
		}else{
			if(track.type === 'internetarchive'){
				elastic.update(db_index+'.internetarchivesearch.'+track.id,{musicbrainzed:'fail'}).then(function(data){},function(err){
					eRRor(self.sender,err);
				});
			}
			return false;
		}
	};
	var stringCheck = function(title,type){

		var meta = track.metadata[type].toLowerCase().trim().split(' ');
		var got = title.toLowerCase().trim().split(' ');
		var compare = got.filter(function(word){
			if(meta.indexOf(word) > -1){
				var index = meta.indexOf(word);
				meta.splice(index,1);
				return true;
			}
		})
		if(track.type === 'youtube'){
			var rem = 0;
		}else{
			var rem = meta.length;
		}
		if(compare.length === got.length && rem < 5){
			return true;
		}else{
			return false;
		}
	}
	var checkRecs = function(recordings){
		if(track.type !== 'youtube'){
			var result = recordings.filter(function(recording){
				recording.releases = recording.releases.filter(function(item){
					if(stringCheck(item.title,'album')){
						return true;
					}
				})
				if(recording.releases.length > 0){
					return true;
				}
			})
		}else{
			var result = recordings.filter(function(recording){
				if(stringCheck(recording.title,'title')){
					return true;
				}
			})
			var result = result.filter(function(recording){
				var artist = recording['artist-credit'][0].artist.name;
				if(stringCheck(artist,'artist')){
					return true;
				}
			})
			self.sender.send('log',result)
		}
		if(result.length > 0){
			return result;
		}else{
			return false;
		}
		//return recordings;
	}
	if(track.musicbrainz_id && tt.length){
		//has a musicbrainz id - so verify
		verify(tt);
	}else if(tt.count){
		//found results for lookup search, so process each result
		var recordings = tt.recordings;
		if(track.metadata.album){
			var recordings = checkRecs(recordings);
		}
		if(!recordings){
			return;
		}
		for(var i = 0; i < recordings.length; i++){
			if(verify(recordings[i])){
				i=tt.recordings.length;
			}
		}
	}
}

//submit query to musicbrainz server

musicbrainz.prototype.submit = function(track){
	track.deleted = 'no';
	//options.url = track.query;
	new function(track2,self){
		var options={};
		options.headers = self.options.headers

		options.url = encodeURI(track2.query);
		request.get(options,function(error, response, body){
			if (!error && response.statusCode == 200) {

				try{
					var tt = JSON.parse(body);
					self.process(tt,track2);
				}
				catch(err){
					eRRor(self.sender,err.message);
				}
			}else{
				if(response){
					response = response.toJSON();
					if(response.statusCode === 503){
						if(!track2.resub){
							track2.resub = 1;
						}else{
							track2.resub++;
						}
						self.q(track2);
					}
				}
				if(error){
					eRRor(self.sender,error);
				}
			}
			self.buffer--;

			self.sender.send('progress',{
				type:'musicbrainz',
				size:self.mbq.length+self.buffer
			});
		})
	}(track,this)

}

//process the queue of tracks into queries
musicbrainz.prototype.fetch = function(){
	var self = this;
	if(self.buffer < 100){
		var track = self.mbq.shift();
		if(!track){
			return;
		}
		/*
		if(track.musicbrainz_id){
			var id = track.musicbrainz_id;
			this.options.url = this.url+'recording/'+id+'?'+this.query;
			//this.type = 'mid';

		}else{
			this.options.url = this.url+'recording/'+track.query+'&'+this.query;
			this.type = 'search';
		}
		* */
		self.submit(track);
		self.buffer++;
	}
}

//limit the submission rate to musicbrainz server to sane
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

//add a track to the queue
musicbrainz.prototype.q = function(track){
	this.mbq.unshift(track);
	if(!this.running){
		this.pacer();
	}
}

if(!mbz){
	var mbz = new musicbrainz();
}

//listen for incoming data
ipcMain.on('musicbrainz', (event, track) => {

	elastic.client.get({
		index:db_index,
		type:track.type,
		id:track.id
	},function(err,data){
		if(err){
			if(track.type === 'youtube'){
				var artist = tools.sanitise(track.metadata.artist);
				var recording = tools.sanitise(track.metadata.title);
				if(track.canon_title){
					var query = '?query=(artist:('+artist+') recording:'+recording+') AND (type:(album OR single OR ep OR other))';
				}else{
					var query = '?query=(artist:('+artist+') AND recording:('+recording+')) AND (type:(album OR single OR ep OR other))';
				}
			}else{
				if(track.musicbrainz_id){
					track.query = mb_url+'recording/'+track.musicbrainz_id+'?'+mb_query;

				}else{
					var title = tools.fuzzy(track.metadata.title,10);
					//var title2 = tools.fuzzy(track.metadata.title);
					var artist = tools.fuzzy(track.metadata.artist,5);
					//var artist2 = tools.fuzzy(track.metadata.artist);
					var album = tools.fuzzy(track.metadata.album);
					var query = '?query=((artist:"'+(artist || "")+'" AND recording:('+(title || "");
					if(album){
						query = query + ') AND release:('+album
					}
					query = query + ')) OR (artist:"'+(artist || "")+'" AND recording:('+(title || "")+') AND dur:'+track.duration+')) AND status:official';
				}
			}

			if(!track.query){
				track.query = mb_url+'recording/'+query+'&'+mb_query;
			}
			if(queries.indexOf(track.query) === -1){
				mbz.sender = event.sender;
				queries.push(track.query);
				mbz.q(track);
			}
		}else{

		}
	})

})
function eRRor(sender,mess){
	try {
		throw Error(mess)
	}
	catch(err) {
		sender.send('error',err.stack);
	}
}
ipcMain.on('dBase', function(event, ready){
	if(ready){
		elastic = require(path.join(path.dirname(process.mainModule.filename),'core/lib/elasticsearch.js')).ready();
	}
})
