'use strict'


const {ipcMain} = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const jsmediatags = require("jsmediatags");

//var types=['.mp3','.wav','.ogg']; //allowed music file extensions

var types = require('../musicPlayer.js').settings.fileTypes;




var ft = {
	tracks:[],
	q:[],
	count:0,
	watchers:{}
}

ft.watch=function(dir){
	//dir = dir+'/';
	if(!this.watchers[dir]){
		var self=this;
		
		var watcher=fs.watch(dir, {encoding: 'buffer'}, (eventType, filename) => {
			
			if (filename){
				clearTimeout(self.tOut);
				self.tOut=setTimeout(function(){
					self.sender.send('log','refresh triggered');
					ft.verify(self.allTracks, ft.rootDir);					
				},3000)
				
			}
		});
		ft.watchers[dir]=watcher;
	}	
}


//Fetch all music files in directory into flat array of objects
ft.getDir=function(dir){
	//this.sender.send('log','getDir 1');
	var self = this;

	if(!fs.statSync(dir).isDirectory()){
		return;
	}
	
	
	
	fs.readdir(dir,function(err,files){		
		files.forEach(function(file){
			if(!fs.statSync(dir+'/'+file)){
				return;
			}
			if(fs.statSync(dir+'/'+file).isDirectory()){
				self.q.push(dir+'/'+file);	
				ft.watch(dir+'/'+file);	
			}else if(fs.statSync(dir+'/'+file).isFile()){				
				if(types.indexOf(path.extname(file).toLowerCase()) > -1){
					var id = crypto.createHash('sha1').update(dir+'/'+file).digest('hex');
					var track = {
						path:dir,
						file:file,
						id:id
					};					
					self.tracks.push({
						path:dir,
						file:file,
						id:id
					});
				}				
			}
		});
		if(self.q.length > 0){
			self.getDir(self.q.shift());			
		}else{
			
			
			if(self.init){

				self.loaded=self.tracks.length;
				self.allTracks = self.tracks;
								
				self.getTags();
			}else{

				var include = self.tracks.filter(function(current){
					return self.active.filter(function(current_b){
						return current_b.id == current.id
					}).length == 0
				});	
				
						
				var remove = self.active.filter(function(current){
					return self.tracks.filter(function(current_b){
						return current_b.id == current.id
					}).length == 0
				});					
				self.sender.send('verify',{
					remove:remove,
					include:include
				});
				if(remove.length){
					self.allTracks = self.allTracks.filter(function(track){
						return remove.indexOf(track) < 0;
					});
					
				}
				if(include.length){

					self.tracks = include;
					include.forEach(function(track){
						self.allTracks.push(track);
					});

					self.loaded=self.allTracks.length;					
					self.getTags();
				}


				
			}
		}					
	});			
}

//Parse the array of tracks and fetch meta-tags from file
ft.getTags=function(){
	
	var self = this;
	
	//self.sender.send('log','getTags 1');
	var send = function(data){
		self.sender.send('track', data);
	}
	if(self.tracks.length > 0){
		
		var track = self.tracks.shift();		
		var src = path.join(track.path,track.file);
		
		jsmediatags.read(src, {
			onSuccess: function(tag) {

				track.metadata = {};
				track.metadata.title = tag.tags.title || self.tracks[self.q2].file;
				track.metadata.artist =  tag.tags.artist;
				track.metadata.album =  tag.tags.album;

				self.count++;
				track.tagged = true;
				track.type = 'local';
				send({
					count:self.count,
					total:self.loaded,
					data:track
				});
				if(self.dBase){
					self.getTags();
				}
			},
			onError: function(error) {
				self.count++
				track.tagged = false;
				track.type = 'local';
				send({
					count:self.count,
					total:self.loaded,
					data:track
				});
				self.getTags();
			}
		});		
	}else{
		self.init = false;
		//self.sender.send('log','finished tagging');
		
	}
	
}

ft.verify = function(tracks, dir){
			
	this.dBase=true;
	this.init = false;
			
	this.active = tracks;
	this.q=[];
	this.tracks=[];
	this.count = 0;
	this.loaded=0;
	this.getDir(dir);
		
}

//event listeners
ipcMain.on('getDir', (event, dir) => {
	event.sender.send('log','getDir');
	ft.dBase=true;
	ft.init = true;
	ft.sender = event.sender;
	ft.count = 0;
	ft.getDir(dir);
	ft.loaded=0;
	
})

ipcMain.on('verify', (event, data) => {
console.log('verify')
	ft.sender = event.sender;
	for(var key in ft.watchers){
		ft.watchers[key].close();
	}
	ft.watchers = {};
	ft.watch(data.dir);
	ft.rootDir = data.dir;
	ft.allTracks = data.tracks;
	ft.verify(data.tracks, data.dir);
	
})

ipcMain.on('dBase', (event, ready) => {
	ft.dBase = ready
})

