"use strict"

/*
Copyright 2017 Michael Jonker (http://openpoint.ie)
This file is part of The Yolk.
The Yolk is free software: you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation, either version 3 of the License, or
any later version.
The Yolk is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.
You should have received a copy of the GNU General Public License
along with The Yolk.  If not, see <http://www.gnu.org/licenses/>.
*/

angular.module('yolk').factory('tracks',['$timeout',function($timeout){

	var $scope;
	const tools = require('../../lib/tools/searchtools.js');
	const log = false;

	var tracks = function(scope){
		$scope = scope;
		this.source={
			type:false,
			name:false,
		}
	}
	tracks.prototype.resume=function(scope){
		$scope = scope;
		return this;
	}
	tracks.prototype.playingfrom = function(type){
		if(type === 'album'){
			$scope.tracks.source.type = 'Album';
			$scope.tracks.source.name = $scope.drawers.lib['album'][$scope.drawers.lib['album'].playing].title;
			$scope.tracks.source.id = $scope.drawers.lib['album'][$scope.drawers.lib['album'].playing].id;
			$scope.tracks.source.filter = $scope.pin.Filter;
		}else if(type === 'playlist'){
			$scope.tracks.source.type='Playlist';
			$scope.tracks.source.name = $scope.playlist.options.filter(function(op){
				return op.id === $scope.playlist.selected
			})[0].name;
			$scope.tracks.source.id = $scope.playlist.selected
		}else{
			$scope.tracks.source={};
		}
	}
	function getAll(playlist){
		if(log) console.log('tracks','getAll()');
		if($scope.tracks.playlistAll || playlist){
			if($scope.tracks.source.type==='Playlist'){
				var pl = $scope.tracks.source.id
			}else{
				var pl = $scope.playlist.selected
			}
			return $scope.playlist.activelist[pl];
		}
		if($scope.tracks.albumAll){
			return $scope.tracks.albumAll;
		}
		return $scope.search.memory.Title;
	}
	//find the next playing track
	var old_id
	tracks.prototype.next = function(){
		if(!$scope.lib.playing) return;
		if(log) console.log('tracks','next()');
		var all = getAll();
		if(!all||all.length < 2){
			$scope.lib.next = false;
			return;
		}
		var index = all.indexOf($scope.lib.playing.id);
		var next = all[index+1] ? index+1:0;
		var id = all[next];
		if(id === old_id) return;
		old_id = id;
		var search = {index:$scope.db_index,type:$scope.pin.pinned.sources.toString(),size:1,body:{query:{bool:{must:[
				{match:{id:id}}
		]}}}}
		if(id) $scope.db.fetch(search).then(function(data){
			if(!data.items.length) return;
			data.items[0].filter.pos = next;
			$scope.lib.next = data.items[0]; //set for background mode
			$timeout(function(){
				$scope.lib.next = data.items[0];
			})
		},function(err){
			console.error(err);
		})
	}

	//check if the playing track is contained in the active list
	//var old_index;
	tracks.prototype.isInFocus = function(){
		if(!$scope.lib.playing) return;
		if(log) console.log('tracks','isInFocus()');
		var self = this;
		var all = getAll($scope.playlist.active);
		//($scope.tracks.source.type==='Album'||($scope.tracks.source.type==='Playlist'&&!$scope.playlist.active))?$scope.tracks.nofocus = true:$scope.tracks.nofocus = false;
		var index = -1;
		if(all && $scope.pin.Page === 'title') index = all.indexOf($scope.lib.playing.id);
		$scope.lazy.getPos(index);
		$timeout(function(){
			$scope.lazy.playPos();
		})
		self.next();
	}


	//check if artist has remaining tracks and delete if not
	tracks.prototype.deleteArtist = function(artist){
		var must = $scope.tools.wrap.bool([{must:[
			{match:{deleted:{query:'no',type:'phrase'}}},
			{match:{artist:{query:artist,type:'phrase'}}}
		]}])
		$scope.db.client.search({index:$scope.db_index,type:'youtube,local,internetarchive',body:{query:must}},function(err,data){
			if(!data.hits.total){
				$scope.db.client.update({index:$scope.db_index,type:'artist',id:artist,refresh:true,body:{doc:{deleted:'yes'}}},function(err,data){
					if(err) console.err(err);
					$scope.search.changed.artist++;
					$scope.search.go(true,'track and artist deleted');
				})
			}
		})
	}
	//check if a track being deleted has left an album empty
	tracks.prototype.deleteAlbum = function(track){
		if(track.type !=='album' && track.type !=='artist' && track.type!=='youtube'){
			var query = $scope.tools.wrap.bool([{must:[
				{match:{album:{query:track.album,type:'phrase'}}},
				{match:{deleted:{query:'no',type:'phrase'}}}
			]}]);
			var types='local,internetarchive';
			$scope.db.fetchAll({index:$scope.db_index,type:types,body:{query:query}}).then(function(data){
				if(data.length) return;
				$scope.db.update({
					index:$scope.db_index,
					type:'album',
					id:track.album,
					refresh:true,
					body:{doc:{
						deleted:"yes",
						date:Date.now()
					}}
				}).then(function(data){
					if(data.result!=='noop') $scope.search.changed.album++;
				},function(err){
					console.error(err);
				})
			},function(err){
				console.error(err)
			})
		}
	}
	//delete a track
	tracks.prototype.delete = function(track,playing){
		if(log) console.log('tracks','delete()');
		if(playing) $scope.audio.next();

		if($scope.playlist.active){
			$scope.playlist.remove(track.id)
			return;
		}
		var id = track.id;
		var type = track.type;
		var self = this;

		if(type === 'album'||type==='artist'){
			if(type==='album'){
				var query = $scope.tools.wrap.bool([{must:[
					{match:{album:{query:id,type:'phrase'}}},
					{match:{deleted:{query:'no',type:'phrase'}}}
				]}]);
				var types='local,youtube,internetarchive'
			}
			if(type==='artist'){
				var query = $scope.tools.wrap.bool([{must:[
					{match:{artist:{query:id,type:'phrase'}}},
					{match:{deleted:{query:'no',type:'phrase'}}}
				]}])
				var types='local,youtube,internetarchive,album'
			}

			$scope.db.fetchAll({index:$scope.db_index,type:types,body:{query:query}}).then(function(data){
				if(!data.length) return;
				var bulk=[];
				var artists = []
				data.forEach(function(track){
					bulk.push({update:{_index:$scope.db_index,_type:track.type,_id:track.id}});
					bulk.push({doc:{deleted:'yes',bulk:'yes'}});
					if(type === 'album' && artists.indexOf(track.artist)===-1) artists.push(track.artist)
				})
				$scope.db.client.bulk({body:bulk,refresh:true},function(err,data){
					self.changed(data);
					if(err) console.error(err)
					if(type === 'album' && artists.length){
						artists.forEach(function(artist){
							self.deleteArtist(artist);
						})
					}
					$scope.search.go(true,'artist or album deleted');

				})
			},function(err){
				console.error(err)
			})
		}

		if($scope.drawers.lib['album'] && track.type==="album" && track.id === $scope.drawers.lib['album'].playing) $scope.tracks.source.filter = 'deleted';

		$scope.db.update({
			index:$scope.db_index,
			type:type,
			id:id,
			refresh:true,
			body:{doc:{
				deleted:"yes",
				date:Date.now()
			}}
		}).then(function(data){
			if(data.result!=='noop'){
				$scope.search.changed[type]++;
				self.deleteAlbum(track);
			}
			if(type!=='artist'&&type!=='album'){
				self.deleteArtist(track.artist);
			}
			$scope.search.go(true,'track deleted');
		},function(err){
			console.error(err);
		})
	}
	//undelete a track
	tracks.prototype.undelete = function(track,playing,bulk){
		var self = this;
		if(log) console.log('tracks','undelete()');
		if(track.name) track.type = 'artist'
		if(!track.type) track.type = 'album'

		if(track.type !== 'artist' && track.type !== 'album'){
			$scope.db.update({
				index:$scope.db_index,
				type:'artist',
				id:track.artist,
				refresh:true,
				body:{doc:{
					deleted:"no",
					bulk:'no',
				}}
			}).then(function(data){
				if(data.result!=='noop') $scope.search.changed.artist++;
			},function(err){
				console.error(err);
			})
			if(track.type !== 'youtube')$scope.db.update({
				index:$scope.db_index,
				type:'album',
				id:track.album,
				refresh:true,
				body:{doc:{
					deleted:"no",
					bulk:'no',
				}}
			}).then(function(data){
				if(data.result!=='noop') $scope.search.changed.album++;
			},function(err){
				console.error(err);
			})
		}

		if(bulk && (track.type === 'album'||track.type === 'artist')){
			if(track.type === 'album') var query = $scope.tools.wrap.bool([{must:[
				{match:{album:{query:track.id,type:'phrase'}}},
				{match:{bulk:{query:'yes',type:'phrase'}}}
			]}])
			if(track.type === 'artist') var query = $scope.tools.wrap.bool([{must:[
				{match:{artist:{query:track.id,type:'phrase'}}},
				{match:{bulk:{query:'yes',type:'phrase'}}}
			]}])
			$scope.db.fetchAll({index:$scope.db_index,type:'local,youtube,internetarchive',body:{query:query}}).then(function(data){
				if(!data.length) return;
				var bulk=[]
				var artist = [];
				data.forEach(function(track){

					bulk.push({update:{_index:$scope.db_index,_type:track.type,_id:track.id}});
					bulk.push({doc:{deleted:'no',bulk:'no'}});
					if(artist.indexOf(track.artist)===-1){
						artist.push(track.artist);
						bulk.push({update:{_index:$scope.db_index,_type:'artist',_id:track.artist}});
						bulk.push({doc:{deleted:'no',bulk:'no'}});
					}

				})
				$scope.db.client.bulk({body:bulk,refresh:true},function(err,data){
					self.changed(data);
				})
			},function(err){
				console.error(err)
			})
		}
		if($scope.drawers.lib['album'] && track.type==="album" && track.id === $scope.drawers.lib['album'].playing) $scope.tracks.source.filter = false;
		$scope.db.update({
			index:$scope.db_index,
			type:track.type,
			id:track.id,
			body:{doc:{
				deleted:"no",
				bulk:'no',
				date:Date.now()
			}}
		}).then(function(data){
			if(data.result!=='noop') $scope.search.changed[track.type]++;
			$scope.search.go(true,'track undeleted');
		},function(err){
			console.error(err);
		})
	}
	tracks.prototype.changed = function(data){
		data.items.forEach(function(item){
			var type = item.update._type;
			var r = item.update.result;

			if(type==='artist' && r!=='noop'){
				$scope.search.changed.artist++
			}else if(type==='album' && r!=='noop'){
				$scope.search.changed.album++
			}else if(r!=='noop'){
				$scope.search.changed.title++
			}
		})
	}
	return tracks;
}])
