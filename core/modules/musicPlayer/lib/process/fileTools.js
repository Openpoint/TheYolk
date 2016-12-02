'use strict'


const {ipcMain} = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jsmediatags = require("jsmediatags");
const root = path.dirname(process.mainModule.filename);

var types = require('../../musicPlayer.js').settings.fileTypes;

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
	/*
	return;
	if(!this.watchers[dir]){
		var self=this;

		fs.watchFile(dir, function(curr,prev){
			console.log(curr);
			if (curr.mtime!==prev.mtime){
				console.log(dir);
				console.log(curr.mtime);
				console.log(prev.mtime);
				clearTimeout(self.tOut);
				self.tOut=setTimeout(function(){
					self.sender.send('log','refresh triggered');
					//ft.verify(self.allTracks, ft.rootDir);
					ft.verify(self.tracks, ft.rootDir);
				},3000)

			}
		});
		//ft.watchers[dir]=true;
		//console.log(ft.watchers)
	}
	*/
}
var watchtime;
var watchtime2;
function watcher(){
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
					ft.sender.send('log','refresh triggered');
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
				ft.sender.send('log','refresh triggered');
				ft.verify(ft.tracks, ft.rootDir);
			},2000);
		}

	});

}

//Fetch all music files in directory into flat array of objects
ft.getDir=function(dir){
	if(!ft.rootDir){
		ft.rootDir = dir;
	}
	ft.watch(dir);
	var self = this;

	if(!fs.statSync(dir).isDirectory()){
		return;
	}

	fs.readdir(dir,function(err,files){

		files.forEach(function(file){
			var pt = path.join(dir,file);

			if(!fs.statSync(pt)){
				return;
			}
			if(fs.statSync(pt).isDirectory()){
				self.q.push(pt);
				ft.watch(pt);
			}else if(fs.statSync(pt).isFile()){
				if(types.indexOf(path.extname(file).toLowerCase()) > -1){
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

			watcher();
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
				self.sender.send('verify',{
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

		jsmediatags.read(src, {
			onSuccess: function(tag) {
				track.metadata = {};
				track.metadata.title = tag.tags.title || self.tracks[self.q2].file;
				track.metadata.artist =  tag.tags.artist;
				track.metadata.album =  tag.tags.album;
				track.date = Date.now();

				track.tagged = true;
				track.type = 'local';

				self.sender.send('track', track);
				if(self.dBase){
					self.getTags();
				}
			},
			onError: function(error) {
				track.tagged = false;
				track.type = 'local';
				self.sender.send('track', track);
				if(self.dBase){
					self.getTags();
				}
			}
		});
	}else{

		self.sender.send('log','finished tagging');

	}

}

ft.verify = function(tracks, dir){

	this.verifyTracks = tracks;
	this.dBase=true;
	this.init = false;
	//this.active = tracks;
	this.q=[];
	this.tracks=[];
	this.loaded=0;


	this.getDir(dir);

}

//event listeners
ipcMain.on('getDir', (event, dir) => {

	//ft.dBase=true;
	ft.init = true;
	ft.sender = event.sender;
	ft.loaded=0;
	//ft.active = [];
	ft.tracks = [];
	ft.q = [];
	//ft.allTracks = [];


	ft.getDir(dir);
})

ipcMain.on('verify', function(event, data){
	ft.sender = event.sender;
	/*
	for(var key in ft.watchers){
		ft.watchers[key].close();
	}
	ft.watchers = {};
	*/
	//ft.watch(data.dir);
	ft.rootDir = data.dir;
	//ft.allTracks = data.tracks;

	ft.verify(data.tracks, data.dir);

})

ipcMain.on('dBase', (event, ready) => {
	ft.dBase = ready
})
