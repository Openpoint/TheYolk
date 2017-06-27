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
const flow = require('../tools/musicbrainzflow.js');
const mbdb = require('../tools/musicbrainzdbase.js');
const mbtools = require('../tools/musicbrainztools.js');

flow.inject('mbdb',mbdb);
flow.inject('mbtools',mbtools);
mbtools.inject('mbdb',mbdb);
mbdb.inject('mbtools',mbtools);

const kill = require('../tools/killer.js');
const cpu = require('../tools/cpu.js');
const os = require('os');

const db_index = process.Yolk.modules.musicPlayer.config.db_index.index;
const message = process.Yolk.message;
const headers = process.Yolk.modules["musicPlayer"].config.headers;
const log = false; //turn on detailed logging for music lookups


var musicbrainz = function(){
	this.pace = 1000; //set the speed limit for MusicBrainz API calls
	mbtools.pace = this.pace;
}

//limit the submission rate to musicbrainz server to sane
musicbrainz.prototype.pacer=function(bounce){
	if(kill.kill){
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
	if(len) flow.bulkOnline();

	if(len && !flow.busy && cpu.load < 75){
		if(log) console.Yolk.say('*************************************************************************************************************************************** album: '+flow.mbq.album.length+' | mbz: '+flow.mbq.mbz.length+' | youtube:'+flow.mbq.youtube.length+' | classic:'+flow.mbq.classic.length+' | other:'+flow.mbq.other.length+' | ytartist:'+flow.mbq.ytartist.length+' | bulk:'+mbdb.bulk.length);
		var track = flow.getTrack();

		if(track.art) new self.getYtartist(track.art);


		if(track.track){
			track = track.track;
			if(track.rootdir && !mbdb.baddirs[track.rootdir]){
				mbdb.baddirs[track.rootdir] = 1;
			}
			if(track.rootdir && mbdb.baddirs[track.rootdir] > 10){
				self.pacer(true);
				return;
			}

			if(track.type === 'artist'||track.type === 'album'||track.type === 'youtube'){
				self.submit(track);
			}else if(track.type === 'local' || track.online){
				self.submit(track);
			}else{
				flow.busy = true;
				flow.stopidle = true;
				setTimeout(function(){
					if(kill.kill) return;
					flow.stopidle = false;
					flow.bulkOnline(true);
				},10)
				if(log) console.Yolk.say('Checking if track is available online')
				flow.isOnline(track).then(function(track){
					flow.stopidle = false;
					if(track){
						self.submit(track);
						flow.bulkOnline(true);
					}else{
						self.pacer(true);
					}
				})
			}
		}
	}
	this.timeout = setTimeout(function(){
		if(kill.kill) return;
		self.pacer();
	},self.pace);
}


//submit a query to musicbrainz server
musicbrainz.prototype.submit = function(track){
	if(kill.kill) return;

	var self = this;
	if(track.deleted === 'yes') console.Yolk.error('track is deleted')
	flow.busy = true;

	if(track.type!=='album' && track.type!=='artist'){
		mbdb.fromAlbum(track).then(function(message){ //first try to match the track to an existing album
			if(message === 'kill') return;
			if(!track.toalbum && message!=='track with that mbid already exists'){ //this is the tracks first pass, so try to find an album for it
				track.toalbum=1;
				if(log) console.Yolk.say(track.type.toUpperCase()+' -------------------------- '+track.metadata.artist+' : '+track.metadata.album+' : '+track.metadata.title+' | '+track.musicbrainz_id);
				mbtools.go(track,self);
			}else{ //this is the tracks second pass and no album was found, so mark it as deleted
				track.deleted = 'yes';
				track.deleted_reason = message;
				if(log) console.Yolk.say(message.toUpperCase()+' -------------------------- '+track.metadata.artist+' : '+track.metadata.album+' : '+track.metadata.title+' | '+track.musicbrainz_id);
				self.pacer(true);
				mbdb.saveTrack(track);
			}
		},function(track){ //track was successfully matched to an album
			if(log) console.Yolk.say('FROM ALBUM --------------------- '+track.metadata.artist+' : '+track.metadata.album+' : '+track.metadata.title);
			self.pacer(true);
		})
	}else{
		if(log) console.Yolk.say(track.type.toUpperCase()+' -------------------------- '+track.title+' | '+track.id);
		mbtools.go(track,self);
	}
}

//get details on an unknown youtube artist
musicbrainz.prototype.getYtartist = function(artist){
	if(log) console.Yolk.say('Looking for Youtube Artist: '+artist)
	flow.busy = true;
	var to = setTimeout(function(){
		if(kill.kill) return;
		flow.busy = false;
	},this.pace)
	var query = 'https://musicbrainz.org/ws/2/artist/?query=artist:"'+tools.queryBuilder(artist)+'"&fmt=json&limit=1'
	var options={
		headers:headers,
		url:query
	};
	var r = request.get(options,function(error, response, body){
		if(kill.kill){return};
		kill.update('requests');
		if (!error && response.statusCode == 200) {
			try{
				var tt = JSON.parse(body);
			}
			catch(err){
				var tt=false;
				console.Yolk.error(err);
				return;
			}

			if(tt.artists && tt.artists[0] && tt.artists[0].name){
				var newart = tools.fix(tt.artists[0].name);
			}else{
				if(log) console.Yolk.say('No artist found')
				message.send('mb_'+artist,artist);
				clearTimeout(to)
				flow.busy = false;
				return;
			}
			if(newart.split(' ').length === artist.split(' ').length || tools.strim(newart).indexOf(tools.strim(artist)) > -1) {
				if(log) console.Yolk.say('Found:'+newart)
				message.send('mb_'+artist,{key:artist,canon:newart})
			}else{
				if(log) console.Yolk.say('No artist found')
				message.send('mb_'+artist,artist)
			}
		}else{
			if(response.statusCode == 503){
				if(log) console.Yolk.say('retrying')
				flow.mbq.ytartist.unshift(artist);
			}else{
				if(log) console.Yolk.say('No artist found')
				message.send('mb_'+artist,artist);
			}
		}
		clearTimeout(to);
		flow.busy = false;
	})
	kill.requests.push(r);
}

var rootfolders = {};
var rec = [];
ipcMain.on('musicbrainz', function(event, tracks) {
	if(kill.kill) return;
	var buffer = [];
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
	})
})

ipcMain.on('musicbrainz_artist', function(event, artist) {
	if(kill.kill) return;
	flow.mbq.ytartist.push(artist);
})
ipcMain.on('kill', function(event,data) {
	if(mbz.timeout) clearTimeout(mbz.timeout);
	if(data === 'revive'){
		kill.kill = false;
		flow.busy = false;
		rootfolders={};
		rec = [];
		mbdb.getDupes().then(function(){
			//console.Yolk.log('restart')
			mbz.pacer()
		});
		return;
	}
	kill.Kill();
	flow.len(true);
	flow.resetq();
	mbdb.getDupes();
})
const mbz = new musicbrainz();
module.exports = mbz;
