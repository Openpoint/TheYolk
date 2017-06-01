'use strict'

/*
 * Establishes a queue of found tracks to submit to the MusicBrainz metadata lookup service. Lookup rate is limited by MusicBrainz as per their
 * rules at http://musicbrainz.org/doc/XML_Web_Service/Rate_Limiting
 *
 * */
const classical = require('../tools/musicbrainzclassical.js');
const {ipcMain} = require('electron');
const request = require('request');
const path = require('path');
const tools = require('../tools/searchtools.js');
const flow = require('../tools/musicbrainzflow.js');
const mbdb = require('../tools/musicbrainzdbase.js');
const mbtools = require('../tools/musicbrainztools.js');
const cpu = require('../tools/cpu.js');
const os = require('os');
const q = Promise;
const db_index = process.Yolk.modules.musicPlayer.config.db_index.index;
const message = process.Yolk.message;
const elastic = process.Yolk.db
const headers = process.Yolk.modules["musicPlayer"].config.headers;
const log = true; //turn on detailed logging for music lookups


var musicbrainz = function(){
	this.pace = 1000; //set the speed limit for MusicBrainz API calls
	mbdb.pace = this.pace;
	mbdb.flow = flow;
	flow.mbdb = mbdb;
}

//limit the submission rate to musicbrainz server to sane
musicbrainz.prototype.pacer=function(bounce){

	if(flow.kill){
		clearTimeout(this.timeout);
		return;
	}
	var self = this;
	var len = flow.len();
	message.send('progress',{
		type:'musicbrainz',
		size:len
	});
	if(bounce){
		clearTimeout(this.timeout);
		flow.busy = false;
	}
	if(len && flow.busy && cpu.load < 75){
		flow.bulkOnline();
	}
	if(len && !flow.busy && cpu.load < 75){
		if(log) console.Yolk.say('*************************************************************************************************************************************** album: '+flow.mbq.album.length+' | mbz: '+flow.mbq.mbz.length+' | youtube:'+flow.mbq.youtube.length+' | other:'+flow.mbq.other.length+' | ytartist:'+flow.mbq.ytartist.length);
		var track = flow.getTrack();
		if(track.art) self.getYtartist(track.art);

		if(track.track){
			track = track.track;
			if(track.type === 'artist'||track.type === 'album'||track.type === 'youtube'){
				self.submit(track);
			}else if(track.type === 'local' || track.online){
				if(!track.isclassic || track.isclassic==='retry'){
					classical.get(track).then(function(info){
						self.submit(info);
					})
				}else{
					self.submit(track);
				}
			}else{
				flow.busy = true;
				flow.isOnline(track).then(function(track2){
					if(track2){
						classical.get(track2).then(function(info){
							self.submit(info);
						})
					}else{
						self.pacer(true);
					}
				})
			}
		}
	}
	this.timeout = setTimeout(function(){
		//if(!bounce) console.Yolk.say('busy: '+flow.busy)
		self.pacer();
	},self.pace);
}


//submit a query to musicbrainz server
musicbrainz.prototype.submit = function(track){
	if(flow.kill) return;
	var self = this;
	track.deleted = 'no';
	flow.busy = true;

	if(track.type!=='album' && track.type!=='artist'){
		mbdb.fromAlbum(track).then(function(message){ //first try to match the track to an existing album
			if(message === 'kill') return;
			if(!track.toalbum && message!=='track with that mbid already exists'){ //this is the tracks first pass, so try to find an album for it
				track.toalbum=1;
				if(log) console.Yolk.say(track.type.toUpperCase()+' -------------------------- '+track.metadata.artist+' : '+track.metadata.album+' : '+track.metadata.title+' | '+track.musicbrainz_id);
				mbdb.go(track,self);
			}else{ //this is the tracks second pass and no album was found, so mark it as deleted
				track.deleted = 'yes';
				track.deleted_reason = message;
				if(log) console.Yolk.say(message.toUpperCase()+' -------------------------- '+track.metadata.artist+' : '+track.metadata.album+' : '+track.metadata.title+' | '+track.musicbrainz_id);
				self.pacer(true);
				mbtools.saveTrack(track);
			}
		},function(track){ //track was successfully matched to an album
			if(log) console.Yolk.say('FROM ALBUM --------------------- '+track.metadata.artist+' : '+track.metadata.album+' : '+track.metadata.title)
			self.pacer(true);
		})
	}else{
		if(log) console.Yolk.say(track.type.toUpperCase()+' -------------------------- '+track.title+' | '+track.id);
		mbdb.go(track,self);
	}
}

