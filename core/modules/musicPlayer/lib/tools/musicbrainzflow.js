"use strict"

const tools = require('./searchtools.js');
var mbtools;
var mbdb;
const classical = require('./musicbrainzclassical.js');
classical.getClassical();
const request = require('request');
const cpu = require('./cpu.js');
const kill = require('./killer.js');
const mb_url="https://musicbrainz.org/ws/2/";
const q = require("bluebird");

var flow = function(){
	this.busy = false;
	this.resetq();
}
flow.prototype.inject=function(type,f){
	if(type === 'mbdb') mbdb = f;
	if(type === 'mbtools') mbtools = f;
}
flow.prototype.resetq=function(){
	this.mbq={
		album:[],
		youtube:[],
		other:[],
		mbz:[],
		artist:[],
		ytartist:[],
		fromalbum:[],
		classic:[]
	};
}

flow.prototype.len = function(reset,nobulk){
	var len = 0;
	var self = this;

	Object.keys(this.mbq).forEach(function(key){
		if(self.mbq.hasOwnProperty(key)){
			if(reset) self.mbq[key]=[];
			len+=self.mbq[key].length;
		}
	});
	if(reset) mbdb.bulk = [[]];
	if(nobulk) return len;
	return len+mbdb.bulk.length-1;
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
		if(this.mbq.youtube.length){
			opt==='youtube' ? opt='mbz':opt='youtube';
			track = this.mbq[opt].shift();
		}else{
			track = this.mbq.mbz.shift();
		}
	}else if(this.mbq.classic.length){
		track = this.mbq.classic.shift();
	}else{
		if(this.mbq.youtube.length && this.mbq.other.length){
			opt==='youtube'||opt==='mbz' ? opt='other':opt='youtube';
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
	if(!mbtools.dupe(track)){
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
			//track = mbtools.musicbrainz(track);
			if(track && track.musicbrainz_id){
				track = mbtools.musicbrainz(track);
				this.mbq.mbz.unshift(track);
			}else if(track){
				classical.get(track).then(function(track){
					track = mbtools.musicbrainz(track);
					if(track.classical){
						self.mbq.classic.unshift(track);
					}else{
						self.mbq.other.unshift(track);
					}
				})
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
var ocount = 0;
flow.prototype.isOnline = function(track){
	var self = this;
	var p = new Promise(function(resolve,reject){
		if(track.online){
			//console.log('Tracks being checked if online: DUPE');
			resolve(track)
			return;
		}

		var root = track.download.split('/')
		root.pop();
		root = root.join('/')
		if(rootfolders[root] && rootfolders[root] >10){
			kill.update('promises')
			resolve(false)
			return;
		}
		//console.log('Tracks being checked if online: '+ocount+' | '+track.id);
		ocount++
		var r = request.head(track.download,function(err,res){
			ocount--
			kill.update('promises')
			kill.update('requests')
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
		kill.requests.push(r)
	})
	kill.promises.push(p);
	return p;
}

//use network idle time to check if musicbrainz tracks are available
var qu = []
flow.prototype.bulkOnline = function(repeat,type,track){
	if(!this.busy || ocount > 20 || cpu.load > 85 || this.stopidle) return;
	if(!type) var type;
	var self = this;
	if(!repeat && !qu.length){
		//console.log('Heavy work: '+ocount);
		qu = []
		if(this.mbq.mbz.length){
			qu = this.mbq.mbz.filter(function(track){
				return (track.type === 'internetarchive' && !track.online);
			})
			type = 'mbz';
		}
		if(!qu.length){
			qu = this.mbq.classic.filter(function(track){
				return (track.type === 'internetarchive' && !track.online);
			})
			type = 'classic'
		}
		if(!qu.length){
			qu = this.mbq.other.filter(function(track){
				return (track.type === 'internetarchive' && !track.online);
			})
			type = 'other'
		}
	}
	if(!qu.length) return;

	if(!track) var track = qu.shift();
	if(!type){
		if(this.mbq.mbz.length){
			type = 'mbz'
		}else if(this.mbq.classic.length){
			type='classic'
		}else if(this.mbq.other.length){
			type='other'
		}
	}

	this.isOnline(track).then(function(track2){
		if(!type) return;
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
		self.bulkOnline(true,type,track);
	})
}

module.exports = new flow();
