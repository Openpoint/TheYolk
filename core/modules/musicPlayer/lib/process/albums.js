"use strict";

const {ipcMain} = require('electron');
const elastic = process.Yolk.db;
const db_index = process.Yolk.modules['musicPlayer'].config.db_index.index;
const tools = require('../tools/searchtools.js');
//const flow = require('../tools/musicbrainzflow.js');
var bulk = [];
var albums = {};
var tracks  = {};
var tracksid  = {};

ipcMain.on('albums', function(event) {
	alb.compress().then(function(data){
		event.sender.send('albums',data);
	})
})

var albums = function(){}

albums.prototype.compress = function(){
	return new Promise(function(resolve,reject){
		var count = 0;
		albums = {};
		tracks  = {};
		tracksid  = {};
		var body = {query:tools.wrap.bool([{must:[
			{match:{'deleted':{query:'no',type:'phrase'}}},
			{match:{'youtube':{query:'no',type:'phrase'}}}
		]}])}
		elastic.fetchAll({index:db_index,type:'album',body:body}).then(function(data){
				data.forEach(function(album){
					var tit = album.metadata.artist+' - '+album.metadata.title
					if(!albums[tit]) albums[tit] = {albums:[],tracks:[],byid:[]}
					albums[tit].albums.push(album);
				})
				count++
				if(count===2) merge(albums,tracks).then(function(changed){resolve(changed)})
		},function(err){
			console.Yolk.error(err);
		})
		body = {query:tools.wrap.bool([{must:[
			{match:{'deleted':{query:'no',type:'phrase'}}},
			{match:{'musicbrainzed':{query:'yes',type:'phrase'}}}
		]}])}
		elastic.fetchAll({index:db_index,type:'local,internetarchive',body:body}).then(function(data){
			data.forEach(function(track){
				if(!tracks[track.album]) tracks[track.album] = [];
				tracks[track.album].push(track);
				tracksid[track.musicbrainz_id] = track;
			})
			count++
			if(count===2) merge(albums,tracks).then(function(changed){resolve(changed)})
		},function(err){
			console.Yolk.error(err);
		})
	})
	return compress_promise;
}
function merge(albums,tracks){
	return new Promise(function(resolve,reject){
		Object.keys(albums).forEach(function(key){
			albums[key].albums.forEach(function(album){
				if(tracks[album.id] && tracks[album.id].length) albums[key].tracks = albums[key].tracks.concat(tracks[album.id]);
			})
			if(!albums[key].tracks.length){
				albums[key].albums.forEach(function(album){
					bulk.push({update:{_index:db_index,_type:'album',_id:album.id}});
					bulk.push({doc:{deleted:'yes'}})
				})
				delete albums[key];
			}else if(albums[key].albums.length > 1){
				reduce(key);
			}
		})
		if(bulk.length){
			elastic.client.bulk({body:bulk,refresh:true},function(err,data){
				resolve(true);
			})
		}else{
			resolve(false);
		}
		bulk=[];
	})
}
function reduce(key,dalbums,dtracks){
	if(!albums[key].key) albums[key].key = [0,1];
	if(!dalbums) var dalbums = albums[key].albums;
	if(!dtracks) var dtracks = albums[key].tracks;
	var galbum = compare(dalbums,dtracks);
	if(!galbum) galbum = compare(dalbums,dtracks,true);
	if(galbum){
		albums[key].tracks = albums[key].tracks.map(function(t1){
			if(!galbum.tracks.some(function(t2){
				return t2.id === t1.musicbrainz_id
			})){
				galbum.tracks.some(function(t2){
					if(t2.artist.name === t1.metadata.artist && t2.title === t1.metadata.title){
						t1.musicbrainz_id = t2.id;
						bulk.push({update:{_index:db_index,_type:t1.type,_id:t1.id}});
						bulk.push({doc:{musicbrainz_id:t2.id}})
					}
				})
			}
			if(t1.album !== galbum.id){
				t1.album = galbum.id;
				bulk.push({update:{_index:db_index,_type:t1.type,_id:t1.id}});
				bulk.push({doc:{album:galbum.id}})
			}
			//albums[key].goodalbum = galbum;
			return t1;
		})
		albums[key].albums = albums[key].albums.filter(function(album){
			if(album.id === galbum.id){
				return true;
			}else if(!dalbums.some(function(da){return da.id  === album.id})){
				return true;
			}else{
				bulk.push({update:{_index:db_index,_type:'album',_id:album.id}});
				bulk.push({doc:{deleted:'yes'}});
				return false;
			}
		})
		if(albums[key].albums.length > 2) {
			albums[key].key = [0,1];
			retry(key,[0,1]);
		}
	}else if(albums[key].albums.length > 2) {
		var k = [];
		albums[key].key.forEach(function(i){
			k.push(i)
		})
		if(albums[key].key[1] < albums[key].albums.length-1) {
			albums[key].key[1]++
			retry(key,k);
		}else if(albums[key].key[0] < albums[key].albums.length-1){
			albums[key].key[1] = 0;
			albums[key].key[0]++
			retry(key,k);
		}
	}
}
function retry(key,k){
	albums[key].albums = albums[key].albums.sort(function(a,b){return a.tracks.length - b.tracks.length})
	var dalbums  = [albums[key].albums[k[0]],albums[key].albums[k[1]]]
	var dtracks = []
	dalbums.forEach(function(album){
		albums[key].tracks.filter(function(track){
			if(track.album === album.id) dtracks.push(track)
		})
	})
	reduce(key,dalbums,dtracks)
}
function compare(albums,tracks,titles){
	var goodalbum = false;
	albums.some(function(album,index){
		if(!tracks.some(function(track){
			return !album.tracks.some(function(atrack){
				if(titles){
					return track.musicbrainz_id === atrack.id||track.metadata.title === atrack.title
				}else{
					return track.musicbrainz_id === atrack.id
				}
			})
		})){
			//console.Yolk.say('Found--------------------------------------------------------------------------------------')
			goodalbum = albums[index]
			return true;
		}
		//console.Yolk.say('Nope--------------------------------------------------------------------------------------')
		return false;
	})
	return goodalbum;
}
var alb = new albums();
module.exports = alb;
