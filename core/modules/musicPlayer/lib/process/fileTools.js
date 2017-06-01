'use strict'


const {ipcMain} = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
var mm = require('musicmetadata');
const root = process.Yolk.root;
const classical = require('../tools/musicbrainzclassical.js');
const flow = require('../tools/musicbrainzflow.js');
const db = process.Yolk.db;
const db_index = process.Yolk.modules['musicPlayer'].config.db_index.index;
const message = process.Yolk.message;
const types = require('../../musicPlayer.js').settings.fileTypes;
var kill = false;

var ft = {
	tracks:[],
	q:[],
	count:0,
	watchers:{}
}

ft.watch=function(dir){

	if(!ft.watchers[dir]){
		ft.watchers[dir]={
			mtime:fs.statSync(dir).mtime
		}
	}
}
var watchtime;
var watchtime2;
function watcher(){
	clearTimeout(watchtime);
	watchtime = setTimeout(function(){
		watcher();
	},3000)

	Object.keys(ft.watchers).find(function(dir){
		try{
			var newt = fs.statSync(dir).mtime;
			var oldt = ft.watchers[dir].mtime;
			if(newt.toString() !== oldt.toString()){
				clearTimeout(watchtime2);
				console.log(dir);
				console.log(newt.toString());
				console.log(oldt.toString());
				ft.watchers[dir].mtime = newt;
				clearTimeout(watchtime);
				setTimeout(function(){
					watcher();
				},1000)
				watchtime2=setTimeout(function(){
					message.send('log','refresh triggered');
					ft.verify(ft.tracks, ft.rootDir);
				},2000)
				return true;
			}
		}
		catch(err){
			delete ft.watchers[dir];
			clearTimeout(watchtime2);
			clearTimeout(watchtime);
			setTimeout(function(){
				watcher();
			},1000)
			watchtime2=setTimeout(function(){
				message.send('log','refresh triggered');
				ft.verify(ft.tracks, ft.rootDir);
			},2000);
		}

	});

}

//Fetch all music files in directory into flat array of objects
ft.getDir=function(dir){

	if(!ft.rootDir)ft.rootDir = dir;
	//ft.watch(dir);
	var self = this;
	if(!fs.statSync(dir).isDirectory()) return;

	fs.readdir(dir,function(err,files){
		files.forEach(function(file){
			var pt = path.join(dir,file);
			if(!fs.statSync(pt)){
				return;
			}
			if(fs.statSync(pt).isDirectory()){
				self.q.push(pt);
				//ft.watch(pt);
			}else if(fs.statSync(pt).isFile()){
				if(types.indexOf(path.extname(file).replace('.','').toLowerCase()) > -1){
					var id = crypto.createHash('sha1').update(pt).digest('hex');
					var track = {
						path:dir,
						file:file,
						id:id,
						filter:{}
					};
					self.tracks.push(track);
				}
			}
		});

		if(self.q.length > 0){
			self.getDir(self.q.shift());
		}else{
			//watcher();
			if(self.init){
				self.loaded=self.tracks.length;
				self.getTags();
				self.init = false;
			}else{
				var include = self.tracks.filter(function(current){
					return self.verifyTracks.filter(function(current_b){
						return current_b.id == current.id
					}).length == 0
				});
				var remove = self.verifyTracks.filter(function(current){
					return self.tracks.filter(function(current_b){
						return current_b.id == current.id
					}).length == 0
				});
				message.send('verify',{
					remove:remove,
					include:include
				});
				if(include.length){
					self.tracks = include;
					self.loaded = include.length;
					self.getTags();
				}
			}
		}
	});
}

//Parse the array of tracks and fetch meta-tags from file
ft.getTags=function(){

	var self = this;
	/*
	var send = function(data){
		self.sender.send('track', data);
	}
	* */

	if(self.tracks.length > 0){

		var track = self.tracks.shift();
		track.deleted = 'no';
		var src = path.join(track.path,track.file);

		var readableStream = fs.createReadStream(src);
		var parser = mm(readableStream,{duration:true},function (err,data) {
			if(kill){
				return;
			}
			track.file = track.file.replace(/\#/g,'%23');
			if(err){
				track.tagged = false;
				track.type = 'local';
				console.Yolk.warn(track);

				db.client.create({
					index:db_index,
					type:'local',
					id:track.id,
					body:track
				},function(err,data){
					if(err){
						console.Yolk.warn(err);
					}
				})
				self.getTags();
			}else{

				track.metadata = {
					title:data.title || self.tracks[self.q2].file,
					artist:data.artist[0],
					album:data.album
				};
				track.duration = data.duration*1000;
				track.date = Date.now();
				track.tagged = true;
				track.type = 'local';
				db.client.create({
					index:db_index,
					type:'local',
					id:track.id,
					refresh:true,
					body:track
				},function(err,data){
					if(err){
						console.Yolk.error(err)
					}else{
						classical.get(track).then(function(info){
							flow.add(info||track);
						})
					}
				})
				self.getTags();
			}
			readableStream.close();
		});
	}else{
		//message.send('log','finished tagging');
	}

}

ft.verify = function(tracks, dir){
	this.verifyTracks = tracks;
	this.init = false;
	//this.active = tracks;
	this.q=[];
	this.tracks=[];
	this.loaded=0;
	this.getDir(dir);
}

//event listeners
ipcMain.on('getDir', (event, dir) => {
	ft.init = true;
	ft.loaded=0;
	ft.tracks = [];
	ft.q = [];
	ft.getDir(dir);
})

ipcMain.on('verify', function(event, data){
	ft.rootDir = data.dir;
	ft.verify(data.tracks, data.dir);
})
ipcMain.on('kill', function(event,data) {
	if(data === 'revive'){
		delete ft.rootDir;
		kill = false;
		return;
	}
	kill = true;
	clearTimeout(watchtime);
	ft.loaded = 0;
	ft.init = false;
	ft.tracks=[],
	ft.q=[],
	ft.count=0,
	ft.watchers={}
})
