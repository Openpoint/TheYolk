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
const disam = ['official','stereo','original']
//const mb_query="inc=artist-credits+releases&fmt=json";
const mb_query="inc=artists+releases+tags+media&fmt=json";
const message = process.Yolk.message;
const elastic = process.Yolk.db
const meta = require('../process/meta.js');
const headers = process.Yolk.modules["musicPlayer"].config.headers;


var musicbrainz = function(){
	this.mbq=[];
	this.pace = 1000; //set the speed limit for MusicBrainz API calls
}

//format musicbrainz response into metadata for track submission to database
musicbrainz.prototype.process = function(tt,track){

	var self = this;
	function verify(item){
		track.metadata.title = item.title;
		track.metadata.artist=item.artist.name;
		track.artist=item.artist.id;
		if(track.type !== 'youtube'){
			track.metadata.album = item.release.title;
			track.album = item.release.id;
		}
		if(track.type === 'internetarchive'){
			elastic.update(db_index+'.internetarchivesearch.'+track.id,{musicbrainzed:'yes'}).then(function(data){},function(err){
				console.Yolk.warn(err);
			});
		}
		track.date = Date.now();
		track.musicbrainzed = 'yes';
		if(track.type === 'local'){
			elastic.update(db_index+'.'+track.type+'.'+track.id,track).then(function(data){
				message.send('refresh');
			},function(err){
				console.Yolk.warn(err);
			});
		}else{
			elastic.put(db_index+'.'+track.type+'.'+track.id,track).then(function(data){
				message.send('refresh');
			},function(err){
				console.Yolk.warn(err);
			});
		}

		meta.add(track);
		return true;
	};

	var stringCheck = function(title,type){
		//console.log(title);
		//console.log(track.metadata[type]);
		var metas = track.metadata[type].
		toLowerCase().
		replace(/([\(\)\{\}\[\]\:\,'"`’\¦\~\@\#\*])/g,'').
		replace(/_/g,' ').
		trim().
		split(' ');
		//var origTrack = metas.join(' ')

		var got = title.
		toLowerCase().
		replace(/([\(\)\{\}\[\]\:\,'"`’\¦\~\@\#\*])/g,'').
		replace(/_/g,' ').
		trim().
		split(' ');
		//var origIn = got.join(' ')

		var compare = got.filter(function(word){
			if(metas.indexOf(word) > -1){
				var index = metas.indexOf(word);
				metas.splice(index,1);
				return true;
			}
		})
		var rem = metas.length;
		if(compare.length === got.length && (rem < 5 || track.type === 'youtube')){

			return true;
		}else{
			if(rem === 0){
				return true;
			}
			return false;
		}
	}
	var checkRels = function(recording){
		if(!recording.releases){
			return false;
		}
		var Release;
		recording.releases.forEach(function(release){
			var date = new Date(release.date);
			date = Number(date);
			if(typeof date === 'number'){
				if(!Release || Release.date > date){
					Release = release;
					Release.date = date;
				}
			}
		})
		if(!Release){
			Release = recording.releases[0]
		}
		if(!Release){
			return false;
		}
		Release.date = new Date(Release.date);
		return {
			title:recording.title,
			release:Release,
			tags:recording.tags,
			artist:recording['artist-credit'][0].artist
		}
	}
	var checkRecs = function(recordings){

		if(track.type !== 'youtube'){

			function Filter(album){
				if(album){

					var foo = recordings.filter(function(recording){
						var Releases;
						if(recording.releases && recording.releases.length){
							Releases = recording.releases.filter(function(item){
								if(stringCheck(item.title,'album')){
									return true;
								}
							})
							if(Releases.length > 0){
								recording.releases = Releases;
								return true;
							}
						}
					})
					return foo;
				}else{
					var foo = recordings.filter(function(recording){
						if(recording.releases && recording.releases.length){
							return true;
						}
					})
					return foo;
				}

			}
			if(track.metadata.album){
				var result = Filter(true);
			}else{
				var result = Filter();
			}
			if(!result.length && track.metadata.album){
				result = Filter();
			}
		}else{
			var result = recordings.filter(function(recording){
				if(stringCheck(recording.title,'title')){
					return true;
				}
			})
			var result = result.filter(function(recording){
				if(recording['artist-credit'] && recording['artist-credit'][0]){
					var artist = recording['artist-credit'][0].artist.name;
					if(stringCheck(artist,'artist')){
						return true;
					}
				}else{
					return false;
				}

			})
		}
		if(result.length > 0){
			return checkRels(result[0]);
		}else{
			return false;
		}
	}

	if(track.musicbrainz_id && tt.releases && tt.releases.length){
		//has a musicbrainz id - so verify
		var recording = checkRels(tt);
		verify(recording);
	}else if(tt.recordings && tt.recordings.length){
		//found results for lookup search, so process each result
		var recordings = tt.recordings;
		var recording = checkRecs(recordings);
		if(!recording){
			if(track.type === 'internetarchive'){
				elastic.update(db_index+'.internetarchivesearch.'+track.id,{musicbrainzed:'fail'}).then(function(data){},function(err){
					console.Yolk.warn(err);
				});
			}
			return;
		}
		verify(recording)
	}
}

//submit query to musicbrainz server
musicbrainz.prototype.submit = function(track){
	track.deleted = 'no';

	new function(track2,self){
		var options={};
		options.headers = headers;

		//options.url = encodeURI(track2.query);
		options.url = track2.query;
		request.get(options,function(error, response, body){
			if (!error && response.statusCode == 200) {
				try{
					var tt = JSON.parse(body);
				}
				catch(err){
					var tt=false
					console.Yolk.warn(err);
				}
				if(tt){
					try{
						self.process(tt,track2);
					}
					catch(err){
						console.Yolk.error(err);
					}

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
						self.mbq.unshift(track2);
						self.pacer();
					}
				}
				if(error){
					console.Yolk.warn(error);
				}
			}

			message.send('progress',{
				type:'musicbrainz',
				size:self.mbq.length
			});
		})
	}(track,this)

}

//limit the submission rate to musicbrainz server to sane
var resume = false;
musicbrainz.prototype.pacer=function(){
	var self = this;
	if(this.timeout || (process.Yolk.musicbrainzQ && process.Yolk.musicbrainzQ.length)){
		if(process.Yolk.musicbrainzQ && process.Yolk.musicbrainzQ.length){
			resume = true;
			setTimeout(function(){
				self.pacer();
			},self.pace);
		}
		return;
	};

	if(resume){
		resume = false;
		setTimeout(function(){
			self.pacer();
		},self.pace);
		return;
	}

	if(this.mbq.length){
		var track = self.mbq.shift();
		self.submit(track);
		this.timeout = setTimeout(function(){
			self.timeout = false;
			self.pacer();
		},self.pace);
	}else{
		this.timeout = false;
	}
}


musicbrainz.prototype.add = function(track){
	var self = this;
	if(track.type === 'local'){
		go(track);
		return;
	}
	if(dupe(track)){
		return;
	}
	elastic.client.get({
		index:db_index,
		type:track.type,
		id:track.id
	},function(err,data){
		if(err){
			go(track);
		}
	});

	function go(track){
		if(track.type === 'youtube'){
			var artist = tools.sanitise(track.metadata.artist);
			artist = tools.uri(artist);
			var recording = tools.sanitise(track.metadata.title);
			recording = tools.uri(recording);
			if(track.canon_title){
				//var query = '?query=(artist:('+artist+') recording:'+recording+') AND (type:(album OR single OR ep OR other))';
				var query = '?query=artist:('+artist+') recording:'+recording;
			}else{
				//var query = '?query=(artist:('+artist+') AND recording:('+recording+')) AND (type:(album OR single OR ep OR other))';
				var query = '?query=artist:('+artist+') AND recording:('+recording+')';
			}
		}else{
			if(track.musicbrainz_id){
				track.query = mb_url+'recording/'+track.musicbrainz_id+'?'+mb_query;
			}else{
				if(track.type === 'local'){
					var title = tools.sanitise(track.metadata.title);
					title = tools.uri(title);
					var artist = tools.sanitise(track.metadata.artist);
					artist = tools.uri(artist);
					var album = tools.sanitise(track.metadata.album);
					album = tools.uri(album);
				}else{
					var title = tools.fuzzy(track.metadata.title,10);
					title = tools.uri(title);
					var artist = tools.fuzzy(track.metadata.artist,5);
					artist = tools.uri(artist);
					var album = tools.fuzzy(track.metadata.album);
					album = tools.uri(album);
				}

				var query = '?query=(artist:"'+(artist || "")+'" AND recording:('+(title || "");
				if(album){
					query = query + ') AND release:('+album
				}
				if(track.type!=='local'){
					query = query + ')) OR (artist:"'+(artist || "")+'" AND recording:('+(title || "");
					if(track.duration){
						query = query+') AND dur:'+track.duration+')'
					}else{
						query = query+'))'
					}
				}else{
					query = query+'))'
				}
			}
		}

		if(!track.query){
			track.query = mb_url+'recording/'+query+'&'+mb_query;
		}
		self.mbq.unshift(track);
		self.pacer()
	}
}
if(!mbz){
	var mbz = new musicbrainz();
}
module.exports = mbz;

//listen for incoming data
ipcMain.on('musicbrainz', function(event, track) {
	mbz.add(track);
})
var dupes = {};
function dupe(track){
	if(!dupes[track.type]){
		dupes[track.type] = []
	}
	if(dupes[track.type].indexOf(track.id) > -1){
		return true;
	}else{
		dupes[track.type].push(track.id);
		return false;
	}
}