//get details on an unknown youtube artist
musicbrainz.prototype.getYtartist = function(artist){
	var query = 'https://musicbrainz.org/ws/2/artist/?query=artist:"'+tools.queryBuilder(artist)+'"&fmt=json&limit=1'
	var options={
		headers:headers,
		url:query
	};
	request.get(options,function(error, response, body){
		if(flow.kill){return;}
		if (!error && response.statusCode == 200) {
			try{
				var tt = JSON.parse(body);
			}
			catch(err){
				var tt=false;
				console.Yolk.error(err);
				return;
			}
			if(log) console.Yolk.log(tt)
			if(tt.artists && tt.artists[0] && tt.artists[0].name){
				var newart = tools.fix(tt.artists[0].name);
			}else{
				message.send('mb_'+artist,false);
				return;
			}
			if(newart.split(' ').length === artist.split(' ').length || tools.strim(newart).indexOf(tools.strim(artist)) > -1) {
				message.send('mb_'+artist,{key:artist,canon:newart})
			}else{
				message.send('mb_'+artist,false)
			}
		}else{
			if(response.statusCode == 503){
				flow.mbq.ytartist.unshift(artist);
			}else{
				message.send('mb_'+artist,false);
			}
		}
	})
}

var buffer=[];
var rootfolders = {};
var rec = [];
var requests = [];
var block = 0
ipcMain.on('musicbrainz', function(event, tracks) {
	if(flow.kill) return;
	tracks.forEach(function(track){
		if(rec.indexOf(track.id) === -1){
			rec.push(track.id)
			if(track.musicbrainz_id){
				buffer.unshift(track)
			}else{
				buffer.push(track)
			}
		}
	})

	buffer.forEach(function(track){
		flow.add(track);
		/*
		if(track.type === 'internetarchive'){
			var root = track.download.split('/')
			root.pop();
			root = root.join('/')
			if(rootfolders[root] && rootfolders[root] >10){
				return;
			}
			var req = request.head(track.download,function(err,res){
				if(flow.kill) return;
				if(err || res.statusCode!=200){
					if(!rootfolders[root]) rootfolders[root]=0;
					rootfolders[root]++;
				}else{
					rootfolders[root]=0;
					classical.get(track).then(function(info){
						flow.add(info||track);
					})
				}
			})
			requests.push(req);
		}else if(track.type !== 'youtube'){
			classical.get(track).then(function(info){
				flow.add(info||track);
			})
		}else{
			flow.add(track);
		}
		*/
	})
	buffer=[];
})

ipcMain.on('musicbrainz_artist', function(event, artist) {
	if(flow.kill) return;
	flow.mbq.ytartist.push(artist);
})
ipcMain.on('kill', function(event,data) {
	if(mbz.timeout) clearTimeout(mbz.timeout);
	if(data === 'revive'){
		flow.kill = false;
		flow.busy = false;
		rootfolders={};
		rec = [];
		mbdb.getDupes().then(function(){
			console.Yolk.error('PACER: '+flow.kill)
			mbz.pacer()
		});
		return;
	}
	flow.kill = true;
	mbz.progress = 0;
	requests.forEach(function(req){
		req.abort();
	})
})
const mbz = new musicbrainz();
module.exports = mbz;
