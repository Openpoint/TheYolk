"use strict"

const tools = require('./searchtools.js');
const mbtools = require('./musicbrainztools.js');
const request = require('request');
const mb_url="https://musicbrainz.org/ws/2/";
const q = Promise;

var flow = function(){
	this.busy = false;
	this.kill = false;
	this.mbq={
		album:[],
		youtube:[],
		other:[],
		mbz:[],
		artist:[],
		ytartist:[],
		fromalbum:[]
	};
}


flow.prototype.len = function(){
	var len = 0;
	var self = this;

	Object.keys(this.mbq).forEach(function(key){
		if(self.mbq.hasOwnProperty(key)) len+=self.mbq[key].length;
	});
	return len;
}
var opt = 'youtube';
flow.prototype.getTrack = function(){
	var art;
	var track;
	if(this.mbq.ytartist.length){
		art = this.mbq.ytartist.shift();
	}else if(this.mbq.album.length){
		track = this.mbq.album.shift();
	}else if(this.mbq.fromalbum.length){
		track = this.mbq.fromalbum.shift();
	}else if(this.mbq.artist.length){
		track = this.mbq.artist.shift();
	}else if(this.mbq.mbz.length){
		track = this.mbq.mbz.shift();
	}else{
		if(this.mbq.youtube.length && this.mbq.other.length){
			opt==='youtube' ? opt='other':opt='youtube';
			track = this.mbq[opt].shift();
		}else if(this.mbq.other.length){
			track = this.mbq.other.shift();
		}else{
			track = this.mbq.youtube.shift();
		}
	}
	return{art:art,track:track}
}
//add a track to the processing queue
flow.prototype.add = function(track,resub){
	var self = this;
	//strip out the "’" quotations which confuse the hell out of elasticsearch
	if(track.metadata){
		Object.keys(track.metadata).forEach(function(key){
			if(track.metadata.hasOwnProperty(key)) track.metadata[key] = tools.fix(track.metadata[key]);
		});
	}
	if(!this.mbdb.dupe(track)){
		//construct the musicbrainz query string
		if(track.type === 'album'){
			track.query = mb_url+'release/'+track.id+'?fmt=json&inc=recordings+artists+artist-rels+artist-credits+url-rels+release-groups+recording-level-rels+work-level-rels';
			this.mbq.album.unshift(track);
			//this.busy = false;
		}else if(track.type === 'artist'){
			track.query = mb_url+'artist/'+track.id+'?fmt=json&inc=url-rels';
			this.mbq.artist.push(track);
			//this.busy = false;
		}else if(track.type === 'youtube'){
			track = mbtools.musicbrainz(track);
			this.mbq.youtube.push(track);
		}else{
			track = mbtools.musicbrainz(track);
			if(track && track.musicbrainz_id){
				this.mbq.mbz.unshift(track);
			}else if(track){
				this.mbq.other.unshift(track);
			}
		}
		Resub()
	}else{
		Resub()
		//this.busy = false;
	}
	function Resub(){
		if(resub){
			self.mbq.fromalbum.push(resub);
			self.busy = false;
		}
	}
}
var rootfolders = {};
flow.prototype.isOnline = function(track){
	return new q(function(resolve,reject){
		if(track.online){
			resolve(track)
			return;
		}
		var root = track.download.split('/')
		root.pop();
		root = root.join('/')
		if(rootfolders[root] && rootfolders[root] >10){
			resolve(false)
			return;
		}
		var req = request.head(track.download,function(err,res){
			if(err || res.statusCode!=200){
				if(!rootfolders[root]) rootfolders[root]=0;
				rootfolders[root]++;
				resolve(false);
			}else{
				rootfolders[root]=0;
				track.online = true;
				resolve(track);
			}
		})
	})
}

//use network idle time to check if musicbrainz tracks are available
var qu = []
flow.prototype.bulkOnline = function(repeat,type,track){
	if(!type) var type;
	var self = this;
	if(!repeat){
		qu = []
		if(this.mbq.mbz.length){
			qu = this.mbq.mbz.filter(function(track){
				return (track.type === 'internetarchive' && !track.online);
			})
			type = 'mbz';
		}
		if(!qu.length){
			qu = this.mbq.other.filter(function(track){
				return (track.type === 'internetarchive' && !track.online);
			})
			type = 'other'
		}
		//console.Yolk.warn('renew: '+qu.length);
	}
	if(!qu.length) return;
	//if(repeat) console.Yolk.error('repeat: '+qu.length);
	if(!track) var track = qu.shift();
	this.isOnline(track).then(function(track2){
		if(!track2){
			self.mbq[type] = self.mbq[type].filter(function(t){
				return t.id !== track.id;
			})
		}else{
			self.mbq[type] = self.mbq[type].map(function(t){
				if(t.id === track2.id) return track2;
				return t;
			})
		}
		qu = qu.filter(function(t){
			return t.id !== track.id;
		})
		track = false;
		if(qu.length) track = qu.shift();
		if (self.busy) self.bulkOnline(true,type,track);
	})
}

module.exports = new flow();
